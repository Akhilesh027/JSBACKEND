// controllers/adminCustomer.controller.js

/* ---------------- MODELS ---------------- */
const AffordableCustomer = require("../../affordable-website/models/affordable_customers.js");
const MidrangeCustomer = require("../../midrange-website/models/midrange_customers.js");
const LuxuryCustomer = require("../../luxury-website/models/luxury_customers.js");

// ✅ Orders models (update names if different)
const AffordableOrder = require("../../affordable-website/models/AffordableOrder.js");
const MidrangeOrder = require("../../midrange-website/models/MidrangeOrder.js");     // ✅ ADD
const LuxuryOrder = require("../../luxury-website/models/luxury_orders.js");          // ✅ ADD

// ✅ Address models (update names if different)
const AffordableAddress = require("../../affordable-website/models/AffordableAddress.js");
const MidrangeAddress = require("../../midrange-website/models/MidrangeAddress.js"); // ✅ ADD
const LuxuryAddress = require("../../luxury-website/models/luxury_customers.js");       // ✅ ADD

/* ---------------- HELPERS ---------------- */
const safeDate = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
};

const toStr = (v) => (v == null ? "" : String(v));

const sumOrderTotal = (o) => {
  const total = o?.pricing?.total ?? o?.totals?.total ?? o?.totalAmount ?? o?.total ?? 0;
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
        .sort(
          (a, b) =>
            new Date(getOrderCreatedAt(b) || 0) - new Date(getOrderCreatedAt(a) || 0)
        )[0]
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
  // ✅ SAFETY GUARDS (prevents your error)
  if (!CustomerModel || typeof CustomerModel.find !== "function") {
    console.error(`❌ ${segment}: CustomerModel missing/invalid`);
    return [];
  }

  const customers = await CustomerModel.find({}).lean();
  if (!customers.length) return [];

  // ✅ If no OrderModel/AddressModel for this segment, return basic customer info
  const hasOrderModel = OrderModel && typeof OrderModel.find === "function";
  const hasAddressModel = AddressModel && typeof AddressModel.find === "function";

  // collect ids from customers (if fields exist)
  const orderIds = hasOrderModel
    ? customers
        .flatMap((c) => (Array.isArray(c.orders) ? c.orders : []))
        .filter(Boolean)
    : [];

  const addressIds = hasAddressModel
    ? customers
        .flatMap((c) => (Array.isArray(c.addresses) ? c.addresses : []))
        .filter(Boolean)
    : [];

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
    const ordersDetailed = hasOrderModel
      ? (c.orders || []).map((id) => orderById.get(toStr(id))).filter(Boolean)
      : [];

    const addressesDetailed = hasAddressModel
      ? (c.addresses || []).map((id) => addressById.get(toStr(id))).filter(Boolean)
      : [];

    // sort orders newest first
    ordersDetailed.sort(
      (a, b) =>
        new Date(getOrderCreatedAt(b) || 0) - new Date(getOrderCreatedAt(a) || 0)
    );

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
          OrderModel: MidrangeOrder,       // ✅ ADD
          AddressModel: MidrangeAddress,   // ✅ ADD
        })
      );
    }

    if (!segment || segment === "luxury") {
      tasks.push(
        fetchSegmentCustomersWithDetails({
          segment: "luxury",
          CustomerModel: LuxuryCustomer,
          OrderModel: LuxuryOrder,         // ✅ ADD
          AddressModel: LuxuryAddress,     // ✅ ADD
        })
      );
    }

    const results = await Promise.all(tasks);
    const merged = results.flat();

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

/* ---------------- SUMMARY ENDPOINT (MERGED) ---------------- */
/**
 * GET /api/admin/customers/all  (summary)
 * optional: ?segment=affordable|midrange|luxury
 */
exports.getAllCustomers = async (req, res) => {
  try {
    const { segment } = req.query;

    const tasks = [];

    if (!segment || segment === "affordable") {
      tasks.push(
        AffordableCustomer.find({}).lean().then((list) =>
          list.map((doc) => ({
            id: String(doc._id),
            name: doc.name || "",
            email: doc.email || "",
            mobile: doc.mobile || doc.phone || "",
            city: doc.city || doc.address?.city || "",
            state: doc.state || doc.address?.state || "",
            totalOrders: Number(doc.totalOrders || doc.ordersCount || doc.orders?.length || 0),
            lifetimeSpend: Number(doc.lifetimeSpend || doc.totalSpend || doc.totalSpent || 0),
            lastOrderDate: doc.lastOrderDate || doc.lastLogin || doc.updatedAt || doc.createdAt,
            segment: "affordable",
          }))
        )
      );
    }

    if (!segment || segment === "midrange") {
      tasks.push(
        MidrangeCustomer.find({}).lean().then((list) =>
          list.map((doc) => ({
            id: String(doc._id),
            name: doc.name || "",
            email: doc.email || "",
            mobile: doc.mobile || doc.phone || "",
            city: doc.city || doc.address?.city || "",
            state: doc.state || doc.address?.state || "",
            totalOrders: Number(doc.totalOrders || doc.ordersCount || doc.orders?.length || 0),
            lifetimeSpend: Number(doc.lifetimeSpend || doc.totalSpend || doc.totalSpent || 0),
            lastOrderDate: doc.lastOrderDate || doc.lastLogin || doc.updatedAt || doc.createdAt,
            segment: "midrange",
          }))
        )
      );
    }

    if (!segment || segment === "luxury") {
      tasks.push(
        LuxuryCustomer.find({}).lean().then((list) =>
          list.map((doc) => ({
            id: String(doc._id),
            name: doc.name || "",
            email: doc.email || "",
            mobile: doc.mobile || doc.phone || "",
            city: doc.city || doc.address?.city || "",
            state: doc.state || doc.address?.state || "",
            totalOrders: Number(doc.totalOrders || doc.ordersCount || doc.orders?.length || 0),
            lifetimeSpend: Number(doc.lifetimeSpend || doc.totalSpend || doc.totalSpent || 0),
            lastOrderDate: doc.lastOrderDate || doc.lastLogin || doc.updatedAt || doc.createdAt,
            segment: "luxury",
          }))
        )
      );
    }

    const results = await Promise.all(tasks);
    const merged = results.flat();

    merged.sort((a, b) => new Date(b.lastOrderDate || 0) - new Date(a.lastOrderDate || 0));

    return res.status(200).json({ data: merged });
  } catch (error) {
    console.error("getAllCustomers error:", error);
    return res.status(500).json({ error: "Failed to fetch customers" });
  }
};
