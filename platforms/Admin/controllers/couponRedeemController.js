// controllers/couponRedeemController.js
const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
const { normalizeCode, computeStatusByDates } = require("../utils/coupons");

const allowedWebsites = ["affordable", "midrange", "luxury"];

// POST /api/:website/coupons/redeem
// Call this AFTER order is successfully created & paid/confirmed
exports.redeemCoupon = async (req, res) => {
  try {
    const website = String(req.params.website || "").toLowerCase();
    if (!allowedWebsites.includes(website)) {
      return res.status(400).json({ success: false, message: "Invalid website segment." });
    }

    const code = normalizeCode(req.body.code);
    const userId = req.body.userId;
    if (!code) return res.status(400).json({ success: false, message: "Coupon code required." });
    if (!userId) return res.status(400).json({ success: false, message: "userId required." });

    const coupon = await Coupon.findOne({ code, website: { $in: [website, "all"] } });
    if (!coupon) return res.status(404).json({ success: false, message: "Coupon not found." });

    const computed = computeStatusByDates(coupon);
    if (coupon.status === "disabled" || computed !== "active") {
      return res.status(400).json({ success: false, message: "Coupon not redeemable right now." });
    }

    // total limit
    if (coupon.totalLimit != null && coupon.usedCount >= Number(coupon.totalLimit)) {
      return res.status(400).json({ success: false, message: "Coupon usage limit reached." });
    }

    // per user limit
    if (coupon.perUserLimit != null) {
      const usage = await CouponUsage.findOne({ couponId: coupon._id, userId });
      const used = usage?.count || 0;
      if (used >= Number(coupon.perUserLimit)) {
        return res.status(400).json({ success: false, message: "Per-user coupon limit reached." });
      }
    }

    // ✅ update counts atomically
    await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } });

    await CouponUsage.updateOne(
      { couponId: coupon._id, userId },
      { $inc: { count: 1 } },
      { upsert: true }
    );

    return res.json({ success: true, message: "Coupon redeemed." });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message || "Failed to redeem coupon" });
  }
};
