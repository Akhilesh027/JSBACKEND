const mongoose = require("mongoose");
const VendorOrder = require("../../Vendor/models/VendorOrder");
const Vendor = require("../../Vendor/models/Vendor");

const safeLower = (s) => String(s || "").trim().toLowerCase();
const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || ""));

const normalizeStatus = (status) => {
  const s = safeLower(status);

  if (s === "placed") return "Placed";
  if (s === "approved") return "approved";
  if (s === "confirmed") return "confirmed";
  if (s === "processing") return "processing";
  if (s === "shipped") return "shipped";
  if (s === "delivered") return "delivered";
  if (s === "cancelled") return "cancelled";
  if (s === "rejected") return "rejected";
  if (s === "reviewing") return "reviewing";
  if (s === "pending") return "pending";

  return status;
};

const ALLOWED_STATUSES = new Set([
  "placed",
  "approved",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "rejected",
  "reviewing",
  "pending",
]);

const TRANSITIONS = {
  placed: new Set(["approved", "rejected", "cancelled", "reviewing"]),
  reviewing: new Set(["approved", "rejected", "cancelled"]),
  approved: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["processing", "shipped", "cancelled"]),
  processing: new Set(["shipped", "cancelled"]),
  shipped: new Set(["delivered"]),
  delivered: new Set([]),
  rejected: new Set([]),
  cancelled: new Set([]),
  pending: new Set(["approved", "rejected", "cancelled", "reviewing"]),
};

const isTerminal = (s) => ["delivered", "rejected", "cancelled"].includes(s);

function mapVendorDetails(vendor) {
  if (!vendor) return null;

  return {
    _id: String(vendor._id || ""),
    companyName: vendor.companyName || "",
    legalName: vendor.legalName || "",
    companyType: vendor.companyType || "",
    telephone: vendor.telephone || "",
    mobile: vendor.mobile || "",
    email: vendor.email || "",
    country: vendor.country || "",
    city: vendor.city || "",
    businessNature: vendor.businessNature || "",
    estYear: vendor.estYear || null,
    relation: vendor.relation || "",
    employees: vendor.employees || "",
    pan: vendor.pan || "",
    gst: vendor.gst || "",
    items: vendor.items || "",
    legalDisputes: vendor.legalDisputes || "",
    exportCountries: vendor.exportCountries || "",
    description: vendor.description || "",
    documentUrl: vendor.documentUrl || "",
    status: vendor.status || "pending",
    createdAt: vendor.createdAt || null,
    updatedAt: vendor.updatedAt || null,
  };
}

function mapOrderItems(items = []) {
  return items.map((it) => ({
    productId: String(it.product || ""),
    name: it.name || "",
    sku: it.sku || "",
    image: it.image || "",
    tier: it.tier || "",
    category: it.category || "",
    subcategory: it.subcategory || "",
    material: it.material || "",
    color: it.color || "",
    size: it.size || "",
    unitPrice: Number(it.unitPrice || 0),
    quantity: Number(it.quantity || 0),
    lineTotal: Number(it.lineTotal || 0),
  }));
}

