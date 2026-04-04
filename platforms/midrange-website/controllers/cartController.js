const mongoose = require("mongoose");
const Cart = require("../models/MidRangeCart.js");
const Product = require("../../manufacturer-portal/models/Product.js");

const ALLOWED_TIER = "mid_range";
const ALLOWED_STATUS = "approved";

// ---------- Helper: compute price with discount and variant adjustment ----------
function computeFinalPrice(basePrice, discountPercent, variantPrice) {
  const safeBase = Number(basePrice) || 0;
  const safeDiscount = Number(discountPercent) || 0;
  const discountedBase = safeBase * (1 - safeDiscount / 100);
  const original = variantPrice !== undefined ? Number(variantPrice) : safeBase;
  const final = variantPrice !== undefined
    ? discountedBase + (Number(variantPrice) - safeBase)
    : discountedBase;
  return { originalPrice: original, finalPrice: final, discountAmount: original - final };
}

// ---------- Helper: build product snapshot from product and selected variant ----------
async function buildProductSnapshot(productId, variantId = null, attributes = {}) {
  try {
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

    const basePrice = product.price;
    const discountPercent = product.discount || 0;
    const variantPrice = variant?.price;
    const { originalPrice, finalPrice } = computeFinalPrice(basePrice, discountPercent, variantPrice);

    // Collect available options from product or variant
    const colors = variant?.attributes?.color ? [variant.attributes.color] : (Array.isArray(product.color) ? product.color : product.color ? [product.color] : []);
    const sizes = variant?.attributes?.size ? [variant.attributes.size] : (Array.isArray(product.size) ? product.size : product.size ? [product.size] : []);
    const fabrics = variant?.attributes?.fabric ? [variant.attributes.fabric] : (Array.isArray(product.fabricTypes) ? product.fabricTypes : product.fabricTypes ? [product.fabricTypes] : []);

    return {
      id: String(product._id),
      name: product.name,
      price: finalPrice,                     // final discounted price
      originalPrice: originalPrice,
      discountPercent: discountPercent,
      gst: product.gst || 0,
      isCustomized: product.isCustomized || false,
      finalPrice: finalPrice,
      image: variant?.image || product.image,
      category: product.category,
      inStock: (variant?.quantity || product.quantity) > 0,
      colors: colors.filter(Boolean),
      sizes: sizes.filter(Boolean),
      fabrics: fabrics.filter(Boolean),
      material: product.material,
      deliveryTime: product.deliveryTime,
      variantId: variantId || null,
      variantAttributes: variant ? {
        size: variant.attributes?.size || null,
        color: variant.attributes?.color || null,
        fabric: variant.attributes?.fabric || null,
      } : null,
    };
  } catch (error) {
    console.error("Error building product snapshot:", error);
    return null;
  }
}

// ---------- Helper: get cart with hydrated items ----------
async function buildHydratedCart(userId) {
  try {
    const cart = await Cart.findOne({ userId }).lean();
    if (!cart) return { userId, items: [] };

    // If items have snapshots, use them; otherwise fallback to live product data
    const items = await Promise.all(
      cart.items.map(async (item) => {
        if (item.productSnapshot && item.productSnapshot.name) {
          // Already has snapshot – use it
          return {
            _id: item._id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            attributes: item.attributes,
            productSnapshot: item.productSnapshot,
          };
        } else {
          // Old item without snapshot – generate from current product data
          const snapshot = await buildProductSnapshot(item.productId, item.variantId, item.attributes);
          if (!snapshot) return null;
          return {
            _id: item._id,
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
            attributes: item.attributes,
            productSnapshot: snapshot,
          };
        }
      })
    );

    return { userId, items: items.filter(Boolean) };
  } catch (error) {
    console.error("Error building hydrated cart:", error);
    return { userId, items: [] };
  }
}

// ---------- Endpoints ----------
exports.getCart = async (req, res) => {
  try {
    const paramUserId = req.params.id;
    const authUserId = req.user.id;
    
    if (String(paramUserId) !== String(authUserId)) {
      return res.status(403).json({ message: "Unauthorized access" });
    }
    
    if (!mongoose.Types.ObjectId.isValid(paramUserId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const hydrated = await buildHydratedCart(paramUserId);
    return res.json({ success: true, data: hydrated });
  } catch (err) {
    console.error("Error in getCart:", err);
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

      // Build snapshot for the item
      const snapshot = await buildProductSnapshot(productId, variantId, attributes);
      if (!snapshot) continue;

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
        productSnapshot: snapshot,
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
    return res.json({ success: true, data: hydrated, message: "Cart synced" });
  } catch (err) {
    console.error("Error in replaceCart:", err);
    return res.status(500).json({ message: err.message });
  }
};

exports.addToCart = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const userId = new mongoose.Types.ObjectId(req.user.id);
    const { productId, variantId = null, quantity = 1, attributes = {} } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "productId is required" });
    }

    // Build snapshot from current product data
    const snapshot = await buildProductSnapshot(productId, variantId, attributes);
    if (!snapshot) {
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
          productSnapshot: snapshot,
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
        // Refresh snapshot in case price/discount changed
        existing.productSnapshot = snapshot;
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
          productSnapshot: snapshot,
        });
      }
      await cart.save();
    }

    const hydrated = await buildHydratedCart(userId);
    return res.json({ success: true, data: hydrated, message: "Added to cart" });
  } catch (err) {
    console.error("Error in addToCart:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ✅ FIXED: Update cart item by item _id (not productId)
exports.updateCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params; // This should be the cart item's _id
    const { quantity } = req.body;
    const q = Number(quantity);

    if (isNaN(q) || q < 0) {
      return res.status(400).json({ message: "Invalid quantity" });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Find the item by its _id
    const item = cart.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (q === 0) {
      // Remove item if quantity is 0
      cart.items.pull(itemId);
    } else {
      item.quantity = q;
    }

    await cart.save();
    const hydrated = await buildHydratedCart(userId);
    return res.json({ success: true, data: hydrated, message: "Quantity updated" });
  } catch (err) {
    console.error("Error in updateCartItem:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ✅ FIXED: Remove cart item by item _id (not productId)
exports.removeCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params; // This should be the cart item's _id

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    // Remove the item by its _id
    cart.items.pull(itemId);
    await cart.save();

    const hydrated = await buildHydratedCart(userId);
    return res.json({ success: true, data: hydrated, message: "Item removed" });
  } catch (err) {
    console.error("Error in removeCartItem:", err);
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
    );

    const hydrated = await buildHydratedCart(userId);
    return res.json({ success: true, data: hydrated, message: "Cart cleared" });
  } catch (err) {
    console.error("Error in clearCart:", err);
    return res.status(500).json({ message: err.message });
  }
};

// ✅ NEW: Get cart item by ID for debugging
exports.getCartItem = async (req, res) => {
  try {
    const userId = req.user.id;
    const { itemId } = req.params;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const item = cart.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    return res.json({ success: true, data: item });
  } catch (err) {
    console.error("Error in getCartItem:", err);
    return res.status(500).json({ message: err.message });
  }
};