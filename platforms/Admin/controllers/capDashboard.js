const AffordableOrder = require("../../affordable-website/models/AffordableOrder");
const MidrangeOrder = require("../../midrange-website/models/MidrangeOrder");
const LuxuryOrder = require("../../luxury-website/models/luxury_orders");

const Vendor = require("../../Vendor/models/Vendor");
const Manufacturer = require("../../manufacturer-portal/models/Manufacturer");

// OPTIONAL: if you have separate user models for each website, plug them here:
// const AffordableUser = require("../../affordable-website/models/User");
// const MidrangeUser = require("../../midrange-website/models/User");
// const LuxuryUser = require("../../luxury-website/models/User");

// OPTIONAL: tickets model (if exists)
// const Ticket = require("../../support/models/Ticket");

const toInt = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const getFromDate = (days) => {
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
};

const normalizeStatus = (s) => {
  const x = String(s || "").toLowerCase().trim();
  if (x.includes("deliver")) return "delivered";
  if (x.includes("out_for_delivery") || x.includes("out for delivery")) return "out_for_delivery";
  if (x.includes("in_transit") || x.includes("in-transit") || x.includes("transit")) return "in_transit";
  if (x.includes("ship")) return "shipped";
  if (x.includes("pack")) return "packed";
  if (x.includes("confirm")) return "confirmed";
  if (x.includes("approve")) return "approved";
  if (x.includes("place")) return "placed";
  if (x.includes("pending")) return "pending";
  if (x.includes("cancel")) return "cancelled";
  return x || "pending";
};

// ✅ correct revenue extraction for your schemas (Affordable + Luxury have pricing.total)
const getAmount = (o) => {
  return Number(
    o?.pricing?.total ??
      o?.pricing?.grandTotal ??
      o?.totals?.grandTotal ??
      o?.totals?.total ??
      o?.grandTotal ??
      o?.totalAmount ??
      o?.total ??
      o?.amount ??
      0
  );
};

const getCustomerName = (o) => {
  // affordable has userDetails.name
  if (o?.userDetails?.name) return String(o.userDetails.name);

  // luxury has customerId.firstName + lastName (populated sometimes)
  const fn = o?.customerId?.firstName || o?.user?.firstName || o?.customer?.firstName;
  const ln = o?.customerId?.lastName || o?.user?.lastName || o?.customer?.lastName;
  const full = [fn, ln].filter(Boolean).join(" ").trim();
  if (full) return full;

  // fallback
  if (o?.userDetails?.email) return String(o.userDetails.email);
  if (o?.customerId?.email) return String(o.customerId.email);

  return "";
};

async function fetchOrders(Model, from) {
  const q = from ? { createdAt: { $gte: from } } : {};
  return Model.find(q)
    .select(
      "_id orderNumber status website createdAt updatedAt pricing totals grandTotal totalAmount total amount userDetails customerId userId user customer"
    )
    .lean();
}

const normalizeOrder = (o, website) => ({
  _id: String(o._id),
  orderNumber: o.orderNumber || "",
  website, // affordable | midrange | luxury
  status: normalizeStatus(o.status),
  totalAmount: getAmount(o),
  customerName: getCustomerName(o),
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
});

exports.getCAPDashboard = async (req, res) => {
  try {
    // query: ?days=30&recentOrders=5
    const daysRaw = req.query.days;
    const recentLimit = Math.min(20, Math.max(1, toInt(req.query.recentOrders, 5)));

    let days = 30;
    let from = null;

    if (String(daysRaw).toLowerCase() === "all") {
      days = null;
      from = null;
    } else {
      days = daysRaw ? Math.min(365, Math.max(1, toInt(daysRaw, 30))) : 30;
      from = getFromDate(days);
    }

    // ✅ orders (3 models)
    const [a, m, l] = await Promise.all([
      fetchOrders(AffordableOrder, from),
      fetchOrders(MidrangeOrder, from),
      fetchOrders(LuxuryOrder, from),
    ]);

    const mergedOrders = [
      ...a.map((o) => normalizeOrder(o, "affordable")),
      ...m.map((o) => normalizeOrder(o, "midrange")),
      ...l.map((o) => normalizeOrder(o, "luxury")),
    ];

    // sort by updatedAt (best for status updates)
    mergedOrders.sort((x, y) => {
      const ax = new Date(x.updatedAt || x.createdAt || 0).getTime();
      const by = new Date(y.updatedAt || y.createdAt || 0).getTime();
      return by - ax;
    });

    const totalOrders = mergedOrders.length;

    // ✅ revenue
    const totalPayments = mergedOrders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

    // ✅ active orders (anything not delivered/cancelled)
    const activeOrders = mergedOrders.filter(
      (o) => !["delivered", "cancelled"].includes(o.status)
    ).length;

    // ✅ customers count
    // If you have separate user models, replace this with DB counts.
    // For now: unique customerName OR userId/customerId fallback
    const customerKeys = new Set();
    for (const raw of [...a, ...m, ...l]) {
      const key =
        raw?.userId ||
        raw?.customerId?._id ||
        raw?.customerId ||
        raw?.userDetails?._id ||
        raw?.userDetails?.email ||
        null;
      if (key) customerKeys.add(String(key));
    }
    const totalCustomers = customerKeys.size;

    // ✅ manufacturers + pending approvals
    const [totalManufacturers, totalVendors, pendingApprovals] = await Promise.all([
      Manufacturer.countDocuments({}),
      Vendor.countDocuments({}),
      // adjust these conditions to your schema
      Manufacturer.countDocuments({
        $or: [{ status: "pending" }, { isVerified: false }],
      }),
    ]);

    // ✅ tickets (optional)
    // If you have Ticket model, uncomment and update fields.
    // const [totalTickets, recentTickets] = await Promise.all([
    //   Ticket.countDocuments({ status: { $ne: "resolved" } }),
    //   Ticket.find({})
    //     .sort({ createdAt: -1 })
    //     .limit(3)
    //     .select("ticketNumber subject priority status createdAt")
    //     .lean(),
    // ]);

    const totalTickets = 0;
    const recentTickets = [];

    // ✅ recent orders for CAP UI
    const recentOrders = mergedOrders.slice(0, recentLimit).map((o) => ({
      id: o._id,
      orderNumber: o.orderNumber || o._id,
      customerName: o.customerName || "—",
      totalAmount: o.totalAmount || 0,
      status: o.status,
      website: o.website,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      data: {
        rangeLabel: days ? `Last ${days} days` : "All Time",

        // cards (your CAPDashboard expects these)
        totalManufacturers,
        totalVendors,
        totalCustomers,
        totalOrders,
        totalTickets,
        totalPayments,

        pendingApprovals,
        activeOrders,

        // lists
        recentOrders,
        recentTickets,
      },
      meta: {
        days: days ?? "all",
        recentOrders: recentLimit,
      },
    });
  } catch (error) {
    console.error("getCAPDashboard error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load CAP dashboard",
    });
  }
};
