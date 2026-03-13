const mongoose = require("mongoose");
const Coupon = require("../models/Coupon");
const { normalizeCode, computeStatusByDates } = require("../utils/coupons");

const allowedWebsites = ["affordable", "midrange", "luxury", "all"];
const allowedTypes = ["percentage", "flat", "free_shipping"];
const allowedStatuses = ["draft", "active", "scheduled", "expired", "disabled"];
const allowedVisibility = ["public", "private"];
const allowedApplyTo = ["all_categories", "selected_categories"];

function toValidObjectIdArray(arr = []) {
  if (!Array.isArray(arr)) return [];

  return arr
    .filter(Boolean)
    .map((id) => String(id).trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function validatePayload(body) {
  const code = normalizeCode(body.code);
  if (!code || code.length < 3) {
    throw new Error("Coupon code must be at least 3 characters.");
  }

  const title = String(body.title || "").trim();
  if (!title) {
    throw new Error("Title is required.");
  }

  const website = body.website || "all";
  if (!allowedWebsites.includes(website)) {
    throw new Error("Invalid website.");
  }

  const type = body.type;
  if (!allowedTypes.includes(type)) {
    throw new Error("Invalid type.");
  }

  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new Error("Invalid dates.");
  }

  if (+endAt <= +startAt) {
    throw new Error("End date must be after start date.");
  }

  const value = Number(body.value || 0);

  if (type === "percentage" && (value <= 0 || value > 90)) {
    throw new Error("Percentage must be between 1 and 90.");
  }

  if (type === "flat" && value <= 0) {
    throw new Error("Flat value must be > 0.");
  }

  const maxDiscount =
    body.maxDiscount != null && body.maxDiscount !== ""
      ? Number(body.maxDiscount)
      : undefined;

  const minOrder =
    body.minOrder != null && body.minOrder !== ""
      ? Number(body.minOrder)
      : undefined;

  const totalLimit =
    body.totalLimit != null && body.totalLimit !== ""
      ? Number(body.totalLimit)
      : undefined;

  const perUserLimit =
    body.perUserLimit != null && body.perUserLimit !== ""
      ? Number(body.perUserLimit)
      : undefined;

  const status = body.status || "draft";
  if (!allowedStatuses.includes(status)) {
    throw new Error("Invalid status.");
  }

  const visibility = body.visibility || "private";
  if (!allowedVisibility.includes(visibility)) {
    throw new Error("Invalid visibility.");
  }

  // ✅ category scope validation
  const applyTo = body.applyTo || "all_categories";
  if (!allowedApplyTo.includes(applyTo)) {
    throw new Error("Invalid applyTo value.");
  }

  // support both `categories` and `categoryIds`
  const rawCategories = Array.isArray(body.categories)
    ? body.categories
    : Array.isArray(body.categoryIds)
      ? body.categoryIds
      : [];

  const categories = toValidObjectIdArray(rawCategories);

  if (applyTo === "selected_categories" && categories.length === 0) {
    throw new Error("At least one category must be selected.");
  }

  return {
    code,
    title,
    description: body.description ? String(body.description).trim() : undefined,
    website,
    visibility,
    type,
    value: type === "free_shipping" ? 0 : value,
    maxDiscount: type === "percentage" && maxDiscount > 0 ? maxDiscount : undefined,
    minOrder: minOrder > 0 ? minOrder : undefined,
    startAt,
    endAt,
    totalLimit: totalLimit > 0 ? totalLimit : undefined,
    perUserLimit: perUserLimit > 0 ? perUserLimit : undefined,
    status,

    // ✅ category fields
    applyTo,
    categories: applyTo === "selected_categories" ? categories : [],
  };
}

// GET /api/admin/coupons?website=&status=&type=&visibility=&q=
exports.listCoupons = async (req, res) => {
  try {
    const { website, status, type, visibility, q, applyTo } = req.query;

    const query = {};

    if (website && allowedWebsites.includes(website)) {
      query.website = website;
    }

    if (status && allowedStatuses.includes(status)) {
      query.status = status;
    }

    if (type && allowedTypes.includes(type)) {
      query.type = type;
    }

    if (visibility && allowedVisibility.includes(visibility)) {
      query.visibility = visibility;
    }

    if (applyTo && allowedApplyTo.includes(applyTo)) {
      query.applyTo = applyTo;
    }

    if (q) {
      const s = String(q).trim();
      query.$or = [
        { code: new RegExp(s, "i") },
        { title: new RegExp(s, "i") },
      ];
    }

    const coupons = await Coupon.find(query)
      .populate("categories", "name slug title")
      .sort({ updatedAt: -1 });

    const shaped = coupons.map((c) => {
      const obj = c.toObject();
      obj.computedStatus = computeStatusByDates(c);
      return obj;
    });

    res.json({ success: true, coupons: shaped });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || "Failed to fetch coupons",
    });
  }
};

// GET /api/admin/coupons/:id
exports.getCouponById = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findById(id).populate("categories", "name slug title");

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    const obj = coupon.toObject();
    obj.computedStatus = computeStatusByDates(coupon);

    res.json({
      success: true,
      coupon: obj,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || "Failed to fetch coupon",
    });
  }
};

// POST /api/admin/coupons
exports.createCoupon = async (req, res) => {
  try {
    const payload = validatePayload(req.body);

    const created = await Coupon.create(payload);
    const populated = await Coupon.findById(created._id).populate("categories", "name slug title");

    res.status(201).json({
      success: true,
      coupon: populated,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Coupon code already exists for this website.",
      });
    }

    res.status(400).json({
      success: false,
      message: err.message || "Failed to create coupon",
    });
  }
};

// PUT /api/admin/coupons/:id
exports.updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await Coupon.findById(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    const payload = validatePayload({
      ...existing.toObject(),
      ...req.body,
    });

    const updated = await Coupon.findByIdAndUpdate(id, payload, { new: true }).populate(
      "categories",
      "name slug title"
    );

    res.json({
      success: true,
      coupon: updated,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Coupon code already exists for this website.",
      });
    }

    res.status(400).json({
      success: false,
      message: err.message || "Failed to update coupon",
    });
  }
};

// PATCH /api/admin/coupons/:id/disable
exports.disableCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Coupon.findByIdAndUpdate(
      id,
      { status: "disabled" },
      { new: true }
    ).populate("categories", "name slug title");

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    res.json({
      success: true,
      coupon: updated,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || "Failed to disable coupon",
    });
  }
};

// DELETE /api/admin/coupons/:id
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Coupon.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found",
      });
    }

    res.json({
      success: true,
      message: "Coupon deleted",
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message || "Failed to delete coupon",
    });
  }
};