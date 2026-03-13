const mongoose = require("mongoose");
const LuxuryOrder = require("../../luxury-website/models/luxury_orders");
const User = require("../../luxury-website/models/luxury_customers");

/* --------------------------------------------------
LOGGER HELPERS
---------------------------------------------------*/

const logInfo = (label, data = {}) => {
  console.log(`ℹ️ [LUXURY ORDER] ${label}`, data);
};

const logWarn = (label, data = {}) => {
  console.warn(`⚠️ [LUXURY ORDER] ${label}`, data);
};

const logError = (label, err) => {
  console.error(`❌ [LUXURY ORDER] ${label}`, {
    message: err?.message,
    stack: err?.stack,
  });
};

/* --------------------------------------------------
STATUS DEFINITIONS
---------------------------------------------------*/

const VALID_STATUSES = new Set([
  "placed",
  "approved",
  "confirmed",
  "shipped",
  "intransit",
  "delivered",
  "assemble",
  "cancelled",
  "rejected",
  "returned",
  "pending_payment",
  "processing",
]);

const NEXT_ALLOWED = {
  pending_payment: new Set([]),
  processing: new Set([]),

  placed: new Set(["approved", "rejected", "cancelled"]),
  approved: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["shipped", "cancelled"]),
  shipped: new Set(["intransit", "cancelled"]),
  intransit: new Set(["delivered"]),
  delivered: new Set(["assemble"]),

  assemble: new Set([]),
  cancelled: new Set([]),
  rejected: new Set([]),
  returned: new Set([]),
};

/* --------------------------------------------------
HELPERS
---------------------------------------------------*/

function buildUserDetails(o) {
  const customer = o.customerId
    ? {
        _id: String(o.customerId._id),
        name: `${o.customerId.firstName || ""} ${o.customerId.lastName || ""}`.trim(),
        email: o.customerId.email,
        phone: o.customerId.phone,
      }
    : undefined;

  return o.userDetails || customer || null;
}

function buildAddressDetails(o) {
  const addressDetails = o.shippingAddress
    ? {
        label: o.shippingAddress.label,
        firstName: o.shippingAddress.firstName,
        lastName: o.shippingAddress.lastName,
        fullName:
          `${o.shippingAddress.firstName || ""} ${o.shippingAddress.lastName || ""}`.trim() || "",
        email: o.shippingAddress.email,
        phone: o.shippingAddress.phone,
        addressLine1: o.shippingAddress.addressLine1,
        addressLine2: o.shippingAddress.addressLine2,
        city: o.shippingAddress.city,
        state: o.shippingAddress.state,
        pincode: o.shippingAddress.pincode,
        country: o.shippingAddress.country,
      }
    : null;

  return o.addressDetails || addressDetails;
}

function enrichLuxuryOrder(o) {
  if (!o) return null;

  return {
    ...o,
    website: o.website || "luxury",
    userDetails: buildUserDetails(o),
    addressDetails: buildAddressDetails(o),
  };
}

function appendStatusHistory(order, status, userId = null, note = "") {
  order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];

  order.statusHistory.push({
    status,
    changedBy: userId,
    changedAt: new Date(),
    note,
  });

  logInfo("Status history appended", {
    orderId: order._id,
    status,
  });
}

function applyStatusTimestamp(order, status, userId = null) {
  const now = new Date();

  logInfo("Applying timestamp", { orderId: order._id, status });

  switch (status) {
    case "approved":
      order.approvedAt = now;
      order.approvedBy = userId;
      break;

    case "rejected":
      order.rejectedAt = now;
      order.rejectedBy = userId;
      break;

    case "confirmed":
      order.confirmedAt = now;
      order.confirmedBy = userId;
      break;

    case "shipped":
      order.shippedAt = now;
      order.shippedBy = userId;
      break;

    case "intransit":
      order.inTransitAt = now;
      order.inTransitBy = userId;
      break;

    case "delivered":
      order.deliveredAt = now;
      order.deliveredBy = userId;
      break;

    case "assemble":
      order.assembledAt = now;
      order.assembledBy = userId;
      break;

    case "cancelled":
      order.cancelledAt = now;
      order.cancelledBy = userId;
      break;
  }
}

async function getEnrichedOrderById(id) {
  try {
    const order = await LuxuryOrder.findById(id)
      .populate("customerId", "firstName lastName email phone")
      .lean();

    return enrichLuxuryOrder(order);
  } catch (err) {
    logError("getEnrichedOrderById failed", err);
    throw err;
  }
}

/* =========================================================
GET ALL ORDERS (ADMIN)
========================================================= */

