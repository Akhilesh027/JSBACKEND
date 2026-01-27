// controllers/orderController.js
const Order = require("../../affordable-website/models/AffordableOrder");

// ✅ Update these imports to your actual model paths
const User = require("../../affordable-website/models/affordable_customers");
const Address = require("../../affordable-website/models/AffordableAddress");


/**
 * GET /api/admin/orders?status=placed|pending&panelType=pap-vendor|eap
 * panelType:
 *  - pap-vendor => vendor orders (must have vendorName)
 *  - eap        => customer orders (must have userId)
 */
exports.getOrders = async (req, res) => {
  try {
    const { status, panelType, website } = req.query;

    /** --------------------
     * Base query
     * ------------------- */
    const query = {};

    // ✅ Always filter by website
    // If website is passed → use it
    // Else → default to "affordable"
    query.website = website || "affordable";

    // ✅ status filter
    if (status) {
      query.status = status;
    }

    // ✅ panel filtering
    if (panelType === "pap-vendor") {
      // vendor-based orders
      query.vendorName = { $exists: true, $ne: "" };
    } else if (panelType === "eap") {
      // customer orders (your schema uses userId)
      query.userId = { $exists: true, $ne: null };
    }

    /** --------------------
     * Fetch orders
     * ------------------- */
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .lean();

    /** --------------------
     * Attach user + address
     * ------------------- */
    const enrichedOrders = await Promise.all(
      orders.map(async (o) => {
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
      })
    );

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

    // ✅ Your orders are "placed", old code expected "pending"
    if (!["pending", "placed"].includes(order.status)) {
      return res.status(400).json({ message: `Order already ${order.status}` });
    }

    order.status = "approved";
    order.approvedAt = new Date();
    order.approvedBy = req.user?.id || null;

    await order.save();

    return res.json({ message: "Order approved", order });
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

    // ✅ Your orders are "placed", old code expected "pending"
    if (!["pending", "placed"].includes(order.status)) {
      return res.status(400).json({ message: `Order already ${order.status}` });
    }

    order.status = "rejected";
    order.rejectedAt = new Date();
    order.rejectedBy = req.user?.id || null;
    order.rejectionReason = reason || "";

    await order.save();

    return res.json({ message: "Order rejected", order });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const STATUS_FLOW = {
      placed: ["approved", "cancelled"],
      approved: ["confirmed", "cancelled"],
      confirmed: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
    };

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const allowedNext = STATUS_FLOW[order.status] || [];

    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        message: `Invalid status transition from '${order.status}' to '${status}'`,
      });
    }

    order.status = status;

    // optional history
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      status,
      changedBy: req.user?.id || null,
    });

    await order.save();

    return res.json({
      message: "Order status updated",
      order,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};
