// controllers/wishlistController.js
const mongoose = require("mongoose");
const Customer = require("../models/luxury_customers"); // adjust path as needed
const Product = require("../../manufacturer-portal/models/Product"); // adjust model name if different

// Helper to ensure product details are fetched from DB
async function getProductDetails(productId) {
  const product = await Product.findById(productId).select("name price image type");
  if (!product) return null;
  return {
    productId: product._id,
    name: product.name,
    price: product.price || 0,
    image: product.image || "",
    type: product.type || "",
  };
}

// GET /api/luxury/wishlist
exports.getWishlist = async (req, res) => {
  try {
    const customer = await Customer.findById(req.user.id).select("wishlist");
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }
    // Ensure wishlist is an array
    const wishlist = customer.wishlist || [];
    return res.json({ success: true, wishlist });
  } catch (err) {
    console.error("getWishlist error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// POST /api/luxury/wishlist
exports.addToWishlist = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Valid productId required" });
    }

    const customer = await Customer.findById(req.user.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    // Check if already in wishlist
    const exists = (customer.wishlist || []).some(
      (item) => String(item.productId) === String(productId)
    );
    if (exists) {
      return res.status(400).json({ success: false, message: "Product already in wishlist" });
    }

    // Fetch product details from DB
    const productDetails = await getProductDetails(productId);
    if (!productDetails) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Add to wishlist
    customer.wishlist.push({
      productId: productDetails.productId,
      name: productDetails.name,
      price: productDetails.price,
      image: productDetails.image,
      type: productDetails.type,
      addedAt: new Date(),
    });

    await customer.save();

    return res.json({
      success: true,
      message: "Added to wishlist",
      wishlist: customer.wishlist,
    });
  } catch (err) {
    console.error("addToWishlist error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// DELETE /api/luxury/wishlist/:productId
exports.removeFromWishlist = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Valid productId required" });
    }

    const customer = await Customer.findById(req.user.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    const initialLength = (customer.wishlist || []).length;
    customer.wishlist = (customer.wishlist || []).filter(
      (item) => String(item.productId) !== String(productId)
    );

    if (initialLength === (customer.wishlist || []).length) {
      return res.status(404).json({ success: false, message: "Item not found in wishlist" });
    }

    await customer.save();

    return res.json({
      success: true,
      message: "Removed from wishlist",
      wishlist: customer.wishlist,
    });
  } catch (err) {
    console.error("removeFromWishlist error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};