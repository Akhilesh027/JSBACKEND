const AffordableCustomer = require("../../affordable-website/models/affordable_customers.js");
const MidrangeCustomer = require("../../midrange-website/models/midrange_customers.js");
const LuxuryCustomer = require("../../luxury-website/models/luxury_customers.js");

// ✅ Orders models (update names if different)
const AffordableOrder = require("../../affordable-website/models/AffordableOrder.js");

// ✅ Address models (update names if different)
const AffordableAddress = require("../../affordable-website/models/AffordableAddress.js");

/* ---------------- HELPERS ---------------- */
const safeDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};

const toStr = (v) => (v == null ? "" : String(v));

const sumOrderTotal = (o) => {
  // supports both possible schemas
  const total =
    o?.pricing?.total ??
    o?.totalAmount ??
    o?.total ??
    0;

  return Number(total || 0);
};

const getOrderCreatedAt = (o) => o?.createdAt || o?.updatedAt || null;

/**
 * Normalize customer with detailed orders & addresses
 */
const normalizeCustomerFull = ({ doc, segment, ordersDetailed, addressesDetailed }) => {
  const computedTotalOrders = Array.isArray(ordersDetailed) ? ordersDetailed.length : 0;

  const computedTotalSpent = Array.isArray(ordersDetailed)
    ? ordersDetailed.reduce((sum, o) => sum + sumOrderTotal(o), 0)
    : 0;

  const lastOrder = Array.isArray(ordersDetailed)
    ? ordersDetailed
        .slice()
        .sort((a, b) => new Date(getOrderCreatedAt(b) || 0) - new Date(getOrderCreatedAt(a) || 0))[0]
    : null;

  return {
    id: String(doc._id),
    segment,
    platform: doc.platform || segment,

    name: doc.name || "",
    email: doc.email || "",
    phone: doc.mobile || doc.phone || "",
    role: doc.role || "customer",
    avatar: doc.avatar || "",

    // raw ids stored on customer
    orders: Array.isArray(doc.orders) ? doc.orders.map(String) : [],
    addresses: Array.isArray(doc.addresses) ? doc.addresses.map(String) : [],

    // populated details
    ordersDetailed: Array.isArray(ordersDetailed) ? ordersDetailed : [],
    addressesDetailed: Array.isArray(addressesDetailed) ? addressesDetailed : [],

    // totals (prefer computed from orders)
    totalOrders: computedTotalOrders || Number(doc.totalOrders || 0),
    totalSpent: computedTotalOrders ? computedTotalSpent : Number(doc.totalSpent || 0),

    // activity dates
    lastLogin: safeDate(doc.lastLogin),
    lastOrderDate: safeDate(
      getOrderCreatedAt(lastOrder) || doc.updatedAt || doc.createdAt || doc.lastLogin
    ),

    createdAt: safeDate(doc.createdAt),
    updatedAt: safeDate(doc.updatedAt),

    raw: doc,
  };
};

/* ---------------- CORE FUNCTION ---------------- */
async function fetchSegmentCustomersWithDetails({
  segment,
  CustomerModel,
  OrderModel,
  AddressModel,
}) {
  const customers = await CustomerModel.find({}).lean();
  if (!customers.length) return [];

  // collect ids from customers
  const orderIds = customers.flatMap((c) => (Array.isArray(c.orders) ? c.orders : [])).filter(Boolean);
  const addressIds = customers.flatMap((c) => (Array.isArray(c.addresses) ? c.addresses : [])).filter(Boolean);

  // fetch all orders + addresses in batch (fast)
  const [orders, addresses] = await Promise.all([
    orderIds.length ? OrderModel.find({ _id: { $in: orderIds } }).lean() : [],
    addressIds.length ? AddressModel.find({ _id: { $in: addressIds } }).lean() : [],
  ]);

  // maps for quick lookup
  const orderById = new Map(orders.map((o) => [toStr(o._id), o]));
  const addressById = new Map(addresses.map((a) => [toStr(a._id), a]));

  // build enriched customers
  const enriched = customers.map((c) => {
    const ordersDetailed = (c.orders || []).map((id) => orderById.get(toStr(id))).filter(Boolean);

    const addressesDetailed = (c.addresses || []).map((id) => addressById.get(toStr(id))).filter(Boolean);

    // sort orders newest first
    ordersDetailed.sort((a, b) => new Date(getOrderCreatedAt(b) || 0) - new Date(getOrderCreatedAt(a) || 0));

    return normalizeCustomerFull({
      doc: c,
      segment,
      ordersDetailed,
      addressesDetailed,
    });
  });

  return enriched;
}

/* ---------------- GET ALL (FULL DETAILS) ---------------- */
/**
 * GET /api/admin/customers/all-details
 * optional: ?segment=affordable|midrange|luxury
 */
exports.getAllCustomersFullDetails = async (req, res) => {
  try {
    const { segment } = req.query;

    const tasks = [];

    if (!segment || segment === "affordable") {
      tasks.push(
        fetchSegmentCustomersWithDetails({
          segment: "affordable",
          CustomerModel: AffordableCustomer,
          OrderModel: AffordableOrder,
          AddressModel: AffordableAddress,
        })
      );
    }

    if (!segment || segment === "midrange") {
      tasks.push(
        fetchSegmentCustomersWithDetails({
          segment: "midrange",
          CustomerModel: MidrangeCustomer,
        
        })
      );
    }

    if (!segment || segment === "luxury") {
      tasks.push(
        fetchSegmentCustomersWithDetails({
          segment: "luxury",
          CustomerModel: LuxuryCustomer,
      
        })
      );
    }

    const results = await Promise.all(tasks);
    const merged = results.flat();

    // sort by lastOrderDate (or updatedAt)
    merged.sort((a, b) => {
      const ad = new Date(a.lastOrderDate || a.updatedAt || a.createdAt || 0).getTime();
      const bd = new Date(b.lastOrderDate || b.updatedAt || b.createdAt || 0).getTime();
      return bd - ad;
    });

    return res.status(200).json({ data: merged });
  } catch (error) {
    console.error("getAllCustomersFullDetails error:", error);
    return res.status(500).json({ error: "Failed to fetch customers" });
  }
};

/* ---------------- (OPTIONAL) OLD SUMMARY ENDPOINT ---------------- */
/**
 * GET /api/admin/customers/all  (summary)
 */
exports.getAllCustomers = async (req, res) => {
  try {
    const customers = await AffordableCustomer.find({}).lean();

    const merged = customers.map((doc) => ({
      id: doc._id,
      name: doc.name || "",
      email: doc.email || "",
      mobile: doc.mobile || doc.phone || "",
      city: doc.city || doc.address?.city || "",
      state: doc.state || doc.address?.state || "",
      totalOrders: Number(doc.totalOrders || doc.ordersCount || doc.orders?.length || 0),
      lifetimeSpend: Number(doc.lifetimeSpend || doc.totalSpend || doc.totalSpent || 0),
      lastOrderDate: doc.lastOrderDate || doc.lastLogin || doc.updatedAt || doc.createdAt,
      segment: "affordable",
    }));

    merged.sort((a, b) => new Date(b.lastOrderDate) - new Date(a.lastOrderDate));

    return res.status(200).json({ data: merged });
  } catch (error) {
    console.error("getAllCustomers error:", error);
    return res.status(500).json({ error: "Failed to fetch customers" });
  }
};
