const mongoose = require("mongoose");
const Product = require("../../manufacturer-portal/models/Product"); // adjust path if needed

exports.getProducts = async (req, res) => {
  try {
    const { category, limit, excludeId } = req.query;

    /**
     * BASE FILTER
     * Only show affordable + approved products
     */
    const filter = {
      tier: "affordable",
      status: "approved",
    };

    /**
     * CATEGORY FILTER
     * stored like "living-room"
     * case-insensitive match
     */
    if (category) {
      filter.category = { $regex: new RegExp(`^${category}$`, "i") };
    }

    /**
     * EXCLUDE PRODUCT (used for related products)
     */
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
      filter._id = { $ne: excludeId };
    }

    /**
     * QUERY
     */
    let query = Product.find(filter).sort({ createdAt: -1 });

    /**
     * LIMIT
     */
    if (limit && !isNaN(Number(limit))) {
      query = query.limit(Number(limit));
    }

    const products = await query.exec();

    return res.status(200).json(products);
  } catch (err) {
    console.error("getProducts error:", err);
    return res.status(500).json({
      message: "Failed to fetch products",
      error: err.message,
    });
  }
};


exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json(product);
  } catch (err) {
    return res.status(500).json({
      message: "Failed to fetch product",
      error: err.message,
    });
  }
};
