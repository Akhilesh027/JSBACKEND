const Order = require("../models/AffordableOrder");
const Address = require("../models/AffordableAddress");
const Customer = require("../models/affordable_customers"); // ✅ adjust path if needed

// helper
const safeName = (u) =>
  (u?.fullName || u?.name || `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || "").trim();

/**
 * POST /api/affordable/orders
 * body: { userId, addressId, items, pricing, payment }
 */
exports.createOrder = async (req, res) => {
  try {
    const { userId, addressId, items, pricing, payment } = req.body;

    if (!userId || !addressId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Missing order fields" });
    }

    // ✅ validate address belongs to the user
    const address = await Address.findOne({ _id: addressId, userId }).lean();
    if (!address) {
      return res.status(404).json({ error: "Address not found for this user" });
    }

    const total = Number(pricing?.total || 0);

    const order = await Order.create({
      userId,
      addressId,
      items,
      pricing: {
        subtotal: Number(pricing?.subtotal || 0),
        discount: Number(pricing?.discount || 0),
        shippingCost: Number(pricing?.shippingCost || 0),
        total,
      },
      payment: {
        method: payment?.method || "cod",
        upiId: payment?.upiId || "",
        cardLast4: payment?.cardLast4 || "",
        status: payment?.status || "pending",
      },
      status: "placed",
    });

    // ✅ IMPORTANT: update customer order history + totals
    await Customer.findByIdAndUpdate(
      userId,
      {
        $addToSet: { orders: order._id },      // avoid duplicates
        $inc: { totalOrders: 1, totalSpent: total },
      },
      { new: true }
    );

    return res.status(201).json({ order });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to create order" });
  }
};

/**
 * GET /api/affordable/orders/:userId
 * return enriched order list
 */
exports.getOrdersByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // ✅ fetch user once
    const user = await Customer.findById(userId)
      .select("firstName lastName name fullName email phone")
      .lean();

    const orders = await Order.find({ userId })
      .populate("addressId") // gives address doc in addressId
      .sort({ createdAt: -1 })
      .lean();

    const enriched = orders.map((o) => ({
      ...o,
      userDetails: user
        ? {
            _id: user._id,
            name: safeName(user),
            email: user.email,
            phone: user.phone,
          }
        : null,
      // ✅ frontend wants addressDetails
      addressDetails: o.addressId || null,
    }));

    return res.json({ orders: enriched });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch orders" });
  }
};
