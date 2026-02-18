// controllers/adminCouponController.js
const Coupon = require("../models/Coupon");
const { normalizeCode, computeStatusByDates } = require("../utils/coupons");

const allowedWebsites = ["affordable", "midrange", "luxury", "all"];

function validatePayload(body) {
  const code = normalizeCode(body.code);
  if (!code || code.length < 3) throw new Error("Coupon code must be at least 3 characters.");

  const title = String(body.title || "").trim();
  if (!title) throw new Error("Title is required.");

  const website = body.website || "all";
  if (!allowedWebsites.includes(website)) throw new Error("Invalid website.");

  const type = body.type;
  if (!["percentage", "flat", "free_shipping"].includes(type)) throw new Error("Invalid type.");

  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) throw new Error("Invalid dates.");
  if (+endAt <= +startAt) throw new Error("End date must be after start date.");

  const value = Number(body.value || 0);
  if (type === "percentage" && (value <= 0 || value > 90)) throw new Error("Percentage must be between 1 and 90.");
  if (type === "flat" && value <= 0) throw new Error("Flat value must be > 0.");

  const maxDiscount = body.maxDiscount != null ? Number(body.maxDiscount) : undefined;
  const minOrder = body.minOrder != null ? Number(body.minOrder) : undefined;
  const totalLimit = body.totalLimit != null ? Number(body.totalLimit) : undefined;
  const perUserLimit = body.perUserLimit != null ? Number(body.perUserLimit) : undefined;

  const status = body.status || "draft";
  if (!["draft", "active", "scheduled", "expired", "disabled"].includes(status)) throw new Error("Invalid status.");

  const visibility = body.visibility || "private";
  if (!["public", "private"].includes(visibility)) throw new Error("Invalid visibility.");

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
  };
}

// GET /api/admin/coupons?website=&status=&type=&visibility=&q=
exports.listCoupons = async (req, res) => {
  try {
    const { website, status, type, visibility, q } = req.query;

    const query = {};
    if (website) query.website = website;
    if (status) query.status = status;
    if (type) query.type = type;
    if (visibility) query.visibility = visibility;

    if (q) {
      const s = String(q).trim();
      query.$or = [
        { code: new RegExp(s, "i") },
        { title: new RegExp(s, "i") },
      ];
    }

    const coupons = await Coupon.find(query).sort({ updatedAt: -1 });

    // optional: reflect computed status without changing DB
    const shaped = coupons.map((c) => {
      const obj = c.toObject();
      obj.computedStatus = computeStatusByDates(c);
      return obj;
    });

    res.json({ success: true, coupons: shaped });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Failed to fetch coupons" });
  }
};

// POST /api/admin/coupons
exports.createCoupon = async (req, res) => {
  try {
    const payload = validatePayload(req.body);

    const created = await Coupon.create(payload);
    res.status(201).json({ success: true, coupon: created });
  } catch (err) {
    // unique index error
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "Coupon code already exists for this website." });
    }
    res.status(400).json({ success: false, message: err.message || "Failed to create coupon" });
  }
};

// PUT /api/admin/coupons/:id
exports.updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await Coupon.findById(id);
    if (!existing) return res.status(404).json({ success: false, message: "Coupon not found" });

    const payload = validatePayload({ ...existing.toObject(), ...req.body });

    const updated = await Coupon.findByIdAndUpdate(id, payload, { new: true });
    res.json({ success: true, coupon: updated });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "Coupon code already exists for this website." });
    }
    res.status(400).json({ success: false, message: err.message || "Failed to update coupon" });
  }
};

// PATCH /api/admin/coupons/:id/disable
exports.disableCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Coupon.findByIdAndUpdate(id, { status: "disabled" }, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "Coupon not found" });

    res.json({ success: true, coupon: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Failed to disable coupon" });
  }
};

// DELETE /api/admin/coupons/:id
exports.deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Coupon.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: "Coupon not found" });

    res.json({ success: true, message: "Coupon deleted" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Failed to delete coupon" });
  }
};
