// controllers/admin/legalPageController.js
const LegalPage = require("../models/LegalPage");

const ALLOWED_WEBSITES = ["affordable", "midrange", "luxury"];
const ALLOWED_TYPES = [
  "privacy_policy",
  "terms_conditions",
  "refund_policy",
  "shipping_policy",
  "about",
  "contact",
];
const ALLOWED_STATUS = ["draft", "published"];

const normalizeSlug = (slug = "") => {
  const s = String(slug).trim();
  if (!s) return "";
  return s.startsWith("/") ? s : `/${s}`;
};

const ok = (res, data, message = "Success") =>
  res.status(200).json({ success: true, message, data });

const created = (res, data, message = "Created successfully") =>
  res.status(201).json({ success: true, message, data });

const bad = (res, status, message) =>
  res.status(status).json({ success: false, message });

/**
 * GET /api/admin/legal-pages
 * Query:
 *  - website=affordable|midrange|luxury
 *  - type=privacy_policy|...
 *  - status=draft|published
 *  - q=search text
 */
exports.getLegalPages = async (req, res) => {
  try {
    const { website, type, status, q } = req.query;

    const filter = {};

    if (website) {
      if (!ALLOWED_WEBSITES.includes(website)) {
        return bad(res, 400, "Invalid website");
      }
      filter.website = website;
    }

    if (type) {
      if (!ALLOWED_TYPES.includes(type)) {
        return bad(res, 400, "Invalid page type");
      }
      filter.type = type;
    }

    if (status) {
      if (!ALLOWED_STATUS.includes(status)) {
        return bad(res, 400, "Invalid status");
      }
      filter.status = status;
    }

    if (q && String(q).trim()) {
      const search = String(q).trim();
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
        { type: { $regex: search, $options: "i" } },
      ];
    }

    const pages = await LegalPage.find(filter).sort({ updatedAt: -1 });

    return ok(res, pages, "Legal pages fetched successfully");
  } catch (error) {
    return bad(res, 500, error.message || "Failed to fetch legal pages");
  }
};

/**
 * GET /api/admin/legal-pages/:id
 */
exports.getLegalPageById = async (req, res) => {
  try {
    const { id } = req.params;

    const page = await LegalPage.findById(id);
    if (!page) {
      return bad(res, 404, "Legal page not found");
    }

    return ok(res, page, "Legal page fetched successfully");
  } catch (error) {
    return bad(res, 500, error.message || "Failed to fetch legal page");
  }
};

/**
 * GET /api/legal-pages/by-slug?website=affordable&slug=/privacy-policy
 * public route usage
 */
exports.getLegalPageBySlug = async (req, res) => {
  try {
    const { website, slug } = req.query;

    if (!website || !ALLOWED_WEBSITES.includes(website)) {
      return bad(res, 400, "Valid website is required");
    }

    const normalizedSlug = normalizeSlug(slug);
    if (!normalizedSlug) {
      return bad(res, 400, "Slug is required");
    }

    const page = await LegalPage.findOne({
      website,
      slug: normalizedSlug,
      status: "published",
    });

    if (!page) {
      return bad(res, 404, "Published page not found");
    }

    return ok(res, page, "Published legal page fetched successfully");
  } catch (error) {
    return bad(res, 500, error.message || "Failed to fetch page by slug");
  }
};

/**
 * POST /api/admin/legal-pages
 * body:
 * {
 *   website,
 *   type,
 *   title,
 *   slug,
 *   content,
 *   status
 * }
 */
exports.createLegalPage = async (req, res) => {
  try {
    let { website, type, title, slug, content, status } = req.body;

    website = String(website || "").trim();
    type = String(type || "").trim();
    title = String(title || "").trim();
    slug = normalizeSlug(slug);
    content = String(content || "").trim();
    status = String(status || "draft").trim();

    if (!website || !ALLOWED_WEBSITES.includes(website)) {
      return bad(res, 400, "Valid website is required");
    }

    if (!type || !ALLOWED_TYPES.includes(type)) {
      return bad(res, 400, "Valid page type is required");
    }

    if (!title) {
      return bad(res, 400, "Title is required");
    }

    if (!slug) {
      return bad(res, 400, "Slug is required");
    }

    if (!content) {
      return bad(res, 400, "Content is required");
    }

    if (!ALLOWED_STATUS.includes(status)) {
      return bad(res, 400, "Invalid status");
    }

    const existingSlug = await LegalPage.findOne({ website, slug });
    if (existingSlug) {
      return bad(res, 409, "A page with this slug already exists for this website");
    }

    const existingType = await LegalPage.findOne({ website, type });
    if (existingType) {
      return bad(res, 409, "This page type already exists for this website");
    }

    const page = await LegalPage.create({
      website,
      type,
      title,
      slug,
      content,
      status,
    });

    return created(res, page, "Legal page created successfully");
  } catch (error) {
    if (error.code === 11000) {
      return bad(res, 409, "Duplicate page detected");
    }
    return bad(res, 500, error.message || "Failed to create legal page");
  }
};

/**
 * PUT /api/admin/legal-pages/:id
 */
exports.updateLegalPage = async (req, res) => {
  try {
    const { id } = req.params;
    let { website, type, title, slug, content, status } = req.body;

    const page = await LegalPage.findById(id);
    if (!page) {
      return bad(res, 404, "Legal page not found");
    }

    website = website !== undefined ? String(website).trim() : page.website;
    type = type !== undefined ? String(type).trim() : page.type;
    title = title !== undefined ? String(title).trim() : page.title;
    slug = slug !== undefined ? normalizeSlug(slug) : page.slug;
    content = content !== undefined ? String(content).trim() : page.content;
    status = status !== undefined ? String(status).trim() : page.status;

    if (!ALLOWED_WEBSITES.includes(website)) {
      return bad(res, 400, "Valid website is required");
    }

    if (!ALLOWED_TYPES.includes(type)) {
      return bad(res, 400, "Valid page type is required");
    }

    if (!title) {
      return bad(res, 400, "Title is required");
    }

    if (!slug) {
      return bad(res, 400, "Slug is required");
    }

    if (!content) {
      return bad(res, 400, "Content is required");
    }

    if (!ALLOWED_STATUS.includes(status)) {
      return bad(res, 400, "Invalid status");
    }

    const existingSlug = await LegalPage.findOne({
      _id: { $ne: id },
      website,
      slug,
    });
    if (existingSlug) {
      return bad(res, 409, "Another page with this slug already exists for this website");
    }

    const existingType = await LegalPage.findOne({
      _id: { $ne: id },
      website,
      type,
    });
    if (existingType) {
      return bad(res, 409, "Another page with this type already exists for this website");
    }

    page.website = website;
    page.type = type;
    page.title = title;
    page.slug = slug;
    page.content = content;
    page.status = status;

    await page.save();

    return ok(res, page, "Legal page updated successfully");
  } catch (error) {
    if (error.code === 11000) {
      return bad(res, 409, "Duplicate page detected");
    }
    return bad(res, 500, error.message || "Failed to update legal page");
  }
};

/**
 * DELETE /api/admin/legal-pages/:id
 */
exports.deleteLegalPage = async (req, res) => {
  try {
    const { id } = req.params;

    const page = await LegalPage.findByIdAndDelete(id);
    if (!page) {
      return bad(res, 404, "Legal page not found");
    }

    return ok(res, page, "Legal page deleted successfully");
  } catch (error) {
    return bad(res, 500, error.message || "Failed to delete legal page");
  }
};