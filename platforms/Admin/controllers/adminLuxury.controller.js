const mongoose = require("mongoose");
const LuxuryOrder = require("../../luxury-website/models/luxury_orders"); // ✅ check path
const User = require("../../luxury-website/models/luxury_customers");     // ✅ optional
const VALID_STATUSES = new Set([
  "placed",
  "approved",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "rejected",
]);

// ✅ strict flow (same as your UI buttons)
const NEXT_ALLOWED = {
  placed: new Set(["approved", "rejected", "cancelled"]),
  approved: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["shipped", "cancelled"]),
  shipped: new Set(["delivered"]),
  delivered: new Set([]),
  cancelled: new Set([]),
  rejected: new Set([]),
};

// GET: /api/admin/luxury/orders?status=placed&paymentStatus=paid&q=LUX-&page=1&limit=30
exports.getLuxuryOrdersAdmin = async (req, res) => {
  try {
    const status = String(req.query.status || "all").trim();
    const paymentStatus = String(req.query.paymentStatus || "all").trim();
    const qText = String(req.query.q || "").trim();

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || "50", 10), 200));
    const skip = (page - 1) * limit;

    const filter = {};
    if (status && status !== "all") filter.status = status;
    if (paymentStatus && paymentStatus !== "all") filter["payment.status"] = paymentStatus;

    // search by orderNumber / customer email / phone
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
        .populate("customerId", "firstName lastName email phone") // ✅ customer ref
        .lean(),
      LuxuryOrder.countDocuments(filter),
    ]);

    const data = orders.map((o) => {
      const customer = o.customerId
        ? {
            _id: String(o.customerId._id),
            name: `${o.customerId.firstName || ""} ${o.customerId.lastName || ""}`.trim(),
            email: o.customerId.email,
            phone: o.customerId.phone,
          }
        : undefined;

      // ✅ shippingAddress is embedded in your schema
      const addressDetails = o.shippingAddress
        ? {
            label: o.shippingAddress.label,
            firstName: o.shippingAddress.firstName,
            lastName: o.shippingAddress.lastName,
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

      return {
        ...o,
        website: o.website || "luxury",
        userDetails: o.userDetails || customer,
        addressDetails: o.addressDetails || addressDetails,
      };
    });

    return res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Luxury orders error:", err);
    return res.status(500).json({ success: false, message: "Failed to load luxury orders" });
  }
};

/* =========================================================
   PATCH: /api/admin/luxury/orders/:id/confirm
   placed -> confirmed
========================================================= */
exports.confirmLuxuryOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid order id" });
    }

    const order = await LuxuryOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    // ✅ only placed can be confirmed
    if (String(order.status) !== "placed") {
      return res.status(400).json({
        success: false,
        message: `Only placed orders can be confirmed. Current: ${order.status}`,
      });
    }

    order.status = "confirmed";
    await order.save();

    return res.json({ success: true, message: "Confirmed", order });
  } catch (err) {
    console.error("Luxury confirm error:", err);
    return res.status(500).json({ success: false, message: "Confirm failed" });
  }
};

/* =========================================================
   PATCH: /api/admin/luxury/orders/:id/cancel
   placed/confirmed/processing -> cancelled
   (optional reason stored in notes)
========================================================= */
exports.cancelLuxuryOrderAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason || "").trim();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid order id" });
    }

    const order = await LuxuryOrder.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    // block cancel after shipped/delivered/returned
    const blocked = ["shipped", "delivered", "returned"].includes(String(order.status));
    if (blocked) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel order when status is "${order.status}"`,
      });
    }

    order.status = "cancelled";

    // store reason safely in notes (since your schema has notes)
    if (reason) {
      order.notes = order.notes ? `${order.notes}\n[Admin Cancel]: ${reason}` : `[Admin Cancel]: ${reason}`;
    }

    await order.save();

    return res.json({ success: true, message: "Cancelled", order });
  } catch (err) {
    console.error("Luxury cancel error:", err);
    return res.status(500).json({ success: false, message: "Cancel failed" });
  }
};
exports.updateLuxuryOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const next = String(req.body?.status || "").toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid order id" });

    if (!VALID_STATUSES.has(next))
      return res.status(400).json({ message: "Invalid status" });

    const order = await LuxuryOrder.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const current = String(order.status || "").toLowerCase();

    const allowed = NEXT_ALLOWED[current] || new Set();
    if (!allowed.has(next)) {
      return res.status(400).json({
        message: `Not allowed: ${current} -> ${next}`,
      });
    }

    order.status = next;

    // optional timestamps
    if (next === "confirmed") order.confirmedAt = new Date();
    if (next === "shipped") order.shippedAt = new Date();
    if (next === "delivered") order.deliveredAt = new Date();
    if (next === "cancelled") order.cancelledAt = new Date();

    await order.save();

    return res.json({ message: "Status updated", order: order.toObject() });
  } catch (err) {
    console.error("updateLuxuryOrderStatus:", err);
    return res.status(500).json({ message: "Failed to update status" });
  }
};