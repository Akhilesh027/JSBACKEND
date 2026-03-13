const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
const { normalizeCode, computeStatusByDates } = require("../utils/coupons");

const allowedWebsites = ["affordable", "midrange", "luxury"];

function getItemCategoryKeys(item) {
  const keys = [];

  const directValues = [
    item?.categoryId,
    item?.category,
    item?.subcategoryId,
    item?.subcategory,

    item?.product?.categoryId,
    item?.product?.category,
    item?.product?.subcategoryId,
    item?.product?.subcategory,

    item?.productSnapshot?.categoryId,
    item?.productSnapshot?.category,
    item?.productSnapshot?.subcategoryId,
    item?.productSnapshot?.subcategory,
  ];

  for (const value of directValues) {
    if (!value) continue;

    if (typeof value === "string") {
      keys.push(String(value).trim().toLowerCase());
    } else if (typeof value === "object") {
      if (value._id) keys.push(String(value._id).trim().toLowerCase());
      if (value.id) keys.push(String(value.id).trim().toLowerCase());
      if (value.slug) keys.push(String(value.slug).trim().toLowerCase());
      if (value.name) keys.push(String(value.name).trim().toLowerCase());
    }
  }

  return [...new Set(keys.filter(Boolean))];
}

function hasEligibleItems(items = [], allowedCategoryKeys = []) {
  const allowedSet = new Set(
    allowedCategoryKeys.map((id) => String(id).trim().toLowerCase())
  );

  return items.some((item) => {
    const itemCategoryKeys = getItemCategoryKeys(item);
    return itemCategoryKeys.some((id) =>
      allowedSet.has(String(id).trim().toLowerCase())
    );
  });
}

// POST /api/:website/coupons/redeem
exports.redeemCoupon = async (req, res) => {
  try {
    const website = String(req.params.website || "").toLowerCase();
    if (!allowedWebsites.includes(website)) {
      return res.status(400).json({
        success: false,
        message: "Invalid website segment.",
      });
    }

    const code = normalizeCode(req.body.code);
    const userId = req.body.userId;
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Coupon code required.",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId required.",
      });
    }

    const coupon = await Coupon.findOne({
      code,
      website: { $in: [website, "all"] },
    }).populate("categories", "name slug");

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found.",
      });
    }

    const computed = computeStatusByDates(coupon);

    if (coupon.status === "disabled" || computed !== "active") {
      return res.status(400).json({
        success: false,
        message: "Coupon not redeemable right now.",
      });
    }

    if (
      coupon.applyTo === "selected_categories" &&
      Array.isArray(coupon.categories) &&
      coupon.categories.length > 0
    ) {
      const allowedCategoryKeys = coupon.categories.flatMap((cat) => {
        const arr = [];
        if (cat?._id) arr.push(String(cat._id).trim().toLowerCase());
        if (cat?.id) arr.push(String(cat.id).trim().toLowerCase());
        if (cat?.slug) arr.push(String(cat.slug).trim().toLowerCase());
        if (cat?.name) arr.push(String(cat.name).trim().toLowerCase());
        return arr;
      });

      if (!items.length) {
        return res.status(400).json({
          success: false,
          message:
            "Cart/order items are required to redeem this category-specific coupon.",
        });
      }

      const eligible = hasEligibleItems(items, allowedCategoryKeys);

      if (!eligible) {
        return res.status(400).json({
          success: false,
          message: "Coupon is not applicable to these order items.",
        });
      }
    }

    if (
      coupon.totalLimit != null &&
      coupon.usedCount >= Number(coupon.totalLimit)
    ) {
      return res.status(400).json({
        success: false,
        message: "Coupon usage limit reached.",
      });
    }

    if (coupon.perUserLimit != null) {
      const usage = await CouponUsage.findOne({ couponId: coupon._id, userId });
      const used = usage?.count || 0;

      if (used >= Number(coupon.perUserLimit)) {
        return res.status(400).json({
          success: false,
          message: "Per-user coupon limit reached.",
        });
      }
    }

    await Coupon.updateOne({ _id: coupon._id }, { $inc: { usedCount: 1 } });

    await CouponUsage.updateOne(
      { couponId: coupon._id, userId },
      { $inc: { count: 1 } },
      { upsert: true }
    );

    return res.json({
      success: true,
      message: "Coupon redeemed.",
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to redeem coupon",
    });
  }
};