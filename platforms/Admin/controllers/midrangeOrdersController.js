const mongoose = require("mongoose");

const MidrangeOrder = require("../../midrange-website/models/MidrangeOrder");
const MidrangeUser = require("../../midrange-website/models/midrange_customers");
const MidrangeAddress = require("../../midrange-website/models/MidrangeAddress");

/* ---------------- STATUS FLOW ---------------- */

const STATUS_FLOW = {
  pending: ["approved", "rejected", "cancelled"],
  placed: ["approved", "rejected", "cancelled"],
  approved: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["intransit", "cancelled"],
  intransit: ["delivered"],
  delivered: ["assemble"],
  assemble: [],
  rejected: [],
  cancelled: [],
  returned: [],
  pending_payment: [],
  processing: [],
};

const VALID_STATUSES = Object.keys(STATUS_FLOW);

/* ---------------- HELPERS ---------------- */

function canMove(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;
  return (STATUS_FLOW[from] || []).includes(to);
}

function appendStatusHistory(order, status, userId = null, note = "") {
  order.statusHistory = Array.isArray(order.statusHistory)
    ? order.statusHistory
    : [];

  order.statusHistory.push({
    status,
    changedBy: userId,
    changedAt: new Date(),
    note,
  });
}

function applyStatusTimestamp(order, status, userId = null) {
  const now = new Date();

  switch (status) {
    case "approved":
      order.approvedAt = now;
      order.approvedBy = userId;
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

    case "rejected":
      order.rejectedAt = now;
      order.rejectedBy = userId;
      break;

    default:
      break;
  }
}

/* ---------------- ORDER ENRICH ---------------- */

async function enrichMidrangeOrder(orderDoc) {
  const o = orderDoc?.toObject ? orderDoc.toObject() : orderDoc;
  if (!o) return null;

  const [user, address] = await Promise.all([
    o.userId
      ? MidrangeUser.findById(o.userId)
          .select("_id name firstName lastName email phone")
          .lean()
      : null,
    o.addressId ? MidrangeAddress.findById(o.addressId).lean() : null,
  ]);

  return {
    ...o,
    website: o.website || "midrange",
    userDetails: user
      ? {
          _id: user._id,
          name:
            user.name ||
            `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
            "Customer",
          email: user.email,
          phone: user.phone,
        }
      : null,
    addressDetails: address || null,
  };
}

/* ---------------- UPDATE STATUS ---------------- */

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid order id" });

    if (!status || typeof status !== "string")
      return res.status(400).json({ message: "Status is required" });

    const nextStatus = status.toLowerCase().trim();

    if (!VALID_STATUSES.includes(nextStatus)) {
      return res.status(400).json({
        message: `Invalid status. Allowed: ${VALID_STATUSES.join(", ")}`,
      });
    }

    const order = await MidrangeOrder.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const currentStatus = (order.status || "").toLowerCase();

    if (!canMove(currentStatus, nextStatus)) {
      return res.status(400).json({
        message: `Cannot change status from "${currentStatus}" to "${nextStatus}"`,
        currentStatus,
        allowedNext: STATUS_FLOW[currentStatus] || [],
      });
    }

    order.status = nextStatus;
    order.updatedAt = new Date();

    if (nextStatus === "cancelled" && req.body?.reason) {
      order.cancelReason = String(req.body.reason);
    }

    if (nextStatus === "delivered") {
      if (order.payment && order.payment.method === "COD") {
        order.payment.status = "paid";
      }
    }

    const adminId = req.user ? req.user.id : null;

    applyStatusTimestamp(order, nextStatus, adminId);
    appendStatusHistory(order, nextStatus, adminId, req.body?.reason || "");

    await order.save();

    const enriched = await enrichMidrangeOrder(order);

    return res.json({
      message: "Order status updated",
      order: enriched,
      nextAllowed: STATUS_FLOW[nextStatus] || [],
    });
  } catch (err) {
    console.error("updateOrderStatus error:", err);
    return res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

/* ---------------- GET ORDERS ---------------- */

exports.getMidrangeOrders = async (req, res) => {
  try {
    const { status } = req.query;

    const query = {};
    if (status && status !== "all") query.status = status.toLowerCase();

    const orders = await MidrangeOrder.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const userIds = orders.map((o) => o.userId).filter(Boolean);
    const addressIds = orders.map((o) => o.addressId).filter(Boolean);

    const [users, addresses] = await Promise.all([
      MidrangeUser.find({ _id: { $in: userIds } })
        .select("_id name firstName lastName email phone")
        .lean(),
      MidrangeAddress.find({ _id: { $in: addressIds } }).lean(),
    ]);

    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const addressMap = new Map(addresses.map((a) => [String(a._id), a]));

    const enriched = orders.map((o) => {
      const u = userMap.get(String(o.userId));

      return {
        ...o,
        website: o.website || "midrange",
        userDetails: u
          ? {
              _id: u._id,
              name:
                u.name ||
                `${u.firstName || ""} ${u.lastName || ""}`.trim() ||
                "Customer",
              email: u.email,
              phone: u.phone,
            }
          : null,
        addressDetails: addressMap.get(String(o.addressId)) || null,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to fetch midrange orders",
      error: err.message,
    });
  }
};

/* ---------------- APPROVE ORDER ---------------- */

exports.approveMidrangeOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid order id" });

    const order = await MidrangeOrder.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const status = String(order.status).toLowerCase();

    if (!["placed", "pending"].includes(status)) {
      return res.status(400).json({
        message: `Cannot approve order in status: ${order.status}`,
      });
    }

    order.status = "approved";
    order.updatedAt = new Date();

    const adminId = req.user ? req.user.id : null;

    applyStatusTimestamp(order, "approved", adminId);
    appendStatusHistory(order, "approved", adminId);

    await order.save();

    const enriched = await enrichMidrangeOrder(order);

    res.json({
      message: "Order approved successfully",
      order: enriched,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to approve order",
      error: err.message,
    });
  }
};

/* ---------------- REJECT ORDER ---------------- */

exports.rejectMidrangeOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = "" } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid order id" });

    const order = await MidrangeOrder.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const status = String(order.status).toLowerCase();

    if (!["placed", "pending"].includes(status)) {
      return res.status(400).json({
        message: `Cannot reject order in status: ${order.status}`,
      });
    }

    order.status = "rejected";
    order.updatedAt = new Date();

    const adminId = req.user ? req.user.id : null;

    order.rejectionReason = reason;

    applyStatusTimestamp(order, "rejected", adminId);
    appendStatusHistory(order, "rejected", adminId, reason);

    await order.save();

    const enriched = await enrichMidrangeOrder(order);

    res.json({
      message: "Order rejected successfully",
      order: enriched,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Failed to reject order",
      error: err.message,
    });
  }
};

/* ---------------- GET ORDER BY ID ---------------- */

exports.getMidrangeOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid order id" });

    const order = await MidrangeOrder.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const enriched = await enrichMidrangeOrder(order);

    res.json(enriched);
  } catch (err) {
    console.error("getMidrangeOrderById error:", err);
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};