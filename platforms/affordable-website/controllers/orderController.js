// controllers/affordableOrderController.js
const mongoose = require("mongoose");
const axios = require("axios");
const Order = require("../models/AffordableOrder");
const Address = require("../models/AffordableAddress");
const Customer = require("../models/affordable_customers");
const Coupon = require("../../Admin/models/Coupon");
const CouponUsage = require("../../Admin/models/CouponUsage");

const safeName = (u) =>
  (u?.fullName || u?.name || `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || "").trim();

function clampMoney(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.round(x * 100) / 100;
}

function calcShipping(_subtotal, shippingCostFromClient) {
  return clampMoney(shippingCostFromClient);
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

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

function formatPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.trim().replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  } else if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+${cleaned}`;
  } else if (cleaned.length > 10 && cleaned.startsWith("0")) {
    return `+91${cleaned.substring(1)}`;
  } else if (cleaned.startsWith("+")) {
    return cleaned;
  } else {
    return `+${cleaned}`;
  }
}

async function sendWhatsAppMessage(to, body) {
  try {
    const apiUrl =
      "https://publicapi.myoperator.co";

    const apiKey = process.env.WHATSAPP_API_KEY;
    const companyId = process.env.WHATSAPP_COMPANY_ID;

    if (!apiKey || !companyId) {
      console.error("❌ Missing WhatsApp env config");
      return;
    }

    const phone = to.replace("+", "");

    const payload = {
      company_id: companyId,
      phone_number: phone,
      message: {
        type: "text",
        text: body,
      },
    };

    const response = await axios.post(apiUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey, // ✅ FIXED
      },
    });

    console.log("✅ WhatsApp Sent:", response.data);
    return response.data;
  } catch (err) {
    console.error("❌ WhatsApp Error:", err.response?.data || err.message);
    throw err;
  }
}
// -------------------- Main Controller --------------------

exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const userId = req.user?.id;
    const { addressId, items, pricing, payment, coupon } = req.body;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    if (!addressId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Missing order fields" });
    }
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
      return res.status(400).json({ message: "Invalid addressId" });
    }

    const address = await Address.findOne({ _id: addressId, userId }).lean();
    if (!address) {
      return res.status(404).json({ message: "Address not found for this user" });
    }

    let serverSubtotal = 0;
    const normalizedItems = items.map((it) => {
      const qty = Math.max(1, Number(it.quantity || 1));
      const snapPrice = Number(it?.productSnapshot?.price ?? it?.price ?? 0);

      if (!it.productId) throw new Error("Invalid items in cart");
      if (!Number.isFinite(snapPrice) || snapPrice < 0) throw new Error("Invalid product price snapshot");

      const price = clampMoney(snapPrice);
      const finalPrice = price;
      serverSubtotal += price * qty;

      return {
        productId: it.productId,
        variantId: it.variantId || null,
        quantity: qty,
        price,
        discountPercent: Number(it.discountPercent || 0),
        discountAmount: clampMoney(it.discountAmount || 0),
        finalPrice: clampMoney(it.finalPrice ?? finalPrice),
        attributes: {
          size: it.attributes?.size || null,
          color: it.attributes?.color || null,
          fabric: it.attributes?.fabric || null,
        },
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
    const serverShipping = calcShipping(serverSubtotal, pricing?.shippingCost);

    let appliedCoupon = null;
    let serverDiscount = 0;
    let serverShippingDiscount = 0;

    if (coupon?.code || coupon?.couponId) {
      const code = normalizeCode(coupon.code);
      const couponQuery = coupon.couponId ? { _id: coupon.couponId } : { code };

      const found = await Coupon.findOne({
        ...couponQuery,
        website: { $in: ["affordable", "all"] },
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

      if (found.perUserLimit != null) {
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

      await Customer.findByIdAndUpdate(
        userId,
        {
          $addToSet: { orders: createdOrder._id },
          $inc: { totalOrders: 1, totalSpent: finalTotal },
        },
        { session }
      );
    });

    // ---------- WhatsApp notification with fallback ----------
    console.log("[DEBUG] Entering WhatsApp notification block");

    try {
      // Fetch full customer data to inspect all fields
      const customer = await Customer.findById(userId).lean();
      console.log("[DEBUG] Full customer data:", customer);

      let phone = null;

      // Try to get phone from customer first
      if (customer?.phone) {
        phone = customer.phone;
        console.log("[DEBUG] Found phone in customer:", phone);
      } else if (customer?.mobile) {
        phone = customer.mobile;
        console.log("[DEBUG] Found mobile in customer:", phone);
      } else if (customer?.phoneNumber) {
        phone = customer.phoneNumber;
        console.log("[DEBUG] Found phoneNumber in customer:", phone);
      }

      // If still no phone, try to get it from the address
      if (!phone && address) {
        if (address.phone) {
          phone = address.phone;
          console.log("[DEBUG] Found phone in address:", phone);
        } else if (address.mobile) {
          phone = address.mobile;
          console.log("[DEBUG] Found mobile in address:", phone);
        } else if (address.phoneNumber) {
          phone = address.phoneNumber;
          console.log("[DEBUG] Found phoneNumber in address:", phone);
        }
      }

      if (phone) {
        const formattedPhone = formatPhoneNumber(phone);
        console.log("[DEBUG] Formatted phone number:", formattedPhone);

        if (formattedPhone) {
          // Build a more detailed order confirmation message
          const itemList = normalizedItems
            .map(item => `${item.productSnapshot?.name || 'Item'} x${item.quantity}`)
            .join('\n');

          const message = `🎉 Thank you for your order!\n\nOrder ID: ${createdOrder._id}\nTotal: ₹${finalTotal}\n\nItems:\n${itemList}\n\nWe'll notify you once it ships.\n\n- Affordable Team`;
          console.log("[DEBUG] Sending message to:", formattedPhone);
          await sendWhatsAppMessage(formattedPhone, message);
          console.log("[DEBUG] Message sent successfully");
        } else {
          console.log("[DEBUG] Phone number formatting returned null");
        }
      } else {
        console.log("[DEBUG] No phone found in customer or address");
      }
    } catch (waError) {
      console.error("[DEBUG] WhatsApp notification failed:", waError.message);
    }

    return res.status(201).json({ data: createdOrder });
  } catch (err) {
    console.error("[DEBUG] Order creation error:", err);
    return res.status(500).json({ message: err.message || "Failed to create order" });
  } finally {
    session.endSession();
  }
};

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