exports.getLuxuryOrdersAdmin = async (req, res) => {
  try {
    logInfo("Admin fetching orders", { query: req.query });

    const status = String(req.query.status || "all").trim().toLowerCase();
    const paymentStatus = String(req.query.paymentStatus || "all").trim().toLowerCase();
    const qText = String(req.query.q || "").trim();

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "50", 10), 200));
    const skip = (page - 1) * limit;

    const filter = {};

    if (status !== "all") filter.status = status;
    if (paymentStatus !== "all") filter["payment.status"] = paymentStatus;

    if (qText) {
      filter.$or = [
        { orderNumber: { $regex: qText, $options: "i" } },
        { "shippingAddress.email": { $regex: qText, $options: "i" } },
        { "shippingAddress.phone": { $regex: qText, $options: "i" } },
      ];
    }

    const [orders, total] = await Promise.all([
      LuxuryOrder.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("customerId", "firstName lastName email phone")
        .lean(),
      LuxuryOrder.countDocuments(filter),
    ]);

    logInfo("Orders fetched", { count: orders.length });

    return res.json({
      success: true,
      data: orders.map(enrichLuxuryOrder),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logError("Fetching orders failed", err);
    return res.status(500).json({ success: false, message: "Failed to load luxury orders" });
  }
};

/* =========================================================
APPROVE ORDER
========================================================= */

exports.approveLuxuryOrder = async (req, res) => {
  try {
    const { id } = req.params;

    logInfo("Approve request received", { orderId: id });

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logWarn("Invalid order id", { id });
      return res.status(400).json({ success: false, message: "Invalid order id" });
    }

    const order = await LuxuryOrder.findById(id);

    if (!order) {
      logWarn("Order not found", { id });
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status !== "placed") {
      logWarn("Approve rejected - invalid status", {
        currentStatus: order.status,
      });

      return res.status(400).json({
        success: false,
        message: `Only placed orders can be approved. Current: ${order.status}`,
      });
    }

    order.status = "approved";

    applyStatusTimestamp(order, "approved", req.user?.id || null);
    appendStatusHistory(order, "approved", req.user?.id || null);

    await order.save();

    logInfo("Order approved successfully", { id });

    const enriched = await getEnrichedOrderById(id);

    return res.json({
      success: true,
      message: "Approved",
      order: enriched,
    });
  } catch (err) {
    logError("Approve order failed", err);
    return res.status(500).json({ success: false, message: "Approve failed" });
  }
};

/* =========================================================
CONFIRM ORDER
========================================================= */

exports.confirmLuxuryOrder = async (req, res) => {
  try {
    const { id } = req.params;

    logInfo("Confirm request received", { orderId: id });

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logWarn("Invalid order id", { id });
      return res.status(400).json({ success: false, message: "Invalid order id" });
    }

    const order = await LuxuryOrder.findById(id);

    if (!order) {
      logWarn("Order not found", { id });
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.status !== "approved") {
      logWarn("Confirm rejected", {
        currentStatus: order.status,
      });

      return res.status(400).json({
        success: false,
        message: `Only approved orders can be confirmed. Current: ${order.status}`,
      });
    }

    order.status = "confirmed";

    applyStatusTimestamp(order, "confirmed", req.user?.id || null);
    appendStatusHistory(order, "confirmed", req.user?.id || null);

    await order.save();

    logInfo("Order confirmed", { id });

    const enriched = await getEnrichedOrderById(id);

    return res.json({
      success: true,
      message: "Confirmed",
      order: enriched,
    });
  } catch (err) {
    logError("Confirm order failed", err);
    return res.status(500).json({ success: false, message: "Confirm failed" });
  }
};

/* =========================================================
GENERIC STATUS UPDATE
========================================================= */

exports.updateLuxuryOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const next = String(req.body?.status || "").toLowerCase().trim();

    logInfo("Status update requested", { orderId: id, next });

    if (!mongoose.Types.ObjectId.isValid(id)) {
      logWarn("Invalid order id", { id });
      return res.status(400).json({ success: false, message: "Invalid order id" });
    }

    if (!VALID_STATUSES.has(next)) {
      logWarn("Invalid status", { next });
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const order = await LuxuryOrder.findById(id);

    if (!order) {
      logWarn("Order not found", { id });
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const current = String(order.status || "").toLowerCase();
    const allowed = NEXT_ALLOWED[current] || new Set();

    if (!allowed.has(next)) {
      logWarn("Invalid transition", {
        current,
        next,
        allowed: [...allowed],
      });

      return res.status(400).json({
        success: false,
        message: `Not allowed: ${current} -> ${next}`,
        currentStatus: current,
        allowedNext: [...allowed],
      });
    }

    order.status = next;

    applyStatusTimestamp(order, next, req.user?.id || null);
    appendStatusHistory(order, next, req.user?.id || null);

    await order.save();

    logInfo("Status updated successfully", { id, next });

    const enriched = await getEnrichedOrderById(id);

    return res.json({
      success: true,
      message: "Status updated",
      order: enriched,
    });
  } catch (err) {
    logError("Status update failed", err);
    return res.status(500).json({ success: false, message: "Failed to update status" });
  }
};