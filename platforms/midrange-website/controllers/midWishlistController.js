const Wishlist = require("../models/Wishlist.js");
const Product = require("../../manufacturer-portal/models/Product.js");

/**
 * GET /api/mid/wishlist
 * Get current user's wishlist (populated with product details)
 */
exports.getWishlist = async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id }).populate("products");
    if (!wishlist) {
      return res.json([]); // no wishlist yet → empty array
    }
    res.json(wishlist.products);
  } catch (err) {
    console.error("Error fetching wishlist:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /api/mid/wishlist/:productId
 * Add a product to the user's wishlist
 */
exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.params;

    // Verify product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Find or create wishlist for the user
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, products: [] });
    }

    // Only add if not already present
    if (!wishlist.products.includes(productId)) {
      wishlist.products.push(productId);
      await wishlist.save();
    }

    await wishlist.populate("products");
    res.status(201).json(wishlist.products);
  } catch (err) {
    console.error("Error adding to wishlist:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * DELETE /api/mid/wishlist/:productId
 * Remove a product from the user's wishlist
 */
exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      return res.status(404).json({ message: "Wishlist not found" });
    }

    // Filter out the product
    wishlist.products = wishlist.products.filter(
      (id) => id.toString() !== productId
    );
    await wishlist.save();

    await wishlist.populate("products");
    res.json(wishlist.products);
  } catch (err) {
    console.error("Error removing from wishlist:", err);
    res.status(500).json({ message: "Server error" });
  }
};