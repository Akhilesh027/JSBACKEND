// controllers/productController.js
const mongoose = require("mongoose");
const Product = require("../../manufacturer-portal/models/Product");

const FORCED_TIER = "mid_range";
const FORCED_STATUS = "approved";

/**
 * GET /api/midrange/products
 * Query:
 *  search=chair
 *  category=sofa
 *  material=wood
 *  color=Black
 *  availability=In Stock
 *  manufacturer=<ObjectId>
 *  minPrice=100
 *  maxPrice=1000
 *  sort=latest|price_asc|price_desc|name_asc|name_desc
 *  page=1
 *  limit=12
 */
exports.getProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      subcategory,
      material,
      color,
      availability,
      manufacturer,
      minPrice,
      maxPrice,
      sort = "latest",
      page = 1,
      limit = 12,
    } = req.query;

    const query = {
      tier: FORCED_TIER,
      status: FORCED_STATUS,
    };

    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;
    if (material) query.material = material;
    if (color) query.color = color;
    if (availability) query.availability = availability;

    if (manufacturer) {
      if (!mongoose.Types.ObjectId.isValid(manufacturer)) {
        return res.status(400).json({ message: "Invalid manufacturer id" });
      }
      query.manufacturer = manufacturer;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};

      if (minPrice !== undefined && String(minPrice).trim() !== "") {
        query.price.$gte = Number(minPrice);
      }

      if (maxPrice !== undefined && String(maxPrice).trim() !== "") {
        query.price.$lte = Number(maxPrice);
      }
    }

    if (search && String(search).trim()) {
      const term = String(search).trim();

      query.$or = [
        { name: { $regex: term, $options: "i" } },
        { category: { $regex: term, $options: "i" } },
        { subcategory: { $regex: term, $options: "i" } },
        { material: { $regex: term, $options: "i" } },
        { color: { $regex: term, $options: "i" } },
        { sku: { $regex: term, $options: "i" } },
      ];
    }

    let sortObj = { createdAt: -1 };

    if (sort === "price_asc") sortObj = { price: 1 };
    if (sort === "price_desc") sortObj = { price: -1 };
    if (sort === "name_asc") sortObj = { name: 1 };
    if (sort === "name_desc") sortObj = { name: -1 };
    if (sort === "latest") sortObj = { createdAt: -1 };

    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 12));
    const skip = (pageNum - 1) * limitNum;

    const [items, total] = await Promise.all([
      Product.find(query).sort(sortObj).skip(skip).limit(limitNum).lean(),
      Product.countDocuments(query),
    ]);

    return res.json({
      data: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: err.message || "Server error",
    });
  }
};
/**
 * GET /api/midrange/products/:id
 * ✅ must also enforce mid_range + approved
 */
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const product = await Product.findOne({
      _id: id,
      tier: FORCED_TIER,
      status: FORCED_STATUS,
    }).lean();

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.json({ data: product });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};
