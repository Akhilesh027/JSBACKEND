const mongoose = require("mongoose");
const Product = require("../../manufacturer-portal/models/Product"); // adjust path if needed

exports.getProducts = async (req, res) => {
  try {
    const {
      tier = "affordable",
      category,
      subcategory,
      includeSubcats = "true",
      limit,
      excludeId,
      q,
      minPrice,
      maxPrice,
      inStockOnly,
      color,
    } = req.query;

    // --------------------------
    // Helpers
    // --------------------------
    const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || "").trim());

    const escapeRegex = (s) =>
      String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // --------------------------
    // BASE FILTER
    // --------------------------
    const filter = { status: "approved" };

    // We'll accumulate OR clauses safely here
    const orClauses = [];

    // --------------------------
    // TIER FILTER
    // tier=all => no restriction
    // --------------------------
    if (String(tier).toLowerCase() !== "all") {
      filter.tier = String(tier || "affordable").toLowerCase();
    }

    // --------------------------
    // CATEGORY / SUBCATEGORY FILTERS (ID OR SLUG)
    // --------------------------
    const catRaw = category ? String(category).trim() : "";
    const subRaw = subcategory ? String(subcategory).trim() : "";

    const hasCat = Boolean(catRaw);
    const hasSub = Boolean(subRaw);

    const catIsId = hasCat && isObjectId(catRaw);
    const subIsId = hasSub && isObjectId(subRaw);

    // If both provided => exact child view (no includeSubcats logic)
    if (hasCat && hasSub) {
      if (catIsId) {
        filter.categoryId = new mongoose.Types.ObjectId(catRaw);
      } else {
        filter.category = { $regex: new RegExp(`^${escapeRegex(catRaw)}$`, "i") };
      }

      if (subIsId) {
        filter.subCategoryId = new mongoose.Types.ObjectId(subRaw);
      } else {
        filter.subcategory = { $regex: new RegExp(`^${escapeRegex(subRaw)}$`, "i") };
      }
    } else if (hasCat) {
      // Parent view
      if (catIsId) {
        filter.categoryId = new mongoose.Types.ObjectId(catRaw);

        const inc = String(includeSubcats).toLowerCase() !== "false";
        if (!inc) {
          // Only products directly under parent (no subCategoryId)
          orClauses.push(
            { subCategoryId: null },
            { subCategoryId: { $exists: false } }
          );
        }
      } else {
        filter.category = { $regex: new RegExp(`^${escapeRegex(catRaw)}$`, "i") };

        const inc = String(includeSubcats).toLowerCase() !== "false";
        if (!inc) {
          // Only products directly under parent (no subcategory string)
          orClauses.push(
            { subcategory: { $exists: false } },
            { subcategory: "" },
            { subcategory: null }
          );
        }
      }
    } else if (hasSub) {
      // If only subcategory provided
      if (subIsId) {
        filter.subCategoryId = new mongoose.Types.ObjectId(subRaw);
      } else {
        filter.subcategory = { $regex: new RegExp(`^${escapeRegex(subRaw)}$`, "i") };
      }
    }

    // --------------------------
    // SEARCH FILTER
    // --------------------------
    if (q && String(q).trim()) {
      const rx = new RegExp(escapeRegex(String(q).trim()), "i");

      orClauses.push(
        { name: rx },
        { sku: rx },
        { description: rx },
        { shortDescription: rx }
      );
    }

    // Apply OR clauses if any (merged safely)
    if (orClauses.length) {
      filter.$or = orClauses;
    }

    // --------------------------
    // PRICE RANGE
    // --------------------------
    const min = Number(minPrice);
    const max = Number(maxPrice);

    if (!Number.isNaN(min) || !Number.isNaN(max)) {
      filter.price = {};
      if (!Number.isNaN(min)) filter.price.$gte = min;
      if (!Number.isNaN(max)) filter.price.$lte = max;
    }

    // --------------------------
    // STOCK FILTER
    // --------------------------
    if (String(inStockOnly).toLowerCase() === "true") {
      filter.quantity = { $gt: 0 };
      filter.availability = "In Stock";
    }

    // --------------------------
    // COLOR FILTER
    // --------------------------
    if (color && String(color).trim()) {
      filter.color = {
        $regex: new RegExp(`^${escapeRegex(String(color).trim())}$`, "i"),
      };
    }

    // --------------------------
    // EXCLUDE PRODUCT
    // --------------------------
    if (excludeId && mongoose.Types.ObjectId.isValid(excludeId)) {
      filter._id = { $ne: new mongoose.Types.ObjectId(excludeId) };
    }

    // --------------------------
    // QUERY
    // --------------------------
    let query = Product.find(filter).sort({ createdAt: -1 });

    // --------------------------
    // LIMIT
    // --------------------------
    const lim = Number(limit);
    if (!Number.isNaN(lim) && lim > 0) {
      query = query.limit(Math.min(lim, 200));
    }

    const [products, total] = await Promise.all([
      query.lean(),
      Product.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      total,
      products,
    });
  } catch (err) {
    console.error("getProducts error:", err);
    return res.status(500).json({
      success: false,
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
