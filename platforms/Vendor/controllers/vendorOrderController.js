const mongoose = require("mongoose");
const VendorOrder = require("../models/VendorOrder.js");
const VendorCart = require("../models/Cart"); // your VendorCart model (VendorCart/VendorCart.js)
const VendorAddress = require("../models/VendorAddress");

const GST_RATE_DEFAULT = 0.18;

const getVendorId = (req) => req.user?.id || req.vendor?._id || req.vendorId;

exports.placeOrder = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    if (!vendorId) return res.status(401).json({ message: "Unauthorized" });

    const { addressId, note = "" } = req.body;

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ message: "Invalid addressId" });
    }

    // 1) Load Address (must belong to vendor)
    const address = await VendorAddress.findOne({ _id: addressId, vendor: vendorId }).lean();
    if (!address) return res.status(404).json({ message: "Address not found" });

    // 2) Load Cart
    const cart = await VendorCart.findOne({ vendor: vendorId }).populate("items.product").lean();
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // 3) Build order items snapshot + validate products
    const items = [];
    let subtotal = 0;

    for (const ci of cart.items) {
      const p = ci.product;
      if (!p) continue;

      // optional: only allow approved products
      if (p.status && p.status !== "approved") {
        return res.status(400).json({ message: `Product not approved: ${p.name}` });
      }

      const qty = Math.max(1, Number(ci.quantity || 1));
      const unitPrice = Number(p.price || 0);
      const lineTotal = unitPrice * qty;

      subtotal += lineTotal;

      items.push({
        product: p._id,
        name: p.name || "",
        sku: p.sku || "",
        image: p.image || "",
        tier: p.tier || "",
        category: p.category || "",
        subcategory: p.subcategory || "",
        material: p.material || "",
        color: p.color || "",
        size: p.size || "",
        unitPrice,
        quantity: qty,
        lineTotal,
      });
    }

    if (items.length === 0) return res.status(400).json({ message: "No valid items in cart" });

    const gstRate = GST_RATE_DEFAULT;
    const gstAmount = Math.round(subtotal * gstRate * 100) / 100;
    const total = Math.round((subtotal + gstAmount) * 100) / 100;

    // 4) Save order (address snapshot)
    const order = await VendorOrder.create({
      vendor: vendorId,
      items,
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2 || "",
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      },
      pricing: { subtotal, gstRate, gstAmount, total },
      note: String(note || "").trim(),
      status: "pending",
    });

    // 5) Clear cart after order created
    await VendorCart.updateOne({ vendor: vendorId }, { $set: { items: [] } });

    return res.status(201).json({
      success: true,
      message: "Order request created",
      order,
    });
  } catch (e) {
    console.error("placeOrder error:", e);
    return res.status(500).json({ success: false, message: "Failed to place order" });
  }
};

// GET /api/vendor/orders
exports.getMyOrders = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    if (!vendorId) return res.status(401).json({ message: "Unauthorized" });

    const orders = await VendorOrder.find({ vendor: vendorId })
      .sort({ createdAt: -1 })
      .select("orderNumber status pricing.total createdAt items");

    return res.json({ success: true, orders });
  } catch (e) {
    console.error("getMyOrders error:", e);
    return res.status(500).json({ success: false, message: "Failed to fetch orders" });
  }
};

// GET /api/vendor/orders/:orderId
exports.getOrderById = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    if (!vendorId) return res.status(401).json({ message: "Unauthorized" });

    const { orderId } = req.params;
    const order = await VendorOrder.findOne({ _id: orderId, vendor: vendorId })
      .populate("items.product", "name image price"); // optional

    if (!order) return res.status(404).json({ message: "Order not found" });

    return res.json({ success: true, order });
  } catch (e) {
    console.error("getOrderById error:", e);
    return res.status(500).json({ success: false, message: "Failed to fetch order" });
  }
};
exports.getAllVendorOrders = async (req, res) => {
  const orders = await VendorOrder.find()
    .populate("vendor", "businessName name email")
    .sort({ createdAt: -1 });

  res.json({ success: true, orders });
};
// controllers/vendorOrderController.js
exports.trackOrder = async (req, res) => {
  const { trackingId } = req.params;

  const order = await VendorOrder.findOne({
    $or: [{ orderNumber: trackingId }, { awb: trackingId }],
  });

  if (!order) return res.status(404).json({ message: "Tracking ID not found" });

  // return tracking fields (add these in model if needed)
  res.json({
    success: true,
    data: {
      _id: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      courier: order.courier || "—",
      expectedDelivery: order.expectedDelivery || null,
      deliveryLocation: order.shippingAddress?.city || "—",
      events: order.events || [],
    },
  });
};
