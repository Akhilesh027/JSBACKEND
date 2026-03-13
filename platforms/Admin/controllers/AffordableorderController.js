// controllers/orderController.js
const Order = require("../../affordable-website/models/AffordableOrder");

// ✅ Update these imports to your actual model paths
const User = require("../../affordable-website/models/affordable_customers");
const Address = require("../../affordable-website/models/AffordableAddress");

/** -----------------------------------
 * Helpers
 * ---------------------------------- */

const STATUS_FLOW = {
  pending: ["approved", "rejected", "cancelled"], // legacy support
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

const VALID_STATUSES = [
  "pending",
  "placed",
  "approved",
  "confirmed",
  "shipped",
  "intransit",
  "delivered",
  "assemble",
  "cancelled",
  "rejected",
  "pending_payment",
  "processing",
  "returned",
];

async function enrichOrder(orderDoc) {
  const o = orderDoc?.toObject ? orderDoc.toObject() : orderDoc;
  if (!o) return null;

  const [user, address] = await Promise.all([
    o.userId
      ? User.findById(o.userId)
          .select("firstName lastName name fullName email phone")
          .lean()
      : null,
    o.addressId ? Address.findById(o.addressId).lean() : null,
  ]);

  return {
    ...o,
    userDetails: user
      ? {
          _id: user._id,
          name:
            user.fullName ||
            user.name ||
            `${user.firstName || ""} ${user.lastName || ""}`.trim(),
          email: user.email,
          phone: user.phone,
        }
      : null,
    addressDetails: address || null,
  };
}

function applyStatusTimestamp(order, status, userId = null) {
  const now = new Date();

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

    default:
      break;
  }
}

/**
 * GET /api/admin/orders?status=placed|pending&panelType=pap-vendor|eap
 * panelType:
 *  - pap-vendor => vendor orders (must have vendorName)
 *  - eap        => customer orders (must have userId)
 */
exports.getOrders = async (req, res) => {
  try {
    const { status, panelType, website } = req.query;

    const query = {};

    // ✅ Always filter by website
    query.website = website || "affordable";

    // ✅ status filter
    if (status) {
      query.status = status;
    }

    // ✅ panel filtering
    if (panelType === "pap-vendor") {
      query.vendorName = { $exists: true, $ne: "" };
    } else if (panelType === "eap") {
      query.userId = { $exists: true, $ne: null };
    }

    const orders = await Order.find(query).sort({ createdAt: -1 }).lean();

    const enrichedOrders = await Promise.all(orders.map(enrichOrder));

    return res.json(enrichedOrders);
  } catch (err) {
    console.error("getOrders error:", err);
    return res.status(500).json({
      message: err.message || "Server error",
    });
  }
};

/**
 * PATCH /api/admin/orders/:id/approve
 */
exports.approveOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!["pending", "placed"].includes(order.status)) {
      return res.status(400).json({ message: `Order already ${order.status}` });
    }

    order.status = "approved";
    applyStatusTimestamp(order, "approved", req.user?.id || null);

    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: "approved",
      changedBy: req.user?.id || null,
      changedAt: new Date(),
    });

    await order.save();

    const enriched = await enrichOrder(order);

    return res.json({
      message: "Order approved",
      order: enriched,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

/**
 * PATCH /api/admin/orders/:id/reject
 * body: { reason?: string }
 */
exports.rejectOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (!["pending", "placed"].includes(order.status)) {
      return res.status(400).json({ message: `Order already ${order.status}` });
    }

    order.status = "rejected";
    order.rejectionReason = reason || "";
    applyStatusTimestamp(order, "rejected", req.user?.id || null);

    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status: "rejected",
      changedBy: req.user?.id || null,
      changedAt: new Date(),
      note: reason || "",
    });

    await order.save();

    const enriched = await enrichOrder(order);

    return res.json({
      message: "Order rejected",
      order: enriched,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

/**
 * PATCH /api/admin/orders/:id/status
 * body: { status: "confirmed" | "shipped" | "intransit" | "delivered" | "assemble" | ... }
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Invalid status '${status}'`,
      });
    }

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const currentStatus = order.status;
    const allowedNext = STATUS_FLOW[currentStatus] || [];

    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        message: `Invalid status transition from '${currentStatus}' to '${status}'`,
        currentStatus,
        allowedNext,
      });
    }

    order.status = status;
    applyStatusTimestamp(order, status, req.user?.id || null);

    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status,
      changedBy: req.user?.id || null,
      changedAt: new Date(),
    });

    await order.save();

    const enriched = await enrichOrder(order);

    return res.json({
      message: "Order status updated",
      order: enriched,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};
