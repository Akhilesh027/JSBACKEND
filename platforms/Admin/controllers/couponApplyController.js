const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
const {
  normalizeCode,
  computeStatusByDates,
  calcDiscount,
} = require("../utils/coupons");

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

function getEligibleCartTotal(items = [], allowedCategoryKeys = []) {
  const allowedSet = new Set(
    allowedCategoryKeys.map((v) => String(v).trim().toLowerCase())
  );

  let eligibleTotal = 0;
  let matchedItemsCount = 0;

  for (const item of items) {
    const itemCategoryKeys = getItemCategoryKeys(item);
    const isEligible = itemCategoryKeys.some((key) =>
      allowedSet.has(String(key).trim().toLowerCase())
    );

    if (!isEligible) continue;

    const qty = Number(item?.quantity ?? item?.qty ?? 1);
    const unitPrice = Number(
      item?.price ??
        item?.unitPrice ??
        item?.salePrice ??
        item?.finalPrice ??
        item?.product?.price ??
        item?.productSnapshot?.price ??
        item?.productSnapshot?.finalPrice ??
        item?.productSnapshot?.afterDiscount ??
        0
    );

    const lineTotalRaw =
      item?.lineTotal ??
      item?.total ??
      item?.subtotal ??
      item?.amount ??
      unitPrice * qty;

    const lineTotal = Number(lineTotalRaw || 0);

    if (Number.isFinite(lineTotal) && lineTotal > 0) {
      eligibleTotal += lineTotal;
      matchedItemsCount += 1;
    }
  }

  return {
    eligibleTotal,
    matchedItemsCount,
  };
}

// POST /api/:website/coupons/apply
exports.applyCoupon = async (req, res) => {
  try {
    const website = String(req.params.website || "").toLowerCase();
    if (!allowedWebsites.includes(website)) {
      return res.status(400).json({
        success: false,
        message: "Invalid website segment.",
      });
    }

    const rawCode = req.body.code;
    const code = normalizeCode(rawCode);

    const cartTotal = Number(
      req.body.cartTotal ?? req.body.subtotal ?? req.body.total ?? 0
    );

    const shipping = Number(req.body.shipping ?? req.body.shippingCost ?? 0);

    const userId = req.body.userId;
    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Coupon code required.",
      });
    }

    if (!Number.isFinite(cartTotal) || cartTotal < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid cart total.",
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

    if (coupon.status === "disabled") {
      return res.status(400).json({
        success: false,
        message: "Coupon is disabled.",
      });
    }

    if (computed === "expired") {
      return res.status(400).json({
        success: false,
        message: "Coupon expired.",
      });
    }

    if (computed === "scheduled") {
      return res.status(400).json({
        success: false,
        message: "Coupon not started yet.",
      });
    }

    if (coupon.status === "draft") {
      return res.status(400).json({
        success: false,
        message: "Coupon is not active.",
      });
    }

    let discountBaseTotal = cartTotal;
    let categoryValidation = {
      applyTo: coupon.applyTo || "all_categories",
      eligibleTotal: cartTotal,
      matchedItemsCount: items.length,
      categoryIds: [],
      categoryNames: [],
    };

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

      const allowedCategoryNames = coupon.categories.map(
        (cat) => cat?.name || cat?.slug || String(cat?._id || cat?.id || cat)
      );

      if (!items.length) {
        return res.status(400).json({
          success: false,
          message:
            "Cart items are required to validate this category-specific coupon.",
        });
      }

      const { eligibleTotal, matchedItemsCount } = getEligibleCartTotal(
        items,
        allowedCategoryKeys
      );

      if (matchedItemsCount === 0 || eligibleTotal <= 0) {
        return res.status(400).json({
          success: false,
          message: "This coupon is not applicable to the selected cart items.",
          couponScope: {
            applyTo: "selected_categories",
            categoryIds: allowedCategoryKeys,
            categoryNames: allowedCategoryNames,
          },
        });
      }

      discountBaseTotal = eligibleTotal;
      categoryValidation = {
        applyTo: "selected_categories",
        eligibleTotal,
        matchedItemsCount,
        categoryIds: allowedCategoryKeys,
        categoryNames: allowedCategoryNames,
      };
    }

    const minOrder =
      coupon.minOrder != null ? Number(coupon.minOrder) : null;

    if (minOrder != null && discountBaseTotal < minOrder) {
      return res.status(400).json({
        success: false,
        message: `Minimum order is ₹${minOrder.toLocaleString(
          "en-IN"
        )} for eligible items.`,
      });
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
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: "Login required to use this coupon.",
        });
      }

      const usage = await CouponUsage.findOne({ couponId: coupon._id, userId });
      const used = usage?.count || 0;

      if (used >= Number(coupon.perUserLimit)) {
        return res.status(400).json({
          success: false,
          message: "Per-user coupon limit reached.",
        });
      }
    }

    const discountBreakdown = calcDiscount({
      coupon,
      cartTotal: discountBaseTotal,
      shipping,
    });

    return res.json({
      success: true,
      valid: true,
      message: "Coupon applied",
      coupon: {
        couponId: String(coupon._id),
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        maxDiscount: coupon.maxDiscount,
        minOrder: coupon.minOrder,
        website: coupon.website,
        applyTo: coupon.applyTo || "all_categories",
        categories:
          coupon.applyTo === "selected_categories"
            ? coupon.categories.map((cat) => ({
                id: String(cat?._id || cat?.id || cat),
                name: cat?.name || "",
                slug: cat?.slug || "",
              }))
            : [],
      },
      discountContext: {
        originalCartTotal: cartTotal,
        discountBaseTotal,
        shipping,
        ...categoryValidation,
      },
      ...discountBreakdown,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "Failed to apply coupon",
    });
  }
};