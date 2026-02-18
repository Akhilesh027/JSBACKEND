const mongoose = require("mongoose");
const Cart = require("../models/Cart.js");
const Product = require("../../manufacturer-portal/models/Product");
const getVendorId = (req) =>
  req.user?.id || req.vendor?._id || req.vendorId || req.userId;

const ensureCart = async (vendorId) => {
  let cart = await Cart.findOne({ vendor: vendorId }).populate({
    path: "items.product",
    select: "name price image galleryImages availability quantity tier status category subcategory",
  });

  if (!cart) cart = await Cart.create({ vendor: vendorId, items: [] });

  return cart;
};

exports.getCart = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    if (!vendorId) return res.status(401).json({ message: "Unauthorized" });

    const cart = await ensureCart(vendorId);
    return res.json({ success: true, items: cart.items });
  } catch (err) {
    console.error("getCart error:", err);
    return res.status(500).json({ success: false, message: "Failed to load cart" });
  }
};

exports.addToCart = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    if (!vendorId) return res.status(401).json({ message: "Unauthorized" });

    const { productId, quantity = 1 } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid productId" });
    }

    const qty = Math.max(1, Number(quantity || 1));

    const product = await Product.findById(productId).select("status availability quantity");
    if (!product) return res.status(404).json({ message: "Product not found" });

    const cart = await ensureCart(vendorId);

    const idx = cart.items.findIndex((i) => String(i.product) === String(productId));
    if (idx >= 0) cart.items[idx].quantity += qty;
    else cart.items.push({ product: productId, quantity: qty });

    await cart.save();
    await cart.populate("items.product");

    return res.json({ success: true, items: cart.items });
  } catch (err) {
    console.error("addToCart error:", err);
    return res.status(500).json({ success: false, message: "Add to cart failed" });
  }
};

exports.updateCartQty = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    if (!vendorId) return res.status(401).json({ message: "Unauthorized" });

    const { productId } = req.params;
    const { quantity } = req.body;

    const qty = Math.max(1, Number(quantity || 1));

    const cart = await ensureCart(vendorId);

    const item = cart.items.find((i) => String(i.product) === String(productId));
    if (!item) return res.status(404).json({ message: "Item not in cart" });

    item.quantity = qty;

    await cart.save();
    await cart.populate("items.product");

    return res.json({ success: true, items: cart.items });
  } catch (err) {
    console.error("updateCartQty error:", err);
    return res.status(500).json({ success: false, message: "Update failed" });
  }
};

exports.removeCartItem = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    if (!vendorId) return res.status(401).json({ message: "Unauthorized" });

    const { productId } = req.params;

    const cart = await ensureCart(vendorId);
    cart.items = cart.items.filter((i) => String(i.product) !== String(productId));

    await cart.save();
    await cart.populate("items.product");

    return res.json({ success: true, items: cart.items });
  } catch (err) {
    console.error("removeCartItem error:", err);
    return res.status(500).json({ success: false, message: "Remove failed" });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    if (!vendorId) return res.status(401).json({ message: "Unauthorized" });

    const cart = await ensureCart(vendorId);
    cart.items = [];
    await cart.save();

    return res.json({ success: true, items: [] });
  } catch (err) {
    console.error("clearCart error:", err);
    return res.status(500).json({ success: false, message: "Clear cart failed" });
  }
};
