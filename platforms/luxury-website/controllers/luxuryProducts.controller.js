// server/controllers/luxuryProducts.controller.js
const mongoose = require("mongoose");
const LuxuryProduct = require("../../manufacturer-portal/models/Product");
const Category = require("../../Admin/models/category.js");

// Helper: Escape regex special characters
const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Helper: Normalize string (remove accents, lowercase, trim)
const cleanText = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

// Helper: Generate regex pattern that matches both accented & unaccented versions, hyphens, spaces, and & / and
const buildFlexibleRegex = (term) => {
  if (!term) return null;
  const escaped = escapeRegex(term.trim());
  // Replace 'e' or 'é' with [eé]
  let pattern = escaped.replace(/[eé]/gi, "[eéEÉ]");
  // Replace 'a' or 'á' with [aá]
  pattern = pattern.replace(/[aá]/gi, "[aáAÁ]");
  // Replace hyphens and spaces flexibly
  pattern = pattern.replace(/[-_ ]+/g, "[-_ ]+");
  // Replace '&' or 'and' flexibly
  pattern = pattern.replace(/(&|\\&|and)/gi, "(&|and)");
  return new RegExp(`^${pattern}$`, "i");
};

// GET /api/luxury/products
// Returns approved luxury products with robust category & subcategory filtering
exports.getApprovedLuxuryProducts = async (req, res) => {
  try {
    const {
      category,
      subcategory,
      cat,
      sub,
      q,
      search,
      minPrice,
      maxPrice,
      limit = 200,
      includeSubcats = "true",
    } = req.query;

    const catRaw = String(category || cat || "").trim();
    const subRaw = String(subcategory || sub || "").trim();
    const queryText = String(q || search || "").trim();

    const isObjectId = (v) => mongoose.Types.ObjectId.isValid(String(v || "").trim());

    // 1. Base Filter (approved status, luxury tier)
    const filter = {
      status: "approved",
      tier: { $in: ["luxury", "luxury_feature"] },
    };

    // 2. Price filter
    if (minPrice !== undefined && minPrice !== "" && !isNaN(Number(minPrice))) {
      filter.price = filter.price || {};
      filter.price.$gte = Number(minPrice);
    }
    if (maxPrice !== undefined && maxPrice !== "" && !isNaN(Number(maxPrice))) {
      filter.price = filter.price || {};
      filter.price.$lte = Number(maxPrice);
    }

    // 3. Search query filter
    if (queryText) {
      const qRegex = new RegExp(escapeRegex(queryText), "i");
      filter.$or = [
        { name: qRegex },
        { title: qRegex },
        { description: qRegex },
        { shortDescription: qRegex },
        { type: qRegex },
        { category: qRegex },
        { subcategory: qRegex },
        { sku: qRegex },
      ];
    }

    const hasCat = Boolean(catRaw);
    const hasSub = Boolean(subRaw);

    let catDoc = null;
    let subDoc = null;

    // Resolve Category Document
    if (hasCat) {
      if (isObjectId(catRaw)) {
        catDoc = await Category.findById(catRaw).lean();
      } else {
        const catClean = cleanText(catRaw);
        const catRegex1 = buildFlexibleRegex(catRaw);
        const catRegex2 = buildFlexibleRegex(catRaw.replace(/-/g, " "));

        catDoc = await Category.findOne({
          $or: [
            { slug: catRaw },
            { slug: catClean },
            { slug: catRaw.replace(/ /g, "-").toLowerCase() },
            ...(catRegex1 ? [{ name: { $regex: catRegex1 } }] : []),
            ...(catRegex2 ? [{ name: { $regex: catRegex2 } }] : []),
          ],
        }).lean();
      }
    }

    // Resolve Subcategory Document
    if (hasSub) {
      if (isObjectId(subRaw)) {
        subDoc = await Category.findById(subRaw).lean();
      } else {
        const subClean = cleanText(subRaw);
        const subRegex1 = buildFlexibleRegex(subRaw);
        const subRegex2 = buildFlexibleRegex(subRaw.replace(/-/g, " "));

        const subConditions = [
          { slug: subRaw },
          { slug: subClean },
          { slug: subRaw.replace(/ /g, "-").toLowerCase() },
          ...(subRegex1 ? [{ name: { $regex: subRegex1 } }] : []),
          ...(subRegex2 ? [{ name: { $regex: subRegex2 } }] : []),
        ];

        if (catDoc) {
          subDoc = await Category.findOne({
            parentId: catDoc._id,
            $or: subConditions,
          }).lean();
        }
        if (!subDoc) {
          subDoc = await Category.findOne({ $or: subConditions }).lean();
        }
      }
    }

    const andConditions = [];

    // Filter Logic:
    // A) Both Category AND Subcategory provided
    if (hasCat && hasSub) {
      const subId = subDoc ? subDoc._id : isObjectId(subRaw) ? new mongoose.Types.ObjectId(subRaw) : null;
      const subTerms = [
        subRaw,
        subRaw.replace(/-/g, " "),
        cleanText(subRaw),
        subDoc?.slug,
        subDoc?.name,
      ].filter(Boolean);

      const subClauses = [];
      if (subId) subClauses.push({ subCategoryId: subId });
      subTerms.forEach((term) => {
        const reg = buildFlexibleRegex(term);
        if (reg) subClauses.push({ subcategory: { $regex: reg } });
      });

      const catId = catDoc ? catDoc._id : isObjectId(catRaw) ? new mongoose.Types.ObjectId(catRaw) : null;
      const catTerms = [
        catRaw,
        catRaw.replace(/-/g, " "),
        cleanText(catRaw),
        catDoc?.slug,
        catDoc?.name,
      ].filter(Boolean);

      const catClauses = [];
      if (catId) catClauses.push({ categoryId: catId });
      catTerms.forEach((term) => {
        const reg = buildFlexibleRegex(term);
        if (reg) catClauses.push({ category: { $regex: reg } });
      });

      if (subClauses.length) andConditions.push({ $or: subClauses });
      if (catClauses.length) andConditions.push({ $or: catClauses });
    }
    // B) Only Subcategory provided
    else if (hasSub) {
      const subId = subDoc ? subDoc._id : isObjectId(subRaw) ? new mongoose.Types.ObjectId(subRaw) : null;
      const subTerms = [
        subRaw,
        subRaw.replace(/-/g, " "),
        cleanText(subRaw),
        subDoc?.slug,
        subDoc?.name,
      ].filter(Boolean);

      const subClauses = [];
      if (subId) subClauses.push({ subCategoryId: subId });
      subTerms.forEach((term) => {
        const reg = buildFlexibleRegex(term);
        if (reg) subClauses.push({ subcategory: { $regex: reg } });
      });

      if (subClauses.length) andConditions.push({ $or: subClauses });
    }
    // C) Only Category provided (include child subcategories by default)
    else if (hasCat) {
      const catId = catDoc ? catDoc._id : isObjectId(catRaw) ? new mongoose.Types.ObjectId(catRaw) : null;
      const inc = String(includeSubcats).toLowerCase() !== "false";

      if (inc && catDoc) {
        const childCats = await Category.find({ parentId: catDoc._id })
          .select("_id slug name")
          .lean();

        const allCatIds = [catDoc._id];
        const allSubIds = childCats.map((c) => c._id);
        const allNames = [
          catRaw,
          catRaw.replace(/-/g, " "),
          cleanText(catRaw),
          catDoc.slug,
          catDoc.name,
          ...childCats.flatMap((c) => [c.slug, c.name, c.slug.replace(/-/g, " "), cleanText(c.name)]),
        ].filter(Boolean);

        const clauses = [];
        if (allCatIds.length) clauses.push({ categoryId: { $in: allCatIds } });
        if (allSubIds.length) clauses.push({ subCategoryId: { $in: allSubIds } });

        allNames.forEach((name) => {
          const reg = buildFlexibleRegex(name);
          if (reg) {
            clauses.push({ category: { $regex: reg } });
            clauses.push({ subcategory: { $regex: reg } });
          }
        });

        if (clauses.length) andConditions.push({ $or: clauses });
      } else {
        const catTerms = [
          catRaw,
          catRaw.replace(/-/g, " "),
          cleanText(catRaw),
          catDoc?.slug,
          catDoc?.name,
        ].filter(Boolean);

        const clauses = [];
        if (catId) clauses.push({ categoryId: catId });
        catTerms.forEach((term) => {
          const reg = buildFlexibleRegex(term);
          if (reg) clauses.push({ category: { $regex: reg } });
        });

        if (clauses.length) andConditions.push({ $or: clauses });
      }
    }

    if (andConditions.length > 0) {
      filter.$and = andConditions;
    }

    const safeLimit = Math.min(500, Math.max(1, Number(limit) || 200));

    const products = await LuxuryProduct.find(filter)
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .select(
        "_id title name images image price oldPrice newPrice discount type category subcategory categoryId subCategoryId description shortDescription sku status tier color material size availability isCustomized createdAt"
      )
      .lean();

    return res.status(200).json({
      success: true,
      count: products.length,
      products,
      data: products,
    });
  } catch (error) {
    console.error("getApprovedLuxuryProducts error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load products",
    });
  }
};

