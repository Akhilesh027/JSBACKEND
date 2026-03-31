// server/src/modules/categories/category.controller.js
const Category = require("../models/category.js");
const slugify = require("../../utils/slugify.js");
const Product = require("../../manufacturer-portal/models/Product");
const cloudinary = require("cloudinary").v2;
const { Readable } = require("stream");

// Configure Cloudinary (you should have this in your config file)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
  imagePublicId: c.imagePublicId || "", // Add this field to store Cloudinary public ID
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
 * Helper function to upload image to Cloudinary
 */
async function uploadImageToCloudinary(fileBuffer, folder = "categories") {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        allowed_formats: ["jpg", "png", "jpeg", "webp", "gif"],
        transformation: [{ width: 800, height: 800, crop: "limit" }],
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    const readableStream = new Readable();
    readableStream.push(fileBuffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
}

/**
 * Helper function to delete image from Cloudinary
 */
async function deleteImageFromCloudinary(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error("Failed to delete image from Cloudinary:", error);
  }
}

/**
 * Helper to parse multipart/form-data for image upload
 */
const parseMultipartData = (req) => {
  return new Promise((resolve, reject) => {
    const busboy = require("busboy");
    const bb = busboy({ headers: req.headers });
    
    const fields = {};
    const files = [];
    
    bb.on("field", (name, val) => {
      fields[name] = val;
    });
    
    bb.on("file", (name, file, info) => {
      const chunks = [];
      file.on("data", (chunk) => chunks.push(chunk));
      file.on("end", () => {
        files.push({
          fieldName: name,
          buffer: Buffer.concat(chunks),
          filename: info.filename,
          mimeType: info.mimeType,
        });
      });
    });
    
    bb.on("error", (err) => reject(err));
    bb.on("close", () => resolve({ fields, files }));
    
    req.pipe(bb);
  });
};

/**
 * GET /api/admin/categories
 * Query: q, segment, status, level, sort, page, limit, includeCounts
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
      includeCounts = "false",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(200, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

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
    if (sort === "order") sortSpec = { order: 1 };

    const [items, totalItems, allForStats] = await Promise.all([
      Category.find(filter).sort(sortSpec).skip(skip).limit(limitNum).lean(),
      Category.countDocuments(filter),
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

    let mapped = items.map(mapCategory);

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
        productCount: liveCount,
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
 * Supports both JSON and multipart/form-data for image upload
 */
