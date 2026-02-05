// server/controllers/luxuryCart.controller.js
const mongoose = require("mongoose");
const LuxuryCart = require("../models/LuxuryCart.js");

const normalizeItems = (items = []) =>
  items
    .filter(Boolean)
    .map((it) => ({
      productId: it.id,
      name: it.name,
      price: Number(it.price || 0),
      image: it.image || "",
      color: it.color || "",
      quantity: Math.max(1, Number(it.quantity || 1)),
    }))
    .filter((it) => mongoose.Types.ObjectId.isValid(it.productId));

exports.getCart = async (req, res) => {
  try {
    const customerId = req.user.id;

    let cart = await LuxuryCart.findOne({ customerId });
    if (!cart) cart = await LuxuryCart.create({ customerId, items: [] });

    // return in frontend shape
    const items = cart.items.map((it) => ({
      id: String(it.productId),
      name: it.name,
      price: it.price,
      image: it.image,
      color: it.color,
      quantity: it.quantity,
    }));

    res.json({ success: true, items });
  } catch (e) {
    console.error("getCart error:", e);
    res.status(500).json({ success: false, message: "Failed to load cart" });
  }
};

exports.updateCart = async (req, res) => {
  try {
    const customerId = req.user.id;
    const items = normalizeItems(req.body?.items || []);

    const cart = await LuxuryCart.findOneAndUpdate(
      { customerId },
      { $set: { items } },
      { upsert: true, new: true }
    );

    const out = cart.items.map((it) => ({
      id: String(it.productId),
      name: it.name,
      price: it.price,
      image: it.image,
      color: it.color,
      quantity: it.quantity,
    }));

    res.json({ success: true, items: out });
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

    // merge by productId + color
    const map = new Map();
    for (const it of cart.items) {
      map.set(`${String(it.productId)}::${it.color || ""}`, { ...it.toObject() });
    }

    for (const it of incoming) {
      const key = `${String(it.productId)}::${it.color || ""}`;
      if (map.has(key)) {
        map.get(key).quantity += it.quantity;
      } else {
        map.set(key, {
          productId: it.productId,
          name: it.name,
          price: it.price,
          image: it.image,
          color: it.color,
          quantity: it.quantity,
        });
      }
    }

    cart.items = Array.from(map.values());
    await cart.save();

    const out = cart.items.map((it) => ({
      id: String(it.productId),
      name: it.name,
      price: it.price,
      image: it.image,
      color: it.color,
      quantity: it.quantity,
    }));

    res.json({ success: true, items: out });
  } catch (e) {
    console.error("mergeCart error:", e);
    res.status(500).json({ success: false, message: "Failed to merge cart" });
  }
};
