const mongoose = require("mongoose");
const Product = require("../../manufacturer-portal/models/Product"); // adjust path if needed
const Category = require("../../Admin/models/category.js");

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

    // --------------------------
    // TIER FILTER
    // tier=all => no restriction
    // --------------------------
    if (String(tier).toLowerCase() !== "all") {
      filter.tier = String(tier || "affordable").toLowerCase();
    }

    // --------------------------
    // CATEGORY / SUBCATEGORY FILTERS (ID OR SLUG OR NAME)
    // --------------------------
    const catRaw = category ? String(category).trim() : "";
    const subRaw = subcategory ? String(subcategory).trim() : "";

    const hasCat = Boolean(catRaw);
    const hasSub = Boolean(subRaw);

    let catDoc = null;
    let subDoc = null;

    if (hasCat) {
      if (isObjectId(catRaw)) {
        catDoc = await Category.findById(catRaw).lean();
      } else {
        catDoc = await Category.findOne({
          $or: [
            { slug: catRaw },
            { name: { $regex: new RegExp(`^${escapeRegex(catRaw.replace(/-/g, " "))}$`, "i") } },
            { name: { $regex: new RegExp(`^${escapeRegex(catRaw)}$`, "i") } }
          ]
        }).lean();
      }
    }

    if (hasSub) {
      if (isObjectId(subRaw)) {
        subDoc = await Category.findById(subRaw).lean();
      } else {
        const subConditions = [
          { slug: subRaw },
          { name: { $regex: new RegExp(`^${escapeRegex(subRaw.replace(/-/g, " "))}$`, "i") } },
          { name: { $regex: new RegExp(`^${escapeRegex(subRaw)}$`, "i") } }
        ];
        if (catDoc) {
          subDoc = await Category.findOne({ parentId: catDoc._id, $or: subConditions }).lean();
        }
        if (!subDoc) {
          subDoc = await Category.findOne({ $or: subConditions }).lean();
        }
      }
    }

    const andConditions = [];

    // If both provided => exact subcategory view
    if (hasCat && hasSub) {
      const subId = subDoc ? subDoc._id : (isObjectId(subRaw) ? new mongoose.Types.ObjectId(subRaw) : null);
      const subTerms = [
        subRaw,
        subRaw.replace(/-/g, " "),
        subDoc?.slug,
        subDoc?.name
      ].filter(Boolean);

      const subClauses = [];
      if (subId) subClauses.push({ subCategoryId: subId });
      subTerms.forEach((term) => {
        subClauses.push({ subcategory: { $regex: new RegExp(`^${escapeRegex(term)}$`, "i") } });
      });

      const catId = catDoc ? catDoc._id : (isObjectId(catRaw) ? new mongoose.Types.ObjectId(catRaw) : null);
      const catTerms = [
        catRaw,
        catRaw.replace(/-/g, " "),
        catDoc?.slug,
        catDoc?.name
      ].filter(Boolean);

      const catClauses = [];
      if (catId) catClauses.push({ categoryId: catId });
      catTerms.forEach((term) => {
        catClauses.push({ category: { $regex: new RegExp(`^${escapeRegex(term)}$`, "i") } });
      });

      if (subClauses.length) andConditions.push({ $or: subClauses });
      if (catClauses.length) andConditions.push({ $or: catClauses });
    } else if (hasSub) {
      const subId = subDoc ? subDoc._id : (isObjectId(subRaw) ? new mongoose.Types.ObjectId(subRaw) : null);
      const subTerms = [
        subRaw,
        subRaw.replace(/-/g, " "),
        subDoc?.slug,
        subDoc?.name
      ].filter(Boolean);

      const subClauses = [];
      if (subId) subClauses.push({ subCategoryId: subId });
      subTerms.forEach((term) => {
        subClauses.push({ subcategory: { $regex: new RegExp(`^${escapeRegex(term)}$`, "i") } });
      });

      if (subClauses.length) andConditions.push({ $or: subClauses });
    } else if (hasCat) {
      const catId = catDoc ? catDoc._id : (isObjectId(catRaw) ? new mongoose.Types.ObjectId(catRaw) : null);
      const inc = String(includeSubcats).toLowerCase() !== "false";

      if (inc && catDoc) {
        const childCats = await Category.find({ parentId: catDoc._id }).select("_id slug name").lean();
        const allCatIds = [catDoc._id, ...childCats.map((c) => c._id)];
        const allSubIds = childCats.map((c) => c._id);
        const allNames = [
          catRaw,
          catRaw.replace(/-/g, " "),
          catDoc.slug,
          catDoc.name,
          ...childCats.flatMap((c) => [c.slug, c.name, c.slug.replace(/-/g, " ")])
        ].filter(Boolean);

        const parentClauses = [
          { categoryId: { $in: allCatIds } },
          ...(allSubIds.length ? [{ subCategoryId: { $in: allSubIds } }] : []),
          { category: { $in: allNames.map((n) => new RegExp(`^${escapeRegex(n)}$`, "i")) } }
        ];

        andConditions.push({ $or: parentClauses });
      } else {
        const catTerms = [
          catRaw,
          catRaw.replace(/-/g, " "),
          catDoc?.slug,
          catDoc?.name
        ].filter(Boolean);

        const catClauses = [];
        if (catId) catClauses.push({ categoryId: catId });
        catTerms.forEach((term) => {
          catClauses.push({ category: { $regex: new RegExp(`^${escapeRegex(term)}$`, "i") } });
        });

        if (catClauses.length) andConditions.push({ $or: catClauses });
      }
    }

    // --------------------------
    // SEARCH FILTER
    // --------------------------
    if (q && String(q).trim()) {
      const rx = new RegExp(escapeRegex(String(q).trim()), "i");

      andConditions.push({
        $or: [
          { name: rx },
          { sku: rx },
          { description: rx },
          { shortDescription: rx }
        ]
      });
    }

    if (andConditions.length) {
      filter.$and = andConditions;
    }

    // --------------------------
    // PRICE RANGE
    // --------------------------
    const hasMin = minPrice !== undefined && String(minPrice).trim() !== "" && !isNaN(Number(minPrice));
    const hasMax = maxPrice !== undefined && String(maxPrice).trim() !== "" && !isNaN(Number(maxPrice));

    if (hasMin || hasMax) {
      filter.price = {};
      if (hasMin) filter.price.$gte = Number(minPrice);
      if (hasMax) filter.price.$lte = Number(maxPrice);
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
