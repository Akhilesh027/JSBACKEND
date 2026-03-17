const mongoose = require("mongoose");
const Cart = require("../models/MidRangeCart.js");
const Product = require("../../manufacturer-portal/models/Product.js");

const ALLOWED_TIER = "mid_range";
const ALLOWED_STATUS = "approved";

// ---------- Helpers ----------
async function getProductWithVariant(productId, variantId = null) {
  if (!mongoose.Types.ObjectId.isValid(productId)) return null;

  const product = await Product.findOne({
    _id: productId,
    tier: ALLOWED_TIER,
    status: ALLOWED_STATUS,
  }).lean();

  if (!product) return null;

  let variant = null;
  if (variantId && product.variants) {
    variant = product.variants.find((v) => String(v._id) === String(variantId));
  }

  return { product, variant };
}

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

  const items = cart.items
    .map((item) => {
      const product = productMap.get(String(item.productId));
      if (!product) return null;

      let variant = null;
      if (item.variantId && product.variants) {
        variant = product.variants.find((v) => String(v._id) === String(item.variantId));
      }

      return {
        _id: item._id,
        product,
        variant,
        quantity: item.quantity,
        attributes: item.attributes,
      };
    })
    .filter(Boolean);

  return { userId, items };
}

// ---------- Endpoints ----------
exports.getCart = async (req, res) => {
  try {
    const paramUserId = req.params.id;
    const authUserId = req.user.id;
    if (String(paramUserId) !== String(authUserId))
      return res.status(403).json({ message: "Unauthorized access" });
    if (!mongoose.Types.ObjectId.isValid(paramUserId))
      return res.status(400).json({ message: "Invalid user id" });

    const hydrated = await buildHydratedCart(paramUserId);
    return res.json({ data: hydrated });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.replaceCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    const safeItems = [];
    for (const it of items) {
      const productId = it?.productId;
      const variantId = it?.variantId || null;
      const qty = Math.max(1, Number(it?.quantity) || 1);
      const attributes = it?.attributes || {};

      if (!mongoose.Types.ObjectId.isValid(productId)) continue;

      const product = await getAllowedProduct(productId);
      if (!product) continue;

      if (variantId) {
        if (!product.variants) continue;
        const variant = product.variants.find((v) => String(v._id) === String(variantId));
        if (!variant) continue;
      }

      safeItems.push({
        _id: new mongoose.Types.ObjectId(),
        productId,
        variantId,
        quantity: qty,
        attributes: {
          size: attributes.size || null,
          color: attributes.color || null,
          fabric: attributes.fabric || null,
        },
      });
    }

    // Merge duplicates (same productId+variantId)
    const mergedMap = new Map();
    for (const it of safeItems) {
      const key = `${String(it.productId)}-${String(it.variantId || '')}`;
      const existing = mergedMap.get(key);
      if (existing) {
        existing.quantity += it.quantity;
      } else {
        mergedMap.set(key, it);
      }
    }
    const merged = Array.from(mergedMap.values());

    const cart = await Cart.findOneAndUpdate(
      { userId },
      { userId, items: merged },
      { new: true, upsert: true }
    ).lean();

    const hydrated = await buildHydratedCart(userId);
    return res.json({ data: hydrated, message: "Cart synced" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.addToCart = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ message: "Unauthorized" });

    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { productId, variantId, quantity = 1, attributes = {} } = req.body;

    if (!productId) return res.status(400).json({ message: "productId is required" });

    const productWithVariant = await getProductWithVariant(productId, variantId);
    if (!productWithVariant) {
      return res.status(400).json({ message: "Product not available" });
    }

    const qty = Math.max(1, Number(quantity) || 1);
    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = await Cart.create({
        userId,
        tier: "mid_range",
        items: [{
          _id: new mongoose.Types.ObjectId(),
          productId,
          variantId: variantId || null,
          quantity: qty,
          attributes: {
            size: attributes.size || null,
            color: attributes.color || null,
            fabric: attributes.fabric || null,
          },
        }],
      });
    } else {
      const existing = cart.items.find(
        (i) =>
          String(i.productId) === String(productId) &&
          (i.variantId ? String(i.variantId) : null) === (variantId ? String(variantId) : null)
      );

      if (existing) {
        existing.quantity += qty;
      } else {
        cart.items.push({
          _id: new mongoose.Types.ObjectId(),
          productId,
          variantId: variantId || null,
          quantity: qty,
          attributes: {
            size: attributes.size || null,
            color: attributes.color || null,
            fabric: attributes.fabric || null,
          },
        });
      }
      await cart.save();
    }

    const hydrated = await buildHydratedCart(userId);
    return res.json({ data: hydrated, message: "Added to cart" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;
    const { quantity } = req.body;
    const q = Number(quantity);

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ data: { userId, items: [] } });

    const item = cart.items.id(itemId);
    if (!item) return res.status(404).json({ message: "Item not found" });

    if (q <= 0) {
      cart.items.pull(itemId);
    } else {
      item.quantity = q;
    }

    await cart.save();
    const hydrated = await buildHydratedCart(userId);
    return res.json({ data: hydrated, message: "Quantity updated" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.removeCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;

    const cart = await Cart.findOne({ userId });
    if (!cart) return res.json({ data: { userId, items: [] } });

    cart.items.pull(itemId);
    await cart.save();

    const hydrated = await buildHydratedCart(userId);
    return res.json({ data: hydrated, message: "Item removed" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const cart = await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [] } },
      { new: true, upsert: true }
    ).lean();

    const hydrated = await buildHydratedCart(userId);
    return res.json({ data: hydrated, message: "Cart cleared" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};