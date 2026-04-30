// controllers/productController.js
const mongoose = require("mongoose");
const Product = require("../../manufacturer-portal/models/Product");

const FORCED_TIER = "mid_range";
const FORCED_STATUS = "approved";

const productSelectFields =
  "manufacturer name category subcategory categoryId subCategoryId sku shortDescription description price discount gst priceIncludesGst isCustomized quantity lowStockThreshold availability status tier forwardedToWebsite deliveryTime color material size weight location fabricTypes extraPillows image galleryImages hasVariants variants createdAt updatedAt";

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
      Product.find(query)
        .select(productSelectFields)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Product.countDocuments(query),
    ]);

    const products = items.map((item) => ({
      ...item,
      discount: Number(item.discount || 0),
      gst: Number(item.gst || 0),
      priceIncludesGst: item.priceIncludesGst ?? true,
      isCustomized: Boolean(item.isCustomized ?? false),
    }));

    return res.status(200).json({
      success: true,
      data: products,
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

/**
 * GET /api/midrange/products/:id
 * Must enforce mid_range + approved
 */
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product id",
      });
    }

    const product = await Product.findOne({
      _id: id,
      tier: FORCED_TIER,
      status: FORCED_STATUS,
    })
      .select(productSelectFields)
      .lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const normalizedProduct = {
      ...product,
      discount: Number(product.discount || 0),
      gst: Number(product.gst || 0),
      priceIncludesGst: product.priceIncludesGst ?? true,
      isCustomized: Boolean(product.isCustomized ?? false),
    };

    return res.status(200).json({
      success: true,
      data: normalizedProduct,
      product: normalizedProduct,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};