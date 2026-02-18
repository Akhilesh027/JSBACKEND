const Order = require("../models/AffordableOrder");
const Address = require("../models/AffordableAddress");
const Customer = require("../models/affordable_customers"); // ✅ adjust path if needed
const Coupon = require("../../Admin/models/Coupon");
const CouponRedemption = require("../../Admin/models/CouponUsage"); // renamed for clarity
const mongoose = require("mongoose");

// helper
const safeName = (u) =>
  (u?.fullName || u?.name || `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || "").trim();
const nowISO = () => new Date().toISOString();

function clampMoney(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.round(x * 100) / 100;

}

function calcShipping(subtotal, shippingCostFromClient) {
  // keep your rule OR trust client shippingCost but clamp >=0
  // If you want: free shipping above 5000:
  // return subtotal >= 5000 ? 0 : 299;
  return clampMoney(shippingCostFromClient);
}

function isActiveByDates(c) {
  const now = Date.now();
  const start = +new Date(c.startAt);
  const end = +new Date(c.endAt);
  return start <= now && now <= end;
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

  // never exceed subtotal / shipping
  discount = Math.min(discount, subtotal);
  shippingDiscount = Math.min(shippingDiscount, shipping);

  return { discount, shippingDiscount };
}


/**
 * POST /api/affordable/orders
 * body: { userId, addressId, items, pricing, payment }
 */
exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const {
      userId,
      addressId,
      items,
      pricing,
      payment,
      coupon, // ✅ optional: { code, couponId, type }
    } = req.body;

    if (!userId || !addressId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Missing order fields" });
    }

    // ✅ validate address belongs to the user
    const address = await Address.findOne({ _id: addressId, userId }).lean();
    if (!address) {
      return res.status(404).json({ error: "Address not found for this user" });
    }

    // ✅ server subtotal from snapshots (preferred)
    // items should include productSnapshot.price at time of checkout
    let serverSubtotal = 0;

    for (const it of items) {
      const qty = Number(it.quantity || 0);
      const price = Number(it?.productSnapshot?.price || 0);
      if (!it.productId || !Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ error: "Invalid items in cart" });
      }
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ error: "Invalid product price snapshot" });
      }
      serverSubtotal += price * qty;
    }
    serverSubtotal = clampMoney(serverSubtotal);

    // ✅ shipping (keep your existing rule)
    const serverShipping = calcShipping(serverSubtotal, pricing?.shippingCost);

    // -------------------------
    // ✅ coupon validation + compute discount
    // -------------------------
    let appliedCoupon = null;
    let serverDiscount = 0;
    let serverShippingDiscount = 0;

    // If client passed a coupon, verify it on server
    if (coupon?.code || coupon?.couponId) {
      const code = String(coupon.code || "").trim().toUpperCase();
      const couponQuery = coupon.couponId
        ? { _id: coupon.couponId }
        : { code };

      const found = await Coupon.findOne(couponQuery).lean();
      if (!found) {
        return res.status(400).json({ error: "Invalid coupon" });
      }

      // ✅ status checks
      if (found.status !== "active") {
        return res.status(400).json({ error: "Coupon is not active" });
      }
      if (!isActiveByDates(found)) {
        return res.status(400).json({ error: "Coupon is expired or not started" });
      }

      // ✅ minimum order
      if (found.minOrder != null && serverSubtotal < Number(found.minOrder)) {
        return res.status(400).json({
          error: `Minimum order is ₹${Number(found.minOrder).toLocaleString("en-IN")}`,
        });
      }

      // ✅ total usage limit
      if (found.totalLimit != null && Number(found.usedCount || 0) >= Number(found.totalLimit)) {
        return res.status(400).json({ error: "Coupon usage limit reached" });
      }

      // ✅ per user limit (requires redemption collection)
      if (found.perUserLimit != null) {
        const usedByUser = await CouponRedemption.countDocuments({
          userId,
          couponId: found._id,
        });
        if (usedByUser >= Number(found.perUserLimit)) {
          return res.status(400).json({ error: "Per-user coupon limit reached" });
        }
      }

      // ✅ compute discounts
      const computed = computeCouponDiscount({
        coupon: found,
        subtotal: serverSubtotal,
        shipping: serverShipping,
      });

      appliedCoupon = found;
      serverDiscount = computed.discount;
      serverShippingDiscount = computed.shippingDiscount;
    }

    // ✅ final totals from server
    const finalShipping = clampMoney(serverShipping - serverShippingDiscount);
    const finalTotal = clampMoney(serverSubtotal - serverDiscount + finalShipping);

    // -------------------------
    // ✅ transaction: order + coupon usage + customer totals
    // -------------------------
    let createdOrder = null;

    await session.withTransaction(async () => {
      // ✅ If coupon used, atomically increment usedCount (prevent race)
      if (appliedCoupon) {
        const upd = await Coupon.updateOne(
          {
            _id: appliedCoupon._id,
            status: "active",
            usedCount: { $lt: appliedCoupon.totalLimit ?? Number.MAX_SAFE_INTEGER },
          },
          { $inc: { usedCount: 1 } },
          { session }
        );

        if (upd.modifiedCount !== 1) {
          throw new Error("Coupon could not be redeemed (limit reached)");
        }

        // ✅ record redemption (for per-user limit / audit)
        await CouponRedemption.create(
          [
            {
              userId,
              couponId: appliedCoupon._id,
              code: appliedCoupon.code,
              orderTotal: finalTotal,
              redeemedAt: new Date(),
            },
          ],
          { session }
        );
      }

      createdOrder = await Order.create(
        [
          {
            userId,
            addressId,
            items,

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
            },

            status: "placed",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        { session }
      );

      // ✅ IMPORTANT: update customer order history + totals
      await Customer.findByIdAndUpdate(
        userId,
        {
          $addToSet: { orders: createdOrder[0]._id },
          $inc: { totalOrders: 1, totalSpent: finalTotal },
        },
        { new: true, session }
      );
    });

    return res.status(201).json({ order: createdOrder[0] });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to create order" });
  } finally {
    session.endSession();
  }
};


/**
 * GET /api/affordable/orders/:userId
 * return enriched order list
 */
exports.getOrdersByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // ✅ fetch user once
    const user = await Customer.findById(userId)
      .select("firstName lastName name fullName email phone")
      .lean();

    const orders = await Order.find({ userId })
      .populate("addressId") // gives address doc in addressId
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
      // ✅ frontend wants addressDetails
      addressDetails: o.addressId || null,
    }));

    return res.json({ orders: enriched });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to fetch orders" });
  }
};
