// controllers/cartController.js
const mongoose = require("mongoose");
const Cart = require("../models/MidRangeCart.js");
const Product = require("../../manufacturer-portal/models/Product.js");

const ALLOWED_TIER = "mid_range";
const ALLOWED_STATUS = "approved";

async function getAllowedProduct(productId) {
  if (!mongoose.Types.ObjectId.isValid(productId)) return null;

  return Product.findOne({
    _id: productId,
    tier: ALLOWED_TIER,
    status: ALLOWED_STATUS,
  }).lean();
}

async function buildHydratedCart(userId) {
  const cart = await Cart.findOne({ userId }).lean();
  if (!cart) return { userId, items: [] };

  const productIds = cart.items.map((i) => i.productId);
  const products = await Product.find({
    _id: { $in: productIds },
    tier: ALLOWED_TIER,
    status: ALLOWED_STATUS,
  }).lean();

  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const cleaned = cart.items
    .map((i) => {
      const p = productMap.get(String(i.productId));
      if (!p) return null;
      return { product: p, quantity: i.quantity };
    })
    .filter(Boolean);

  return { userId, items: cleaned };
}


exports.getCart = async (req, res) => {
  try {
    const paramUserId = req.params.id;
    const authUserId = req.user.id;

    // 🔐 Security: user can access ONLY their own cart
    if (String(paramUserId) !== String(authUserId)) {
      return res.status(403).json({ message: "Unauthorized access" });
    }

    if (!mongoose.Types.ObjectId.isValid(paramUserId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const cart = await Cart.findOne({ userId: paramUserId }).lean();

    if (!cart) {
      return res.json({
        data: {
          userId: paramUserId,
          items: [],
        },
      });
    }

    // collect product ids
    const productIds = cart.items.map((i) => i.productId);

    // fetch only allowed products
    const products = await Product.find({
      _id: { $in: productIds },
      tier: ALLOWED_TIER,
      status: ALLOWED_STATUS,
    }).lean();

    const productMap = new Map(
      products.map((p) => [String(p._id), p])
    );

    // hydrate + clean invalid items
    const items = cart.items
      .map((item) => {
        const product = productMap.get(String(item.productId));
        if (!product) return null;

        return {
          product,
          quantity: item.quantity,
        };
      })
      .filter(Boolean);

    return res.json({
      data: {
        userId: paramUserId,
        items,
      },
    });
  } catch (err) {
    console.error("GET CART ERROR:", err);
    return res.status(500).json({
      message: err.message || "Server error",
    });
  }
};

/**
 * PUT /api/cart
 * Body: { items: [{ productId, quantity }] }
 * Replace entire cart (sync from frontend localStorage)
 */
exports.replaceCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    // validate + keep only allowed products
    const safeItems = [];
    for (const it of items) {
      const pid = it?.productId;
      const qty = Math.max(1, Number(it?.quantity) || 1);

      const allowed = await getAllowedProduct(pid);
      if (!allowed) continue;

      safeItems.push({ productId: allowed._id, quantity: qty });
    }

    // merge duplicates (same productId)
    const mergedMap = new Map();
    for (const it of safeItems) {
      const key = String(it.productId);
      mergedMap.set(key, (mergedMap.get(key) || 0) + it.quantity);
    }
    const merged = Array.from(mergedMap.entries()).map(([k, q]) => ({
      productId: k,
      quantity: q,
    }));

    const cart = await Cart.findOneAndUpdate(
      { userId },
      { userId, items: merged },
      { new: true, upsert: true }
    ).lean();

    return res.json({ data: cart, message: "Cart synced" });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

/**
 * POST /api/cart/add
 * Body: { productId, quantity }
 * Adds (increments) one product
 */
exports.addToCart = async (req, res) => {
  try {
    // ✅ auth check
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized (missing token)" });
    }

    const userId = new mongoose.Types.ObjectId(req.user.id);

    const { productId, quantity = 1 } = req.body || {};

    if (!productId) {
      return res.status(400).json({ message: "productId is required" });
    }

    const allowed = await getAllowedProduct(productId);
    if (!allowed) {
      return res.status(400).json({
        message: "Product not available (must be mid_range + approved)",
      });
    }

    const qty = Math.max(1, Number(quantity) || 1);

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = await Cart.create({
        userId,
        tier: "mid_range",
        items: [{ productId: allowed._id, quantity: qty }],
      });

      const hydrated = await buildHydratedCart(userId);
      return res.json({ data: hydrated, message: "Added to cart" });
    }

    const idx = cart.items.findIndex(
      (i) => String(i.productId) === String(allowed._id)
    );

    if (idx >= 0) cart.items[idx].quantity += qty;
    else cart.items.push({ productId: allowed._id, quantity: qty });

    await cart.save();

    const hydrated = await buildHydratedCart(userId);
    return res.json({ data: hydrated, message: "Added to cart" });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};


/**
 * PATCH /api/cart/item/:productId
 * Body: { quantity }
 * Updates quantity (if quantity <= 0 => remove)
 */
exports.updateCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;
    const { quantity } = req.body;

    const q = Number(quantity);

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ data: { userId, items: [] } });

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    // if <=0 remove
    if (!q || q <= 0) {
      cart.items = cart.items.filter((i) => String(i.productId) !== String(productId));
      await cart.save();
      return res.json({ data: cart, message: "Item removed" });
    }

    // validate product still allowed
    const allowed = await getAllowedProduct(productId);
    if (!allowed) {
      cart.items = cart.items.filter((i) => String(i.productId) !== String(productId));
      await cart.save();
      return res.status(400).json({ data: cart, message: "Product not available, removed" });
    }

    const idx = cart.items.findIndex((i) => String(i.productId) === String(productId));
    if (idx === -1) {
      cart.items.push({ productId, quantity: Math.max(1, q) });
    } else {
      cart.items[idx].quantity = Math.max(1, q);
    }

    await cart.save();
    return res.json({ data: cart, message: "Quantity updated" });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

/**
 * DELETE /api/cart/item/:productId
 */
exports.removeCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ data: { userId, items: [] } });

    cart.items = cart.items.filter((i) => String(i.productId) !== String(productId));
    await cart.save();

    return res.json({ data: cart, message: "Item removed" });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

/**
 * DELETE /api/cart
 * Clears cart
 */
exports.clearCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [] } },
      { new: true, upsert: true }
    ).lean();

    return res.json({ data: cart, message: "Cart cleared" });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};
