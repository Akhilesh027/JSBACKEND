// controllers/luxuryCart.controller.js
const mongoose = require("mongoose");
const LuxuryCart = require("../models/LuxuryCart.js");

// Helper: normalise incoming items to match server schema
const normalizeItems = (items = []) =>
  items
    .filter(Boolean)
    .map((it) => ({
      productId: it.productId, // must be product _id
      variantId: it.variantId || null,
      attributes: {
        size: it.attributes?.size || null,
        color: it.attributes?.color || null,
        fabric: it.attributes?.fabric || null,
      },
      name: it.name,
      price: Number(it.price || 0),               // final discounted price
      originalPrice: Number(it.originalPrice || it.price || 0),
      discountPercent: Number(it.discountPercent || 0),
      gst: Number(it.gst ?? 0),                  // ✅ GST
      isCustomized: Boolean(it.isCustomized ?? false), // ✅ customization
      image: it.image || "",
      quantity: Math.max(1, Number(it.quantity || 1)),
    }))
    .filter((it) => mongoose.Types.ObjectId.isValid(it.productId));

// Helper: generate a unique key for merging (productId + variantId + attributes)
const itemKey = (it) => {
  const base = String(it.productId);
  const variant = it.variantId ? String(it.variantId) : 'null';
  const color = it.attributes?.color || 'null';
  const size = it.attributes?.size || 'null';
  const fabric = it.attributes?.fabric || 'null';
  return `${base}::${variant}::${color}::${size}::${fabric}`;
};

// Helper: map server item to frontend shape (includes all fields)
const toFrontendItem = (it) => ({
  _id: String(it._id),
  id: String(it.productId),
  variantId: it.variantId ? String(it.variantId) : null,
  attributes: it.attributes,
  name: it.name,
  price: it.price,
  originalPrice: it.originalPrice,
  discountPercent: it.discountPercent,
  gst: it.gst,
  isCustomized: it.isCustomized,
  image: it.image,
  quantity: it.quantity,
});

exports.getCart = async (req, res) => {
  try {
    const customerId = req.user.id;

    let cart = await LuxuryCart.findOne({ customerId });
    if (!cart) cart = await LuxuryCart.create({ customerId, items: [] });

    const items = cart.items.map(toFrontendItem);

    res.json({ success: true, items });
  } catch (e) {
    console.error("getCart error:", e);
    res.status(500).json({ success: false, message: "Failed to load cart" });
  }
};

exports.updateCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    const incoming = normalizeItems(req.body?.items || []);

    // Replace entire cart
    const cart = await LuxuryCart.findOneAndUpdate(
      { customerId },
      { $set: { items: incoming.map(it => ({ ...it, _id: new mongoose.Types.ObjectId() })) } },
      { upsert: true, new: true }
    );

    const items = cart.items.map(toFrontendItem);

    res.json({ success: true, items });
  } catch (e) {
    console.error("updateCart error:", e);
    res.status(500).json({ success: false, message: "Failed to update cart" });
  }
};

exports.mergeCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    const incoming = normalizeItems(req.body?.items || []);

    let cart = await LuxuryCart.findOne({ customerId });
    if (!cart) cart = await LuxuryCart.create({ customerId, items: [] });

    // Merge by composite key (productId + variantId + attributes)
    const mergedMap = new Map();
    for (const it of cart.items) {
      mergedMap.set(itemKey(it), it);
    }

    for (const it of incoming) {
      const key = itemKey(it);
      if (mergedMap.has(key)) {
        mergedMap.get(key).quantity += it.quantity;
        // Optionally update price/discount if they changed (but keep original snapshot)
        const existing = mergedMap.get(key);
        existing.price = it.price;
        existing.originalPrice = it.originalPrice;
        existing.discountPercent = it.discountPercent;
        existing.gst = it.gst;
        existing.isCustomized = it.isCustomized;
      } else {
        mergedMap.set(key, { ...it, _id: new mongoose.Types.ObjectId() });
      }
    }

    cart.items = Array.from(mergedMap.values());
    await cart.save();

    const items = cart.items.map(toFrontendItem);

    res.json({ success: true, items });
  } catch (e) {
    console.error("mergeCart error:", e);
    res.status(500).json({ success: false, message: "Failed to merge cart" });
  }
};

// Optional: Update a single cart item by its _id
exports.updateCartItem = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { itemId } = req.params;
    const { quantity } = req.body;

    const q = Number(quantity);
    if (isNaN(q) || q < 0) {
      return res.status(400).json({ success: false, message: "Invalid quantity" });
    }

    const cart = await LuxuryCart.findOne({ customerId });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const item = cart.items.id(itemId);
    if (!item) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    if (q === 0) {
      cart.items.pull(itemId);
    } else {
      item.quantity = q;
    }

    await cart.save();

    const items = cart.items.map(toFrontendItem);
    res.json({ success: true, items });
  } catch (e) {
    console.error("updateCartItem error:", e);
    res.status(500).json({ success: false, message: "Failed to update item" });
  }
};

// Optional: Remove an item by its _id
exports.removeCartItem = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { itemId } = req.params;

    const cart = await LuxuryCart.findOne({ customerId });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    cart.items.pull(itemId);
    await cart.save();

    const items = cart.items.map(toFrontendItem);
    res.json({ success: true, items });
  } catch (e) {
    console.error("removeCartItem error:", e);
    res.status(500).json({ success: false, message: "Failed to remove item" });
  }
};