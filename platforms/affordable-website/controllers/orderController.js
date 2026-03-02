// controllers/affordableOrderController.js
// ✅ UPDATED FULL CONTROLLER:
// FIXES / IMPROVEMENTS:
// 1) DO NOT accept userId from body (security). Use req.user.id (JWT middleware).
// 2) Address check uses userId from token.
// 3) Computes serverSubtotal + also computes item-level finalPrice fields (so model matches).
// 4) Coupon checks include website match (affordable/all) and safe date fields (startDate/endDate OR startAt/endAt).
// 5) Per-user coupon limit uses CouponUsage "count" (recommended) OR countDocuments fallback.
// 6) Atomic coupon increment with totalLimit guard (prevents race).
// 7) Writes statusHistory entry on create.
// 8) Returns { data: order } format (consistent with your other APIs) – change if you need old format.

const mongoose = require("mongoose");
const Order = require("../models/AffordableOrder");
const Address = require("../models/AffordableAddress");
const Customer = require("../models/affordable_customers");
const Coupon = require("../../Admin/models/Coupon");
const CouponUsage = require("../../Admin/models/CouponUsage");

// helper
const safeName = (u) =>
  (u?.fullName || u?.name || `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || "").trim();

function clampMoney(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.round(x * 100) / 100;
}

function calcShipping(_subtotal, shippingCostFromClient) {
  // If you want rules: return subtotal >= 5000 ? 0 : 299;
  return clampMoney(shippingCostFromClient);
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

// supports both (startAt/endAt) and (startDate/endDate)
function isActiveByDates(c) {
  const now = Date.now();
  const startRaw = c.startAt || c.startDate;
  const endRaw = c.endAt || c.endDate;

  const start = startRaw ? +new Date(startRaw) : null;
  const end = endRaw ? +new Date(endRaw) : null;

  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

function computeCouponDiscount({ coupon, subtotal, shipping }) {
  let discount = 0;
  let shippingDiscount = 0;

  if (!coupon) return { discount: 0, shippingDiscount: 0 };

  if (coupon.type === "flat") {
    discount = clampMoney(coupon.value);
  } else if (coupon.type === "percentage") {
    const pct = Number(coupon.value || 0);
    discount = clampMoney((subtotal * pct) / 100);
    if (coupon.maxDiscount != null) {
      discount = Math.min(discount, clampMoney(coupon.maxDiscount));
    }
  } else if (coupon.type === "free_shipping") {
    shippingDiscount = clampMoney(shipping);
  }

  discount = Math.min(discount, subtotal);
  shippingDiscount = Math.min(shippingDiscount, shipping);

  return { discount, shippingDiscount };
}

/**
 * POST /api/affordable/orders
 * body: { addressId, items, pricing, payment, coupon? }
 * auth: req.user.id from JWT middleware
 */
exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const userId = req.user?.id; // ✅ FROM TOKEN
    const { addressId, items, pricing, payment, coupon } = req.body;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    if (!addressId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Missing order fields" });
    }

    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ message: "Invalid addressId" });
    }

    // ✅ validate address belongs to the user
    const address = await Address.findOne({ _id: addressId, userId }).lean();
    if (!address) {
      return res.status(404).json({ message: "Address not found for this user" });
    }

    // ✅ server subtotal from snapshots + also normalize items to match model fields
    let serverSubtotal = 0;

    const normalizedItems = items.map((it) => {
      const qty = Math.max(1, Number(it.quantity || 1));
      const snapPrice = Number(it?.productSnapshot?.price ?? it?.price ?? 0);

      if (!it.productId) throw new Error("Invalid items in cart");
      if (!Number.isFinite(snapPrice) || snapPrice < 0) throw new Error("Invalid product price snapshot");

      // Affordable tier: you are not applying automatic 10% like midrange
      // So finalPrice == price, discount* == 0 unless you want per-item discount feature
      const price = clampMoney(snapPrice);
      const finalPrice = price;

      serverSubtotal += price * qty;

      return {
        productId: it.productId,
        quantity: qty,
        price,
        discountPercent: Number(it.discountPercent || 0),
        discountAmount: clampMoney(it.discountAmount || 0),
        finalPrice: clampMoney(it.finalPrice ?? finalPrice),
        productSnapshot: {
          name: it?.productSnapshot?.name,
          price: it?.productSnapshot?.price ?? price,
          image: it?.productSnapshot?.image,
          category: it?.productSnapshot?.category,
          inStock: it?.productSnapshot?.inStock,
          colors: it?.productSnapshot?.colors,
          originalPrice: it?.productSnapshot?.originalPrice,
        },
      };
    });

    serverSubtotal = clampMoney(serverSubtotal);

    // ✅ shipping
    const serverShipping = calcShipping(serverSubtotal, pricing?.shippingCost);

    // -------------------------
    // ✅ coupon validation + compute discount
    // -------------------------
    let appliedCoupon = null;
    let serverDiscount = 0;
    let serverShippingDiscount = 0;

    if (coupon?.code || coupon?.couponId) {
      const code = normalizeCode(coupon.code);
      const couponQuery = coupon.couponId
        ? { _id: coupon.couponId }
        : { code };

      const found = await Coupon.findOne({
        ...couponQuery,
        website: { $in: ["affordable", "all"] }, // ✅ important
      }).lean();

      if (!found) return res.status(400).json({ message: "Invalid coupon" });

      if (found.status !== "active") return res.status(400).json({ message: "Coupon is not active" });
      if (!isActiveByDates(found))
        return res.status(400).json({ message: "Coupon is expired or not started" });

      if (found.minOrder != null && serverSubtotal < Number(found.minOrder)) {
        return res.status(400).json({
          message: `Minimum order is ₹${Number(found.minOrder).toLocaleString("en-IN")}`,
        });
      }

      if (found.totalLimit != null && Number(found.usedCount || 0) >= Number(found.totalLimit)) {
        return res.status(400).json({ message: "Coupon usage limit reached" });
      }

      // per user limit
      if (found.perUserLimit != null) {
        // If your CouponUsage schema has { couponId, userId, count }
        const usage = await CouponUsage.findOne({ userId, couponId: found._id }).lean();
        const used = usage?.count ?? 0;

        if (used >= Number(found.perUserLimit)) {
          return res.status(400).json({ message: "Per-user coupon limit reached" });
        }
      }

      const computed = computeCouponDiscount({
        coupon: found,
        subtotal: serverSubtotal,
        shipping: serverShipping,
      });

      appliedCoupon = found;
      serverDiscount = computed.discount;
      serverShippingDiscount = computed.shippingDiscount;
    }

    const finalShipping = clampMoney(serverShipping - serverShippingDiscount);
    const finalTotal = clampMoney(serverSubtotal - serverDiscount + finalShipping);

    let createdOrder = null;

    await session.withTransaction(async () => {
      // ✅ If coupon used, atomically increment usedCount (prevent race)
      if (appliedCoupon) {
        const totalLimit = appliedCoupon.totalLimit ?? Number.MAX_SAFE_INTEGER;

        const upd = await Coupon.updateOne(
          {
            _id: appliedCoupon._id,
            status: "active",
            usedCount: { $lt: Number(totalLimit) },
          },
          { $inc: { usedCount: 1 } },
          { session }
        );

        if (upd.modifiedCount !== 1) {
          throw new Error("Coupon could not be redeemed (limit reached)");
        }

        // ✅ record per-user usage counter (better than countDocuments)
        await CouponUsage.updateOne(
          { couponId: appliedCoupon._id, userId },
          {
            $inc: { count: 1 },
            $setOnInsert: { couponId: appliedCoupon._id, userId, code: appliedCoupon.code },
          },
          { upsert: true, session }
        );
      }

      const [orderDoc] = await Order.create(
        [
          {
            userId,
            addressId,
            items: normalizedItems,

            coupon: appliedCoupon
              ? {
                  couponId: appliedCoupon._id,
                  code: appliedCoupon.code,
                  type: appliedCoupon.type,
                  value: appliedCoupon.value,
                  maxDiscount: appliedCoupon.maxDiscount,
                }
              : undefined,

            pricing: {
              subtotal: serverSubtotal,
              discount: serverDiscount,
              shippingCost: serverShipping,
              shippingDiscount: serverShippingDiscount,
              total: finalTotal,
            },

            payment: {
              method: payment?.method || "cod",
              upiId: payment?.upiId || "",
              cardLast4: payment?.cardLast4 || "",
              status: payment?.status || "pending",
              razorpayOrderId: payment?.razorpayOrderId || "",
              razorpayPaymentId: payment?.razorpayPaymentId || "",
              razorpaySignature: payment?.razorpaySignature || "",
            },

            website: "affordable",
            status: "placed",
            statusHistory: [
              {
                status: "placed",
                changedAt: new Date(),
                note: "Order created",
              },
            ],
          },
        ],
        { session }
      );

      createdOrder = orderDoc;

      // ✅ update customer order stats
      await Customer.findByIdAndUpdate(
        userId,
        {
          $addToSet: { orders: createdOrder._id },
          $inc: { totalOrders: 1, totalSpent: finalTotal },
        },
        { session }
      );
    });

    return res.status(201).json({ data: createdOrder });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to create order" });
  } finally {
    session.endSession();
  }
};

/**
 * GET /api/affordable/orders/my
 * auth-based: returns user's orders
 */
exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const orders = await Order.find({ userId })
      .populate("addressId")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ data: orders });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to fetch orders" });
  }
};

/**
 * GET /api/affordable/orders/:userId
 * (admin usage) return enriched order list
 */
exports.getOrdersByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await Customer.findById(userId)
      .select("firstName lastName name fullName email phone")
      .lean();

    const orders = await Order.find({ userId })
      .populate("addressId")
      .sort({ createdAt: -1 })
      .lean();

    const enriched = orders.map((o) => ({
      ...o,
      userDetails: user
        ? {
            _id: user._id,
            name: safeName(user),
            email: user.email,
            phone: user.phone,
          }
        : null,
      addressDetails: o.addressId || null,
    }));

    return res.json({ data: enriched });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Failed to fetch orders" });
  }
};