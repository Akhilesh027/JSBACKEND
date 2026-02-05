const mongoose = require("mongoose");
const Customer = require("../models/luxury_customers");

// helper: normalize and validate incoming wishlist items
function normalizeWishlist(list = []) {
  if (!Array.isArray(list)) return [];

  const out = [];
  for (const it of list) {
    const pid = it?.productId || it?.id; // allow frontend sending {id} or {productId}
    if (!pid) continue;

    // validate objectId
    if (!mongoose.Types.ObjectId.isValid(String(pid))) continue;

    out.push({
      productId: String(pid),
      name: String(it?.name || ""),
      price: Number(it?.price || 0),
      image: String(it?.image || ""),
      type: String(it?.type || ""),
    });
  }

  // de-dup by productId
  const map = new Map();
  for (const it of out) map.set(it.productId, it);
  return Array.from(map.values());
}
exports.getWishlist = async (req, res) => {
  try {
    const customer = await Customer.findById(req.user.id).select("wishlist");
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    return res.json({ success: true, wishlist: customer.wishlist || [] });
  } catch (err) {
    console.error("getWishlist error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
exports.replaceWishlist = async (req, res) => {
  try {
    const normalized = normalizeWishlist(req.body?.wishlist);

    const customer = await Customer.findByIdAndUpdate(
      req.user.id,
      { $set: { wishlist: normalized } },
      { new: true, select: "wishlist" }
    );

    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    return res.json({ success: true, message: "Wishlist updated", wishlist: customer.wishlist || [] });
  } catch (err) {
    console.error("replaceWishlist error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
exports.mergeWishlist = async (req, res) => {
  try {
    const incoming = normalizeWishlist(req.body?.wishlist);

    const customer = await Customer.findById(req.user.id).select("wishlist");
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    const existing = Array.isArray(customer.wishlist) ? customer.wishlist : [];
    const map = new Map();

    // keep existing first
    for (const it of existing) map.set(String(it.productId), it);

    // merge/overwrite from incoming
    for (const it of incoming) {
      map.set(String(it.productId), {
        productId: it.productId,
        name: it.name,
        price: it.price,
        image: it.image,
        type: it.type,
        addedAt: new Date(),
      });
    }

    customer.wishlist = Array.from(map.values());
    await customer.save();

    return res.json({ success: true, message: "Wishlist merged", wishlist: customer.wishlist || [] });
  } catch (err) {
    console.error("mergeWishlist error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// POST /api/luxury/wishlist/toggle  (optional: toggles single item)
exports.toggleWishlist = async (req, res) => {
  try {
    const pid = req.body?.productId || req.body?.id;
    if (!pid || !mongoose.Types.ObjectId.isValid(String(pid))) {
      return res.status(400).json({ success: false, message: "Valid productId required" });
    }

    const customer = await Customer.findById(req.user.id).select("wishlist");
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    const existsIndex = (customer.wishlist || []).findIndex(
      (x) => String(x.productId) === String(pid)
    );

    if (existsIndex !== -1) {
      customer.wishlist.splice(existsIndex, 1);
      await customer.save();
      return res.json({ success: true, message: "Removed from wishlist", wishlist: customer.wishlist });
    }

    // require item data to add
    const item = {
      productId: pid,
      name: String(req.body?.name || ""),
      price: Number(req.body?.price || 0),
      image: String(req.body?.image || ""),
      type: String(req.body?.type || ""),
      addedAt: new Date(),
    };

    if (!item.name) {
      return res.status(400).json({ success: false, message: "name is required to add item" });
    }

    customer.wishlist = [...(customer.wishlist || []), item];
    await customer.save();

    return res.json({ success: true, message: "Added to wishlist", wishlist: customer.wishlist });
  } catch (err) {
    console.error("toggleWishlist error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
