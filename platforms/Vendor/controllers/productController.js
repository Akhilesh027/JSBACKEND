const Product = require("../../manufacturer-portal/models/Product");

// helper: safe boolean parse
const parseBool = (v) => {
  if (v === undefined) return undefined;
  const s = String(v).toLowerCase();
  if (["true", "1", "yes"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;
  return undefined;
};

exports.getProducts = async (req, res) => {
  try {
    const {
      category,
      subcategory,
      search,
      page = "1",
      limit = "24",
      inStock,
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 24, 1), 200);
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (category) filter.category = category;

    // Allow slug-like subcategory matching (shirts, t-shirts, etc.)
    if (subcategory) {
      const sub = String(subcategory).toLowerCase().trim();
      filter.subcategory = { $regex: new RegExp(`^${sub}$`, "i") };
    }

    const stockVal = parseBool(inStock);
    if (stockVal !== undefined) filter.inStock = stockVal;

    // Search across multiple fields
    if (search && String(search).trim()) {
      const q = String(search).trim();
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { category: { $regex: q, $options: "i" } },
        { subcategory: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
        { material: { $regex: q, $options: "i" } },
        { color: { $regex: q, $options: "i" } },
      ];
    }

    const [total, products] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
    ]);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      products,
    });
  } catch (err) {
    console.error("❌ getProducts error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
};

// ✅ (optional) get single product by id
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.json({ success: true, product });
  } catch (err) {
    console.error("❌ getProductById error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
