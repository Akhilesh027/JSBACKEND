// server/src/modules/categories/category.controller.js
const Category = require("../models/category.js");
const slugify = require("../../utils/slugify.js");

// ✅ Use ONE product model for counting
// Adjust this path to your real product model location
const Product = require("../../manufacturer-portal/models/Product");

const ok = (res, data, message) => res.json({ success: true, message, data });
const bad = (res, code, message) => res.status(code).json({ success: false, message });

/**
 * Helpers
 */
const mapCategory = (c) => ({
  id: String(c._id),
  name: c.name,
  slug: c.slug,
  segment: c.segment,
  parentId: c.parentId ? String(c.parentId) : null,
  description: c.description || "",
  imageUrl: c.imageUrl || "",
  status: c.status,
  order: c.order || 0,
  showOnWebsite: !!c.showOnWebsite,
  showInNavbar: !!c.showInNavbar,
  featured: !!c.featured,
  allowProducts: !!c.allowProducts,
  seoTitle: c.seoTitle || "",
  seoDescription: c.seoDescription || "",
  seoKeywords: c.seoKeywords || "",
  createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : new Date().toISOString(),
  updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : new Date().toISOString(),
  productCount: Number(c.productCount || 0),
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * ✅ Count helpers (LIVE)
 * - if category is CHILD => count Products where subcategory = child.slug
 * - if category is PARENT => count Products where category = parent.slug (includes subcategories)
 *
 * If you store segment/tier on products and want segment-specific counts, add to filter:
 *  filter.tier = segmentMap[category.segment] OR something.
 */
async function computeLiveCount(categoryDoc) {
  if (!categoryDoc) return 0;

  if (categoryDoc.parentId) {
    // child => subcategory slug count
    return Product.countDocuments({ subcategory: categoryDoc.slug });
  }

  // parent => ALL products under this parent (including those with subcategory)
  return Product.countDocuments({ category: categoryDoc.slug });
}

/**
 * GET /api/admin/categories
 * Query: q, segment, status, level, sort, page, limit, includeCounts
 *
 * ✅ segment=all => show all segments (default)
 * ✅ includeCounts=true => returns LIVE counts (slower but accurate)
 */
exports.listCategories = async (req, res) => {
  try {
    const {
      q = "",
      segment = "all",
      status = "all",
      level = "all",
      sort = "order",
      page = "1",
      limit = "50",
      includeCounts = "false", // ✅ optional
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    // ✅ segment filter (segment=all => no filter)
    if (segment && segment !== "all") filter.segment = segment;

    // status filter
    if (status && status !== "all") filter.status = status;

    // level filter
    if (level === "parent") filter.parentId = null;
    if (level === "child") filter.parentId = { $ne: null };

    // search filter
    const query = String(q || "").trim();
    if (query) {
      const rx = new RegExp(escapeRegex(query), "i");
      filter.$or = [{ name: rx }, { slug: rx }];
    }

    // sorting
    let sortSpec = { order: 1 };
    if (sort === "newest") sortSpec = { createdAt: -1 };
    if (sort === "oldest") sortSpec = { createdAt: 1 };
    if (sort === "az") sortSpec = { name: 1 };
    if (sort === "most_products") sortSpec = { productCount: -1 };
    if (sort === "order") sortSpec = { order: 1 };

    const [items, totalItems, allForStats] = await Promise.all([
      Category.find(filter).sort(sortSpec).skip(skip).limit(limitNum).lean(),
      Category.countDocuments(filter),

      // ✅ stats across ALL categories (or per segment if segment is chosen)
      Category.find(segment && segment !== "all" ? { segment } : {})
        .select("status featured")
        .lean(),
    ]);

    const stats = {
      total: allForStats.length,
      active: allForStats.filter((c) => c.status === "active").length,
      hidden: allForStats.filter((c) => c.status === "hidden").length,
      disabled: allForStats.filter((c) => c.status === "disabled").length,
      featured: allForStats.filter((c) => c.featured).length,
    };

    // map
    let mapped = items.map(mapCategory);

    // ✅ Optional: return LIVE counts for list (slower)
    if (String(includeCounts).toLowerCase() === "true") {
      const docsById = new Map(items.map((c) => [String(c._id), c]));
      mapped = await Promise.all(
        mapped.map(async (c) => {
          const doc = docsById.get(c.id);
          const liveCount = await computeLiveCount(doc);
          return { ...c, productCount: liveCount };
        })
      );
    }

    return ok(res, { items: mapped, stats, page: pageNum, limit: limitNum, totalItems });
  } catch (e) {
    console.error("listCategories error:", e);
    return bad(res, 500, "Failed to load categories");
  }
};

/**
 * GET /api/admin/categories/:id
 * ✅ Always returns LIVE productCount
 */
exports.getCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const c = await Category.findById(id).lean();
    if (!c) return bad(res, 404, "Category not found");

    const liveCount = await computeLiveCount(c);

    return ok(
      res,
      {
        ...mapCategory(c),
        productCount: liveCount, // ✅ always correct
      },
      "Category loaded"
    );
  } catch (e) {
    console.error("getCategory error:", e);
    return bad(res, 500, "Failed to load category");
  }
};

/**
 * POST /api/admin/categories
 */
exports.createCategory = async (req, res) => {
  try {
    const b = req.body || {};

    const name = String(b.name || "").trim();
    if (name.length < 2) return bad(res, 400, "Name must be at least 2 characters");

    const segment = ["all", "affordable", "midrange", "luxury"].includes(b.segment)
      ? b.segment
      : "all";

    const cleanSlug = slugify(b.slug || name);
    if (cleanSlug.length < 2) return bad(res, 400, "Invalid slug");

    const parentId = b.parentId ? String(b.parentId) : null;
    if (parentId) {
      const parent = await Category.findById(parentId).select("_id").lean();
      if (!parent) return bad(res, 400, "Parent category not found");
    }

    const doc = await Category.create({
      name,
      slug: cleanSlug,
      segment,
      parentId: parentId || null,
      description: String(b.description || ""),
      imageUrl: String(b.imageUrl || ""),
      status: ["active", "hidden", "disabled"].includes(b.status) ? b.status : "active",
      order: Number(b.order || 0),

      showOnWebsite: !!b.showOnWebsite,
      showInNavbar: !!b.showInNavbar,
      featured: !!b.featured,
      allowProducts: b.allowProducts !== undefined ? !!b.allowProducts : true,

      seoTitle: String(b.seoTitle || ""),
      seoDescription: String(b.seoDescription || ""),
      seoKeywords: String(b.seoKeywords || ""),

      // ✅ ensure exists
      productCount: 0,
    });

    return ok(res, { id: String(doc._id) }, "Category created");
  } catch (e) {
    if (e && e.code === 11000) return bad(res, 409, "Slug already exists in this segment");
    console.error("createCategory error:", e);
    return bad(res, 500, "Failed to create category");
  }
};

/**
 * PUT /api/admin/categories/:id
 */
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const b = req.body || {};

    const existing = await Category.findById(id);
    if (!existing) return bad(res, 404, "Category not found");

    const name = b.name !== undefined ? String(b.name).trim() : existing.name;
    if (name.length < 2) return bad(res, 400, "Name must be at least 2 characters");

    const segment = b.segment
      ? (["all", "affordable", "midrange", "luxury"].includes(b.segment) ? b.segment : existing.segment)
      : existing.segment;

    const cleanSlug = b.slug !== undefined ? slugify(b.slug) : existing.slug;
    if (cleanSlug.length < 2) return bad(res, 400, "Invalid slug");

    const parentId =
      b.parentId === "" || b.parentId === null || b.parentId === undefined
        ? null
        : String(b.parentId);

    if (parentId && parentId === String(existing._id)) return bad(res, 400, "Category cannot be its own parent");

    if (parentId) {
      const parent = await Category.findById(parentId).select("_id").lean();
      if (!parent) return bad(res, 400, "Parent category not found");
    }

    existing.name = name;
    existing.slug = cleanSlug;
    existing.segment = segment;
    existing.parentId = parentId || null;
    existing.description = b.description !== undefined ? String(b.description) : existing.description;
    existing.imageUrl = b.imageUrl !== undefined ? String(b.imageUrl) : existing.imageUrl;

    if (b.status !== undefined) {
      if (!["active", "hidden", "disabled"].includes(b.status)) return bad(res, 400, "Invalid status");
      existing.status = b.status;
    }
    if (b.order !== undefined) existing.order = Number(b.order || 0);

    if (b.showOnWebsite !== undefined) existing.showOnWebsite = !!b.showOnWebsite;
    if (b.showInNavbar !== undefined) existing.showInNavbar = !!b.showInNavbar;
    if (b.featured !== undefined) existing.featured = !!b.featured;
    if (b.allowProducts !== undefined) existing.allowProducts = !!b.allowProducts;

    if (b.seoTitle !== undefined) existing.seoTitle = String(b.seoTitle || "");
    if (b.seoDescription !== undefined) existing.seoDescription = String(b.seoDescription || "");
    if (b.seoKeywords !== undefined) existing.seoKeywords = String(b.seoKeywords || "");

    await existing.save();

    return ok(res, { id: String(existing._id) }, "Category updated");
  } catch (e) {
    if (e && e.code === 11000) return bad(res, 409, "Slug already exists in this segment");
    console.error("updateCategory error:", e);
    return bad(res, 500, "Failed to update category");
  }
};