exports.createCategory = async (req, res) => {
  try {
    let formData = req.body;
    let imageFile = null;

    // Check if it's multipart form data (has file)
    if (req.headers["content-type"]?.includes("multipart/form-data")) {
      const parsed = await parseMultipartData(req);
      formData = parsed.fields;
      if (parsed.files.length > 0) {
        imageFile = parsed.files[0];
      }
    }

    const name = String(formData.name || "").trim();
    if (name.length < 2) return bad(res, 400, "Name must be at least 2 characters");

    const segment = ["all", "affordable", "midrange", "luxury"].includes(formData.segment)
      ? formData.segment
      : "all";

    const cleanSlug = slugify(formData.slug || name);
    if (cleanSlug.length < 2) return bad(res, 400, "Invalid slug");

    const parentId = formData.parentId ? String(formData.parentId) : null;
    if (parentId) {
      const parent = await Category.findById(parentId).select("_id").lean();
      if (!parent) return bad(res, 400, "Parent category not found");
    }

    let imageUrl = String(formData.imageUrl || "");
    let imagePublicId = "";

    // Upload image to Cloudinary if provided
    if (imageFile) {
      try {
        const uploadResult = await uploadImageToCloudinary(imageFile.buffer);
        imageUrl = uploadResult.secure_url;
        imagePublicId = uploadResult.public_id;
      } catch (uploadError) {
        console.error("Image upload failed:", uploadError);
        return bad(res, 400, "Failed to upload image: " + uploadError.message);
      }
    }

    const doc = await Category.create({
      name,
      slug: cleanSlug,
      segment,
      parentId: parentId || null,
      description: String(formData.description || ""),
      imageUrl,
      imagePublicId,
      status: ["active", "hidden", "disabled"].includes(formData.status) ? formData.status : "active",
      order: Number(formData.order || 0),

      showOnWebsite: formData.showOnWebsite === "true" || formData.showOnWebsite === true,
      showInNavbar: formData.showInNavbar === "true" || formData.showInNavbar === true,
      featured: formData.featured === "true" || formData.featured === true,
      allowProducts: formData.allowProducts !== undefined 
        ? (formData.allowProducts === "true" || formData.allowProducts === true)
        : true,

      seoTitle: String(formData.seoTitle || ""),
      seoDescription: String(formData.seoDescription || ""),
      seoKeywords: String(formData.seoKeywords || ""),

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
 * Supports both JSON and multipart/form-data for image upload
 */
exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    
    let formData = req.body;
    let imageFile = null;
    let shouldDeleteOldImage = false;

    // Check if it's multipart form data (has file)
    if (req.headers["content-type"]?.includes("multipart/form-data")) {
      const parsed = await parseMultipartData(req);
      formData = parsed.fields;
      if (parsed.files.length > 0) {
        imageFile = parsed.files[0];
        shouldDeleteOldImage = true;
      }
    }

    const existing = await Category.findById(id);
    if (!existing) return bad(res, 404, "Category not found");

    const name = formData.name !== undefined ? String(formData.name).trim() : existing.name;
    if (name.length < 2) return bad(res, 400, "Name must be at least 2 characters");

    const segment = formData.segment
      ? (["all", "affordable", "midrange", "luxury"].includes(formData.segment) ? formData.segment : existing.segment)
      : existing.segment;

    const cleanSlug = formData.slug !== undefined ? slugify(formData.slug) : existing.slug;
    if (cleanSlug.length < 2) return bad(res, 400, "Invalid slug");

    const parentId =
      formData.parentId === "" || formData.parentId === null || formData.parentId === undefined
        ? null
        : String(formData.parentId);

    if (parentId && parentId === String(existing._id)) return bad(res, 400, "Category cannot be its own parent");

    if (parentId) {
      const parent = await Category.findById(parentId).select("_id").lean();
      if (!parent) return bad(res, 400, "Parent category not found");
    }

    // Handle image update
    let imageUrl = existing.imageUrl;
    let imagePublicId = existing.imagePublicId;

    if (imageFile) {
      // Delete old image if exists
      if (shouldDeleteOldImage && existing.imagePublicId) {
        await deleteImageFromCloudinary(existing.imagePublicId);
      }
      
      // Upload new image
      try {
        const uploadResult = await uploadImageToCloudinary(imageFile.buffer);
        imageUrl = uploadResult.secure_url;
        imagePublicId = uploadResult.public_id;
      } catch (uploadError) {
        console.error("Image upload failed:", uploadError);
        return bad(res, 400, "Failed to upload image: " + uploadError.message);
      }
    } else if (formData.imageUrl === "") {
      // If imageUrl is empty string, delete existing image
      if (existing.imagePublicId) {
        await deleteImageFromCloudinary(existing.imagePublicId);
      }
      imageUrl = "";
      imagePublicId = "";
    }

    existing.name = name;
    existing.slug = cleanSlug;
    existing.segment = segment;
    existing.parentId = parentId || null;
    existing.description = formData.description !== undefined ? String(formData.description) : existing.description;
    existing.imageUrl = imageUrl;
    existing.imagePublicId = imagePublicId;

    if (formData.status !== undefined) {
      if (!["active", "hidden", "disabled"].includes(formData.status)) return bad(res, 400, "Invalid status");
      existing.status = formData.status;
    }
    if (formData.order !== undefined) existing.order = Number(formData.order || 0);

    if (formData.showOnWebsite !== undefined) existing.showOnWebsite = formData.showOnWebsite === "true" || formData.showOnWebsite === true;
    if (formData.showInNavbar !== undefined) existing.showInNavbar = formData.showInNavbar === "true" || formData.showInNavbar === true;
    if (formData.featured !== undefined) existing.featured = formData.featured === "true" || formData.featured === true;
    if (formData.allowProducts !== undefined) existing.allowProducts = formData.allowProducts === "true" || formData.allowProducts === true;

    if (formData.seoTitle !== undefined) existing.seoTitle = String(formData.seoTitle || "");
    if (formData.seoDescription !== undefined) existing.seoDescription = String(formData.seoDescription || "");
    if (formData.seoKeywords !== undefined) existing.seoKeywords = String(formData.seoKeywords || "");

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

    const category = await Category.findById(id);
    if (!category) return bad(res, 404, "Category not found");

    // Delete image from Cloudinary if exists
    if (category.imagePublicId) {
      await deleteImageFromCloudinary(category.imagePublicId);
    }

    await Category.findByIdAndDelete(id);

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

/**
 * Count helper function
 */
async function computeLiveCount(categoryDoc) {
  if (!categoryDoc) return 0;

  if (categoryDoc.parentId) {
    return Product.countDocuments({ subcategory: categoryDoc.slug });
  }

  return Product.countDocuments({ category: categoryDoc.slug });
}