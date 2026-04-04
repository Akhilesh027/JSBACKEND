const Cart = require("../models/Cart");
const mongoose = require("mongoose");

const calcTotals = (items = []) => {
  const totalItems = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  // Use finalPrice (or price as fallback) for subtotal
  const subtotal = items.reduce(
    (sum, i) => sum + (Number(i.productSnapshot?.finalPrice || i.productSnapshot?.price || 0) * Number(i.quantity || 0)),
    0
  );
  return { totalItems, subtotal };
};

// GET /api/cart/affordable/:userId
exports.getCart = async (req, res) => {
  try {
    const { userId } = req.params;

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = await Cart.create({ userId, items: [] });

    return res.json({ items: cart.items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// POST /api/cart/affordable/add
exports.addToCart = async (req, res) => {
  try {
    const {
      userId,
      productId,
      variantId = null,
      quantity = 1,
      attributes = {},
      productSnapshot,
    } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!productId) return res.status(400).json({ error: "productId is required" });
    if (Number(quantity) < 1) return res.status(400).json({ error: "quantity must be >= 1" });

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = await Cart.create({ userId, items: [] });

    // Find existing item with same productId AND same variantId
    const existingItem = cart.items.find(
      (i) =>
        String(i.productId) === String(productId) &&
        (i.variantId ? String(i.variantId) : null) === (variantId ? String(variantId) : null)
    );

    // Build complete productSnapshot with defaults
    const finalPrice = productSnapshot?.finalPrice ?? productSnapshot?.price ?? 0;
    const discount = productSnapshot?.discount ?? 0;
    const gst = productSnapshot?.gst ?? 0;
    const isCustomized = productSnapshot?.isCustomized ?? false;

    const fullSnapshot = {
      name: productSnapshot?.name || "",
      price: finalPrice,
      originalPrice: productSnapshot?.originalPrice ?? finalPrice,
      discount,
      gst,
      isCustomized,
      finalPrice,
      image: productSnapshot?.image || "",
      category: productSnapshot?.category || "",
      inStock: productSnapshot?.inStock ?? true,
      colors: productSnapshot?.colors || [],
      sizes: productSnapshot?.sizes || [],
      fabrics: productSnapshot?.fabrics || [],
    };

    if (existingItem) {
      // Update quantity and optionally refresh snapshot
      existingItem.quantity += Number(quantity);
      if (productSnapshot) existingItem.productSnapshot = fullSnapshot;
    } else {
      // Create new item
      cart.items.push({
        _id: new mongoose.Types.ObjectId(),
        productId,
        variantId: variantId || null,
        quantity: Number(quantity),
        attributes: {
          size: attributes.size || null,
          color: attributes.color || null,
          fabric: attributes.fabric || null,
        },
        productSnapshot: fullSnapshot,
      });
    }

    await cart.save();
    const totals = calcTotals(cart.items);

    return res.json({ message: "Added to cart", items: cart.items, ...totals });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
};

// PUT /api/cart/affordable/update/:userId/:itemId/:quantity
exports.updateQuantity = async (req, res) => {
  try {
    const { userId, itemId, quantity } = req.params;
    const q = Number(quantity);

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!itemId) return res.status(400).json({ error: "itemId is required" });

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = await Cart.create({ userId, items: [] });

    const item = cart.items.id(itemId);
    if (!item) return res.status(404).json({ error: "Item not found" });

    if (q < 1) {
      cart.items.pull(itemId);
    } else {
      item.quantity = q;
    }

    await cart.save();
    const totals = calcTotals(cart.items);
    return res.json({ message: "Quantity updated", items: cart.items, ...totals });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
};

// DELETE /api/cart/affordable/remove/:userId/:itemId
exports.removeItem = async (req, res) => {
  try {
    const { userId, itemId } = req.params;

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = await Cart.create({ userId, items: [] });

    cart.items.pull(itemId);

    await cart.save();
    const totals = calcTotals(cart.items);

    return res.json({ message: "Item removed", items: cart.items, ...totals });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
};

// DELETE /api/cart/affordable/clear/:userId
exports.clearCart = async (req, res) => {
  try {
    const { userId } = req.params;

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = await Cart.create({ userId, items: [] });

    cart.items = [];
    await cart.save();

    return res.json({ message: "Cart cleared", items: [], totalItems: 0, subtotal: 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
};