/**
 * PATCH /api/admin/categories/:id/toggle-disabled
 */
exports.toggleDisabled = async (req, res) => {
  try {
    const { id } = req.params;
    const c = await Category.findById(id);
    if (!c) return bad(res, 404, "Category not found");

    c.status = c.status === "disabled" ? "active" : "disabled";
    await c.save();

    return ok(res, { id: String(c._id), status: c.status }, "Status updated");
  } catch (e) {
    console.error("toggleDisabled error:", e);
    return bad(res, 500, "Failed to update status");
  }
};

/**
 * DELETE /api/admin/categories/:id
 */
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const hasChildren = await Category.exists({ parentId: id });
    if (hasChildren) return bad(res, 400, "This category has subcategories. Remove/move them first.");

    const deleted = await Category.findByIdAndDelete(id);
    if (!deleted) return bad(res, 404, "Category not found");

    return ok(res, { id }, "Category deleted");
  } catch (e) {
    console.error("deleteCategory error:", e);
    return bad(res, 500, "Failed to delete category");
  }
};

/**
 * GET /api/admin/categories/export
 */
exports.exportCSV = async (req, res) => {
  try {
    const { q = "", segment = "all", status = "all", level = "all", sort = "order" } = req.query;

    const filter = {};
    if (segment && segment !== "all") filter.segment = segment;
    if (status && status !== "all") filter.status = status;
    if (level === "parent") filter.parentId = null;
    if (level === "child") filter.parentId = { $ne: null };

    const query = String(q || "").trim();
    if (query) {
      const rx = new RegExp(escapeRegex(query), "i");
      filter.$or = [{ name: rx }, { slug: rx }];
    }

    let sortSpec = { order: 1 };
    if (sort === "newest") sortSpec = { createdAt: -1 };
    if (sort === "oldest") sortSpec = { createdAt: 1 };
    if (sort === "az") sortSpec = { name: 1 };
    if (sort === "most_products") sortSpec = { productCount: -1 };

    const items = await Category.find(filter).sort(sortSpec).lean();

    const headers = [
      "id",
      "name",
      "slug",
      "segment",
      "parentId",
      "status",
      "order",
      "productCount",
      "showOnWebsite",
      "showInNavbar",
      "featured",
      "allowProducts",
      "createdAt",
      "updatedAt",
    ];

    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = items.map((c) => {
      const row = {
        id: String(c._id),
        name: c.name,
        slug: c.slug,
        segment: c.segment,
        parentId: c.parentId ? String(c.parentId) : "",
        status: c.status,
        order: c.order ?? 0,
        productCount: c.productCount ?? 0,
        showOnWebsite: !!c.showOnWebsite,
        showInNavbar: !!c.showInNavbar,
        featured: !!c.featured,
        allowProducts: !!c.allowProducts,
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : "",
        updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : "",
      };
      return headers.map((h) => escape(row[h])).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="categories-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.status(200).send(csv);
  } catch (e) {
    console.error("exportCSV error:", e);
    return bad(res, 500, "Failed to export CSV");
  }
};
