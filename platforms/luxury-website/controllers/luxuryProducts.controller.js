// server/controllers/luxuryProducts.controller.js
const { default: mongoose } = require("mongoose");
const LuxuryProduct = require("../../manufacturer-portal/models/Product"); // ✅ change path/name if different

// GET /api/luxury/products
// ✅ returns ONLY: status=approved AND tier=luxury
exports.getApprovedLuxuryProducts = async (req, res) => {
  try {
    const products = await LuxuryProduct.find({
      status: "approved",
      tier: "luxury",
    })
      .sort({ createdAt: -1 })
      .select("title name images image price oldPrice newPrice discount colors type category status tier createdAt");

    return res.status(200).json({
      success: true,
      products,
    });
  } catch (error) {
    console.error("Get approved luxury products error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load products",
    });
  }
};
exports.getApprovedLuxuryProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }

    const product = await LuxuryProduct.findOne({
      _id: id,
      status: "approved",
      tier: "luxury",
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    console.error("getApprovedLuxuryProductById error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load product",
    });
  }
};
