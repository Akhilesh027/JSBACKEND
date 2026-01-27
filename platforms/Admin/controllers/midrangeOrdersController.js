const MidrangeOrder = require("../../midrange-website/models/MidrangeOrder"); // ✅ change path
const MidrangeUser = require("../../midrange-website/models/midrange_customers"); // ✅ change path
const MidrangeAddress = require("../../midrange-website/models/MidrangeAddress"); // ✅ change path
const VALID_STATUSES = [
  "placed",
  "approved",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "rejected",
];

const STATUS_FLOW = {
  placed: ["approved", "rejected", "cancelled"],
  approved: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  rejected: [],
};

function canMove(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;
  return (STATUS_FLOW[from] || []).includes(to);
}

/**
 * PATCH /api/admin/midrange/orders/:id/status
 * body: { status: "confirmed" }
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || typeof status !== "string") {
      return res.status(400).json({ message: "Status is required" });
    }

    const nextStatus = status.toLowerCase().trim();

    if (!VALID_STATUSES.includes(nextStatus)) {
      return res.status(400).json({
        message: `Invalid status. Allowed: ${VALID_STATUSES.join(", ")}`,
      });
    }

    const order = await MidrangeOrder.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const currentStatus = (order.status || "").toLowerCase();

    // ✅ prevent illegal transitions
    if (!canMove(currentStatus, nextStatus)) {
      return res.status(400).json({
        message: `Cannot change status from "${currentStatus}" to "${nextStatus}"`,
      });
    }

    // ✅ optional: when cancelling, store reason
    if (nextStatus === "cancelled") {
      order.cancelledAt = new Date();
      // order.cancelReason = req.body.reason || ""; // if you want
    }

    // ✅ optional: when delivered
    if (nextStatus === "delivered") {
      order.deliveredAt = new Date();
      // if COD then mark paid on delivery
      if ((order.payment?.method || "").toUpperCase() === "COD") {
        order.payment = {
          ...(order.payment || {}),
          status: "paid",
        };
      }
    }

    order.status = nextStatus;
    await order.save();

    return res.json({
      message: "Order status updated",
      order,
    });
  } catch (err) {
    console.error("updateOrderStatus error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
/**
 * GET /api/admin/midrange/orders?status=placed|confirmed|shipped|delivered
 * Returns orders with userDetails + addressDetails so frontend can show it.
 */
exports.getMidrangeOrders = async (req, res) => {
  try {
    const { status } = req.query;

    const query = {};
    if (status) query.status = status;

    // newest first
    const orders = await MidrangeOrder.find(query).sort({ createdAt: -1 }).lean();

    // attach userDetails + addressDetails
    const userIds = orders.map((o) => o.userId).filter(Boolean);
    const addressIds = orders.map((o) => o.addressId).filter(Boolean);

    const users = await MidrangeUser.find({ _id: { $in: userIds } })
      .select("_id name email")
      .lean();

    const addresses = await MidrangeAddress.find({ _id: { $in: addressIds } }).lean();

    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const addressMap = new Map(addresses.map((a) => [String(a._id), a]));

    const enriched = orders.map((o) => ({
      ...o,
      userDetails: userMap.get(String(o.userId)) || null,
      addressDetails: addressMap.get(String(o.addressId)) || null,
    }));

    return res.json(enriched); // ✅ frontend supports array
    // OR if you prefer:
    // return res.json({ data: enriched });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to fetch midrange orders",
      error: err?.message,
    });
  }
};

/**
 * PATCH /api/admin/midrange/orders/:id/approve
 * placed -> confirmed
 */
exports.approveMidrangeOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await MidrangeOrder.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Only approve placed orders (you can relax this if you want)
    if (order.status !== "placed") {
      return res.status(400).json({ message: `Cannot approve order in status: ${order.status}` });
    }

    order.status = "confirmed";
    order.updatedAt = new Date();
    await order.save();

    return res.json({
      message: "Order approved successfully",
      order,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to approve order",
      error: err?.message,
    });
  }
};

/**
 * PATCH /api/admin/midrange/orders/:id/reject
 * placed -> rejected (store reason if field exists)
 */
exports.rejectMidrangeOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = "" } = req.body || {};

    const order = await MidrangeOrder.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status !== "placed") {
      return res.status(400).json({ message: `Cannot reject order in status: ${order.status}` });
    }

    order.status = "rejected";
    order.updatedAt = new Date();

    // Optional: if your schema has these fields
    if ("rejectionReason" in order) order.rejectionReason = reason;
    if ("rejectedAt" in order) order.rejectedAt = new Date();

    await order.save();

    return res.json({
      message: "Order rejected successfully",
      order,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Failed to reject order",
      error: err?.message,
    });
  }
};