function mapVendorOrder(order) {
  return {
    _id: String(order._id),
    orderNumber: order.orderNumber || "",
    status: order.status || "Placed",
    note: order.note || "",
    vendor: mapVendorDetails(order.vendor),
    items: mapOrderItems(order.items || []),
    shippingAddress: {
      fullName: order.shippingAddress?.fullName || "",
      phone: order.shippingAddress?.phone || "",
      addressLine1: order.shippingAddress?.addressLine1 || "",
      addressLine2: order.shippingAddress?.addressLine2 || "",
      city: order.shippingAddress?.city || "",
      state: order.shippingAddress?.state || "",
      pincode: order.shippingAddress?.pincode || "",
    },
    pricing: {
      subtotal: Number(order.pricing?.subtotal || 0),
      gstRate: Number(order.pricing?.gstRate || 0),
      gstAmount: Number(order.pricing?.gstAmount || 0),
      total: Number(order.pricing?.total || 0),
    },
    meta: {
      forwardedToAdmin: !!order.meta?.forwardedToAdmin,
    },
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

/**
 * GET /api/admin/vendor-orders
 * query:
 *   status=all|Placed|approved|...
 *   search=orderNumber|orderId|vendorName|email|mobile
 */
exports.getVendorOrdersAdmin = async (req, res) => {
  try {
    const status = String(req.query.status || "all").trim();
    const search = String(req.query.search || "").trim();

    const query = {};

    if (status && safeLower(status) !== "all") {
      query.status = { $regex: `^${status}$`, $options: "i" };
    }

    if (search) {
      const vendorMatches = await Vendor.find({
        $or: [
          { companyName: { $regex: search, $options: "i" } },
          { legalName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { mobile: { $regex: search, $options: "i" } },
          { gst: { $regex: search, $options: "i" } },
          { pan: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const vendorIds = vendorMatches.map((v) => v._id);

      query.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        ...(isObjectId(search) ? [{ _id: search }] : []),
        ...(vendorIds.length ? [{ vendor: { $in: vendorIds } }] : []),
      ];
    }

    const orders = await VendorOrder.find(query)
      .sort({ createdAt: -1 })
      .populate("vendor")
      .lean();

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders: orders.map(mapVendorOrder),
    });
  } catch (err) {
    console.error("getVendorOrdersAdmin error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load vendor orders",
    });
  }
};

/**
 * GET /api/admin/vendor-orders/:orderId
 * full single order details
 */
exports.getVendorOrderByIdAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!isObjectId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid orderId",
      });
    }

    const order = await VendorOrder.findById(orderId)
      .populate("vendor")
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      order: mapVendorOrder(order),
    });
  } catch (err) {
    console.error("getVendorOrderByIdAdmin error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load order details",
    });
  }
};

exports.approveVendorOrderAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!isObjectId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid orderId",
      });
    }

    const order = await VendorOrder.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (safeLower(order.status) !== "placed" && safeLower(order.status) !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot approve from status: ${order.status}`,
      });
    }

    order.status = "approved";
    order.updatedAt = new Date();

    await order.save();

    const fresh = await VendorOrder.findById(order._id)
      .populate("vendor")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Order approved",
      order: mapVendorOrder(fresh),
    });
  } catch (err) {
    console.error("approveVendorOrderAdmin error:", err);
    return res.status(500).json({
      success: false,
      message: "Approve failed",
    });
  }
};

exports.rejectVendorOrderAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!isObjectId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid orderId",
      });
    }

    const order = await VendorOrder.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (safeLower(order.status) !== "placed" && safeLower(order.status) !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot reject from status: ${order.status}`,
      });
    }

    order.status = "rejected";
    order.updatedAt = new Date();

    await order.save();

    const fresh = await VendorOrder.findById(order._id)
      .populate("vendor")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Order rejected",
      order: mapVendorOrder(fresh),
    });
  } catch (err) {
    console.error("rejectVendorOrderAdmin error:", err);
    return res.status(500).json({
      success: false,
      message: "Reject failed",
    });
  }
};

/**
 * PATCH /api/admin/vendor-orders/:orderId/status
 * body: { status: "confirmed" | "processing" | "shipped" | ... }
 */
exports.updateVendorOrderStatusAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;
    const nextStatusRaw = req.body?.status;

    if (!isObjectId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid orderId",
      });
    }

    const next = safeLower(nextStatusRaw);

    if (!next) {
      return res.status(400).json({
        success: false,
        message: "status is required",
      });
    }

    if (!ALLOWED_STATUSES.has(next)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status: ${nextStatusRaw}. Allowed: ${Array.from(ALLOWED_STATUSES).join(", ")}`,
      });
    }

    const order = await VendorOrder.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const current = safeLower(order.status);

    if (isTerminal(current)) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from terminal state: ${order.status}`,
      });
    }

    const allowedNext = TRANSITIONS[current] || new Set();
    if (!allowedNext.has(next)) {
      return res.status(400).json({
        success: false,
        message: `Invalid transition: ${current} -> ${next}`,
        allowed: Array.from(allowedNext),
      });
    }

    order.status = normalizeStatus(next);
    order.updatedAt = new Date();

    await order.save();

    const fresh = await VendorOrder.findById(order._id)
      .populate("vendor")
      .lean();

    return res.status(200).json({
      success: true,
      message: `Status updated: ${current} -> ${next}`,
      order: mapVendorOrder(fresh),
    });
  } catch (err) {
    console.error("updateVendorOrderStatusAdmin error:", err);
    return res.status(500).json({
      success: false,
      message: "Status update failed",
    });
  }
};