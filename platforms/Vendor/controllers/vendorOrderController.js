const mongoose = require("mongoose");
const VendorOrder = require("../models/VendorOrder.js");
const VendorCart = require("../models/Cart");
const VendorAddress = require("../models/VendorAddress");

const GST_RATE_DEFAULT = 0.18;

const getVendorId = (req) => req.user?.id || req.vendor?._id || req.vendorId;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const round2 = (num) => Math.round(Number(num || 0) * 100) / 100;

exports.placeOrder = async (req, res) => {
  try {
    const vendorId = getVendorId(req);

    if (!vendorId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { addressId, note = "" } = req.body;

    if (!addressId || !isValidObjectId(addressId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid addressId",
      });
    }

    // 1) Load vendor address
    const address = await VendorAddress.findOne({
      _id: addressId,
      vendor: vendorId,
    }).lean();

    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    // 2) Load cart with products
    const cart = await VendorCart.findOne({ vendor: vendorId })
      .populate("items.product")
      .lean();

    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    // 3) Build item snapshot
    const items = [];
    let subtotal = 0;

    for (const ci of cart.items) {
      const p = ci?.product;

      if (!p || !p._id) continue;

      // optional approval check
      if (p.status && p.status !== "approved") {
        return res.status(400).json({
          success: false,
          message: `Product not approved: ${p.name || "Unknown product"}`,
        });
      }

      const qty = Math.max(1, Number(ci.quantity || 1));
      const unitPrice = Number(p.price || 0);
      const lineTotal = round2(unitPrice * qty);

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

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid items in cart",
      });
    }

    subtotal = round2(subtotal);
    const gstRate = GST_RATE_DEFAULT;
    const gstAmount = round2(subtotal * gstRate);
    const total = round2(subtotal + gstAmount);

    // 4) Create order
    const order = await VendorOrder.create({
      vendor: vendorId,
      items,
      shippingAddress: {
        fullName: address.fullName || "",
        phone: address.phone || "",
        addressLine1: address.addressLine1 || "",
        addressLine2: address.addressLine2 || "",
        city: address.city || "",
        state: address.state || "",
        pincode: address.pincode || "",
      },
      pricing: {
        subtotal,
        gstRate,
        gstAmount,
        total,
      },
      note: String(note || "").trim(),
      status: "Placed",
    });

    // 5) Clear cart
    await VendorCart.updateOne(
      { vendor: vendorId },
      { $set: { items: [] } }
    );

    return res.status(201).json({
      success: true,
      message: "Order request created",
      order,
    });
  } catch (e) {
    console.error("placeOrder error:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to place order",
    });
  }
};

// GET /api/vendor/orders
exports.getMyOrders = async (req, res) => {
  try {
    const vendorId = getVendorId(req);

    if (!vendorId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const orders = await VendorOrder.find({ vendor: vendorId })
      .sort({ createdAt: -1 })
      .select("orderNumber status pricing.total pricing.subtotal pricing.gstAmount createdAt items shippingAddress");

    return res.status(200).json({
      success: true,
      orders,
    });
  } catch (e) {
    console.error("getMyOrders error:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
    });
  }
};

// GET /api/vendor/orders/:orderId
exports.getOrderById = async (req, res) => {
  try {
    const vendorId = getVendorId(req);

    if (!vendorId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { orderId } = req.params;

    if (!orderId || !isValidObjectId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid orderId",
      });
    }

    const order = await VendorOrder.findOne({
      _id: orderId,
      vendor: vendorId,
    }).populate("items.product", "name image price sku");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (e) {
    console.error("getOrderById error:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch order",
    });
  }
};

// GET /api/admin/vendor-orders
exports.getAllVendorOrders = async (req, res) => {
  try {
    const orders = await VendorOrder.find()
      .populate("vendor", "businessName name email phone")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      orders,
    });
  } catch (e) {
    console.error("getAllVendorOrders error:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch all vendor orders",
    });
  }
};

// GET /api/vendor/orders/track/:trackingId
exports.trackOrder = async (req, res) => {
  try {
    const { trackingId } = req.params;

    if (!trackingId || !String(trackingId).trim()) {
      return res.status(400).json({
        success: false,
        message: "Tracking ID is required",
      });
    }

    const order = await VendorOrder.findOne({
      $or: [
        { orderNumber: String(trackingId).trim() },
        { awb: String(trackingId).trim() },
      ],
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Tracking ID not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: order._id,
        orderNumber: order.orderNumber,
        awb: order.awb || null,
        status: order.status,
        courier: order.courier || "—",
        expectedDelivery: order.expectedDelivery || null,
        deliveryLocation: order.shippingAddress?.city || "—",
        shippingAddress: order.shippingAddress || null,
        events: Array.isArray(order.events) ? order.events : [],
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });
  } catch (e) {
    console.error("trackOrder error:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to track order",
    });
  }
};