// GET /api/luxury/products/search
exports.searchLuxuryProducts = async (req, res) => {
  try {
    const { q = "", limit = 20 } = req.query;
    const query = String(q).trim();

    if (!query) {
      return res.status(200).json({
        success: true,
        data: [],
      });
    }

    const regex = new RegExp(escapeRegex(query), "i");
    const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));

    const products = await LuxuryProduct.find({
      status: "approved",
      tier: { $in: ["luxury", "luxury_feature"] },
      $or: [
        { name: regex },
        { title: regex },
        { description: regex },
        { shortDescription: regex },
        { type: regex },
        { category: regex },
        { subcategory: regex },
        { sku: regex },
      ],
    })
      .limit(safeLimit)
      .select(
        "_id name title slug price oldPrice newPrice discount images image category subcategory categoryId subCategoryId description"
      )
      .lean();

    return res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error("searchLuxuryProducts error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to search products",
    });
  }
};

// GET /api/luxury/products/:id
exports.getApprovedLuxuryProductById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid product id" });
    }

    const product = await LuxuryProduct.findOne({
      _id: id,
      status: "approved",
      tier: { $in: ["luxury", "luxury_feature"] },
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.status(200).json({
      success: true,
      product,
      data: product,
    });
  } catch (error) {
    console.error("getApprovedLuxuryProductById error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to load product",
    });
  }
};
