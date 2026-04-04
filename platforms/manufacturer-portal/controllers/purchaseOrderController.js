const mongoose = require("mongoose");
const PurchaseOrder = require("../../Admin/models/PurchaseOrder");
// controllers/productController.js
const Product = require("../models/Product");

exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    // Fetch product
    const product = await Product.findById(id).select("name sku price imageUrl brand category manufacturer stock");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Optional: check if the manufacturer has access to this product
    // if (req.user?.role === "manufacturer" && product.manufacturer.toString() !== req.user.id) {
    //   return res.status(403).json({ success: false, message: "Access denied" });
    // }

    return res.json({
      success: true,
      product: {
        _id: product._id,
        name: product.name,
        sku: product.sku,
        price: product.price,
        imageUrl: product.imageUrl,
        brand: product.brand,
        category: product.category,
        stock: product.stock,
      },
    });
  } catch (err) {
    console.error("getProductById error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
// ✅ GET orders for a manufacturer
exports.getOrdersByManufacturer = async (req, res) => {
  try {
    const { manufacturerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(manufacturerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid manufacturerId",
      });
    }

    // 🔒 optional safety: allow only own manufacturer orders
    // if (req.user.role === "manufacturer" && String(req.user.id) !== String(manufacturerId)) {
    //   return res.status(403).json({ success: false, message: "Access denied" });
    // }

    const orders = await PurchaseOrder.find({ manufacturer: manufacturerId })
      .sort({ createdAt: -1 });

    return res.json({ success: true, orders });
  } catch (err) {
    console.error("getOrdersByManufacturer error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};



// status flow rules
const ORDER_FLOW = {
  pending: ["accepted", "rejected"],
  accepted: ["packed", "shipped", "in_transit", "out_for_delivery", "delivered"],
  packed: ["shipped", "in_transit", "out_for_delivery", "delivered"],
  shipped: ["in_transit", "out_for_delivery", "delivered"],
  in_transit: ["out_for_delivery", "delivered"],
  out_for_delivery: ["delivered"],
  delivered: [],
  rejected: [],
};

exports.updateOrderStatusByManufacturer = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid orderId" });
    }

    const ALL = Object.keys(ORDER_FLOW);
    if (!ALL.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${ALL.join(", ")}`,
      });
    }

    // manufacturer can update only own order
    const filter =
      req.user?.role === "manufacturer"
        ? { _id: orderId, manufacturer: req.user.id }
        : { _id: orderId };

    const order = await PurchaseOrder.findOne(filter);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found or access denied",
      });
    }

    // ✅ normalize old statuses if you still have them in DB
    const currentStatus = (() => {
      if (order.status === "sent") return "pending";
      if (order.status === "completed") return "delivered";
      if (order.status === "draft") return "pending";
      return order.status;
    })();

    // already same status
    if (currentStatus === status) {
      return res.json({
        success: true,
        message: "Status already set",
        order,
      });
    }

    // ✅ enforce flow
    const allowedNext = ORDER_FLOW[currentStatus] || [];
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status change: ${currentStatus} → ${status}. Allowed: ${allowedNext.join(", ") || "none"}`,
      });
    }

    order.status = status;
    await order.save();

    return res.json({
      success: true,
      message: "Order status updated",
      order,
    });
  } catch (err) {
    console.error("updateOrderStatusByManufacturer error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};