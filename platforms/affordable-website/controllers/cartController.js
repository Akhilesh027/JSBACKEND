const Cart = require("../models/Cart");

const calcTotals = (items = []) => {
  const totalItems = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const subtotal = items.reduce(
    (sum, i) => sum + (Number(i.productSnapshot?.price || 0) * Number(i.quantity || 0)),
    0
  );
  return { totalItems, subtotal };
};

// GET /api/cart/:userId

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

// POST /api/cart/add
exports.addToCart = async (req, res) => {
  try {
    const { userId, productId, quantity = 1, productSnapshot } = req.body;

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!productId) return res.status(400).json({ error: "productId is required" });
    if (Number(quantity) < 1) return res.status(400).json({ error: "quantity must be >= 1" });

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = await Cart.create({ userId, items: [] });

    const idx = cart.items.findIndex((i) => String(i.productId) === String(productId));

    if (idx >= 0) {
      cart.items[idx].quantity += Number(quantity);
      // keep snapshot fresh if provided
      if (productSnapshot) cart.items[idx].productSnapshot = productSnapshot;
    } else {
      cart.items.push({
        productId,
        quantity: Number(quantity),
        productSnapshot: productSnapshot || {},
      });
    }

    await cart.save();
    const totals = calcTotals(cart.items);

    return res.json({ message: "Added to cart", items: cart.items, ...totals });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
};

// PUT /api/cart/update/:userId/:productId/:quantity
exports.updateQuantity = async (req, res) => {
  try {
    const { userId, productId, quantity } = req.params;
    const q = Number(quantity);

    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!productId) return res.status(400).json({ error: "productId is required" });

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = await Cart.create({ userId, items: [] });

    if (q < 1) {
      cart.items = cart.items.filter((i) => String(i.productId) !== String(productId));
      await cart.save();
      const totals = calcTotals(cart.items);
      return res.json({ message: "Removed (qty < 1)", items: cart.items, ...totals });
    }

    const idx = cart.items.findIndex((i) => String(i.productId) === String(productId));
    if (idx === -1) return res.status(404).json({ error: "Item not found in cart" });

    cart.items[idx].quantity = q;

    await cart.save();
    const totals = calcTotals(cart.items);
    return res.json({ message: "Quantity updated", items: cart.items, ...totals });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
};

// DELETE /api/cart/remove/:userId/:productId
exports.removeItem = async (req, res) => {
  try {
    const { userId, productId } = req.params;

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = await Cart.create({ userId, items: [] });

    cart.items = cart.items.filter((i) => String(i.productId) !== String(productId));

    await cart.save();
    const totals = calcTotals(cart.items);

    return res.json({ message: "Item removed", items: cart.items, ...totals });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
};

// DELETE /api/cart/clear/:userId
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
