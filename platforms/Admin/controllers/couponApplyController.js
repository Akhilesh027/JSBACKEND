// controllers/couponApplyController.js
const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
const { normalizeCode, computeStatusByDates, calcDiscount } = require("../utils/coupons");

const allowedWebsites = ["affordable", "midrange", "luxury"];

// POST /api/:website/coupons/apply
exports.applyCoupon = async (req, res) => {
  try {
    const website = String(req.params.website || "").toLowerCase();
    if (!allowedWebsites.includes(website)) {
      return res.status(400).json({ success: false, message: "Invalid website segment." });
    }

    // ✅ accept multiple names from frontend
    const rawCode = req.body.code;
    const code = normalizeCode(rawCode);

    // ✅ frontend is sending subtotal/shippingCost, but old code expects cartTotal/shipping
    const cartTotal = Number(
      req.body.cartTotal ?? req.body.subtotal ?? req.body.total ?? 0
    );

    const shipping = Number(
      req.body.shipping ?? req.body.shippingCost ?? 0
    );

    const userId = req.body.userId; // optional (needed for perUserLimit)

    if (!code) {
      return res.status(400).json({ success: false, message: "Coupon code required." });
    }

    if (!Number.isFinite(cartTotal) || cartTotal < 0) {
      return res.status(400).json({ success: false, message: "Invalid cart total." });
    }

    // website match: coupon.website = website OR all
    const coupon = await Coupon.findOne({ code, website: { $in: [website, "all"] } });
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found." });

    const computed = computeStatusByDates(coupon);

    if (coupon.status === "disabled") {
      return res.status(400).json({ success: false, message: "Coupon is disabled." });
    }
    if (computed === "expired") {
      return res.status(400).json({ success: false, message: "Coupon expired." });
    }
    if (computed === "scheduled") {
      return res.status(400).json({ success: false, message: "Coupon not started yet." });
    }
    if (coupon.status === "draft") {
      return res.status(400).json({ success: false, message: "Coupon is not active." });
    }

    // ✅ min order
    const minOrder = coupon.minOrder != null ? Number(coupon.minOrder) : null;
    if (minOrder != null && cartTotal < minOrder) {
      return res.status(400).json({
        success: false,
        message: `Minimum order is ₹${minOrder.toLocaleString("en-IN")}.`,
      });
    }

    // ✅ total limit
    if (coupon.totalLimit != null && coupon.usedCount >= Number(coupon.totalLimit)) {
      return res.status(400).json({ success: false, message: "Coupon usage limit reached." });
    }

    // ✅ per user limit
    if (coupon.perUserLimit != null) {
      if (!userId) {
        return res.status(400).json({ success: false, message: "Login required to use this coupon." });
      }
      const usage = await CouponUsage.findOne({ couponId: coupon._id, userId });
      const used = usage?.count || 0;
      if (used >= Number(coupon.perUserLimit)) {
        return res.status(400).json({ success: false, message: "Per-user coupon limit reached." });
      }
    }

    const discountBreakdown = calcDiscount({ coupon, cartTotal, shipping });

    return res.json({
      success: true,
      valid: true, // ✅ helps frontend
      message: "Coupon applied",
      coupon: {
        couponId: String(coupon._id), // ✅ match frontend expected key
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        maxDiscount: coupon.maxDiscount,
        minOrder: coupon.minOrder,
        website: coupon.website,
      },
      ...discountBreakdown,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message || "Failed to apply coupon" });
  }
};
