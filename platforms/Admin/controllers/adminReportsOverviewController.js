const AffordableOrder = require("../../affordable-website/models/AffordableOrder");
const MidrangeOrder = require("../../midrange-website/models/MidrangeOrder");
const LuxuryOrder = require("../../luxury-website/models/luxury_orders");

const Product = require("../../manufacturer-portal/models/Product");
const Vendor = require("../../Vendor/models/Vendor");
const Manufacturer = require("../../manufacturer-portal/models/Manufacturer");

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

// Normalize DB status -> frontend buckets
const normalizeStatus = (s) => {
  const x = String(s || "").toLowerCase().trim();

  if (x.includes("cancel")) return "cancelled";
  if (x.includes("deliver")) return "delivered";
  if (x.includes("out_for_delivery") || x.includes("out for delivery")) return "out_for_delivery";
  if (x.includes("in_transit") || x.includes("in-transit") || x.includes("transit")) return "in_transit";
  if (x.includes("ship")) return "shipped";
  if (x.includes("pack")) return "packed";

  // ✅ your systems use: approved/confirmed -> treat as placed
  if (x.includes("approved") || x.includes("confirm") || x.includes("place")) return "placed";

  if (x.includes("pending")) return "pending";

  return "pending";
};

/**
 * ✅ Correct amount per segment
 * Affordable sample: pricing.total
 * Luxury sample: pricing.total
 * Midrange: keep fallback keys (update if your midrange uses something else)
 */
const getAmountBySegment = (o, segment) => {
  if (segment === "affordable") {
    return Number(o?.pricing?.total ?? o?.pricing?.subtotal ?? o?.total ?? 0);
  }
  if (segment === "luxury") {
    return Number(o?.pricing?.total ?? o?.pricing?.subtotal ?? o?.total ?? 0);
  }
  // midrange (best effort)
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

/**
 * ✅ Correct customer id per segment
 * Affordable: userId
 * Midrange: userId OR customerId
 * Luxury: customerId is object -> customerId._id
 */
const getCustomerIdBySegment = (o, segment) => {
  if (segment === "affordable") {
    return o?.userId || o?.userDetails?._id || null;
  }
  if (segment === "luxury") {
    return o?.customerId?._id || o?.customerId || o?.userDetails?._id || null;
  }
  // midrange (best effort)
  return o?.userId || o?.customerId?._id || o?.customerId || o?.user || null;
};

async function fetchOrdersFor(Model, from) {
  const q = from ? { createdAt: { $gte: from } } : {};
  // ✅ select fields that exist in your samples
  return Model.find(q)
    .select("_id status createdAt updatedAt pricing totals grandTotal totalAmount total amount userId customerId user userDetails")
    .lean();
}

exports.getReportsOverview = async (req, res) => {
  try {
    const daysRaw = req.query.days;

    let days = 30;
    let from = null;

    if (String(daysRaw || "").toLowerCase() === "all") {
      days = null;
      from = null;
    } else {
      days = daysRaw ? Math.min(365, Math.max(1, toInt(daysRaw, 30))) : 30;
      from = getFromDate(days);
    }

    const rangeLabel = days ? `Last ${days} days` : "All Time";

    // ✅ pull orders from all 3 collections
    const [affordableOrders, midrangeOrders, luxuryOrders] = await Promise.all([
      fetchOrdersFor(AffordableOrder, from),
      fetchOrdersFor(MidrangeOrder, from),
      fetchOrdersFor(LuxuryOrder, from),
    ]);

    const allOrders = [
      ...affordableOrders.map((o) => ({ ...o, __segment: "affordable" })),
      ...midrangeOrders.map((o) => ({ ...o, __segment: "midrange" })),
      ...luxuryOrders.map((o) => ({ ...o, __segment: "luxury" })),
    ];

    const ordersByStatus = {
      pending: 0,
      placed: 0,
      packed: 0,
      shipped: 0,
      in_transit: 0,
      out_for_delivery: 0,
      delivered: 0,
      cancelled: 0,
    };

    const segmentOrders = { affordable: 0, midrange: 0, luxury: 0 };
    const segmentRevenue = { affordable: 0, midrange: 0, luxury: 0 };

    let totalRevenue = 0;
    const customerSet = new Set();

    for (const o of allOrders) {
      const seg = o.__segment;

      segmentOrders[seg] += 1;

      // ✅ Correct revenue per segment
      const amount = getAmountBySegment(o, seg);
      totalRevenue += amount;
      segmentRevenue[seg] += amount;

      // ✅ normalized status
      const st = normalizeStatus(o.status);
      ordersByStatus[st] += 1;

      // ✅ correct customer id per segment
      const cid = getCustomerIdBySegment(o, seg);
      if (cid) customerSet.add(String(cid));
    }

    const totalOrders = allOrders.length;

    // ✅ Products: total + low stock
    const LOW_STOCK_THRESHOLD = Number(req.query.lowStock || 10);

    const [totalProducts, lowStockProducts] = await Promise.all([
      Product.countDocuments({}),
      Product.countDocuments({ quantity: { $lte: LOW_STOCK_THRESHOLD } }),
    ]);

    // ✅ Vendors & Manufacturers
    const [totalVendors, totalManufacturers] = await Promise.all([
      Vendor.countDocuments({}),
      Manufacturer.countDocuments({}),
    ]);

    // ✅ Customers (unique customers from orders)
    const totalCustomers = customerSet.size;

    return res.status(200).json({
      success: true,
      data: {
        rangeLabel,

        totalRevenue,
        totalOrders,
        totalCustomers,
        totalVendors,
        totalManufacturers,

        segmentOrders,
        segmentRevenue,

        ordersByStatus,

        totalProducts,
        lowStockProducts,

        // keep 0 until you connect models
        totalCoupons: 0,
        activeCoupons: 0,
        couponRedemptions: 0,
        totalBanners: 0,
        openTickets: 0,
        resolvedTickets: 0,
        totalAdmins: 0,
        loginEvents: 0,
      },
      meta: {
        days: days ?? "all",
        lowStockThreshold: LOW_STOCK_THRESHOLD,
      },
    });
  } catch (error) {
    console.error("getReportsOverview error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load reports overview",
    });
  }
};
