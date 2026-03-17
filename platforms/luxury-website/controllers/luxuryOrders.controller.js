// controllers/luxuryOrderController.js
const Customer = require("../models/luxury_customers");
const LuxuryOrder = require("../models/luxury_orders.js");
const Coupon = require("../../Admin/models/Coupon.js");
const CouponUsage = require("../../Admin/models/CouponUsage.js");
const mongoose = require("mongoose");
const crypto = require("crypto");

const WEBSITE = "luxury";
const MIN_PAYABLE_TOTAL = 10;

const normalizeMethod = (m) => {
  const method = String(m || "").toLowerCase();
  if (["razorpay", "cod"].includes(method)) return method;
  if (["card", "upi", "netbanking"].includes(method)) return "cod";
  return "cod";
};

const normalizeCode = (c) => String(c || "").trim().toUpperCase();

const computeStatusByDates = (cpn) => {
  const now = new Date();
  if (cpn.startDate && now < cpn.startDate) return "scheduled";
  if (cpn.endDate && now > cpn.endDate) return "expired";
  return "active";
};

const calcDiscount = ({ coupon, cartTotal, shipping }) => {
  let discount = 0;
  let shippingDiscount = 0;

  if (coupon.type === "percentage") {
    discount = Math.round((cartTotal * Number(coupon.value || 0)) / 100);
    if (coupon.maxDiscount != null) discount = Math.min(discount, Number(coupon.maxDiscount));
  } else if (coupon.type === "fixed" || coupon.type === "flat") {
    discount = Math.round(Number(coupon.value || 0));
    if (coupon.maxDiscount != null) discount = Math.min(discount, Number(coupon.maxDiscount));
  } else if (coupon.type === "free_shipping") {
    shippingDiscount = shipping;
  }

  discount = Math.max(0, Math.min(discount, cartTotal));
  shippingDiscount = Math.max(0, Math.min(shippingDiscount, shipping));

  return { discount, shippingDiscount };
};

function verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) return false;

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error("RAZORPAY_KEY_SECRET missing on server");

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return expected === razorpaySignature;
}

exports.placeOrder = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { addressId, address, items, payment, coupon } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "Cart items required" });
    }

    let createdOrder = null;

    await session.withTransaction(async () => {
      const customer = await Customer.findById(req.user.id)
        .select("addresses firstName lastName email phone totalOrders totalSpent loyaltyPoints rewardTier")
        .session(session);

      if (!customer) throw new Error("Customer not found");

      // Resolve shipping address snapshot
      let shippingAddress = null;

      if (addressId) {
        const addr = customer.addresses?.find((a) => String(a._id) === String(addressId));
        if (!addr) throw new Error("Address not found");
        shippingAddress = addr.toObject ? addr.toObject() : addr;
      } else if (address) {
        if (!address.addressLine1 || !address.city || !address.state || !address.pincode) {
          throw new Error("Invalid address");
        }
        shippingAddress = address;
      } else {
        const def = customer.addresses?.find((a) => a.isDefault);
        if (!def) throw new Error("No address found. Add an address.");
        shippingAddress = def.toObject ? def.toObject() : def;
      }

      // ✅ normalize + validate items (server-side) – now includes variantId and attributes
      const cleanItems = items.map((it, idx) => {
        const productId = it.productId || it.product?._id || it.id || null;
        if (!productId || !mongoose.Types.ObjectId.isValid(String(productId))) {
          throw new Error(`Invalid productId at item index ${idx}`);
        }

        const qty = Math.max(1, Number(it.quantity) || 1);
        const price = Math.max(0, Number(it.price) || 0);

        return {
          productId,
          variantId: it.variantId || null,                      // ✅ NEW
          attributes: it.attributes || {},                       // ✅ NEW
          name: String(it.name || ""),
          image: String(it.image || ""),
          color: String(it.color || ""),                         // legacy
          price,
          quantity: qty,
          lineTotal: price * qty,
        };
      });

      const computedSubtotal = cleanItems.reduce((s, it) => s + it.lineTotal, 0);
      const computedShippingBase =
        computedSubtotal > 500000 ? 0 : computedSubtotal === 0 ? 0 : 5000;

      // Coupon handling (unchanged) ...
      let appliedCouponDoc = null;
      let appliedCouponSnapshot = null;
      let discount = 0;
      let shippingDiscount = 0;

      if (coupon?.code) {
        const code = normalizeCode(coupon.code);

        const cpn = await Coupon.findOne({ code, website: { $in: [WEBSITE, "all"] } }).session(session);
        if (!cpn) throw new Error("Invalid coupon.");

        const computedStatus = computeStatusByDates(cpn);
        if (cpn.status === "disabled") throw new Error("Coupon is disabled.");
        if (computedStatus === "expired") throw new Error("Coupon expired.");
        if (computedStatus === "scheduled") throw new Error("Coupon not started yet.");
        if (cpn.status === "draft") throw new Error("Coupon is not active.");

        if (cpn.minOrder != null && computedSubtotal < Number(cpn.minOrder)) {
          throw new Error(`Minimum order is ₹${Number(cpn.minOrder).toLocaleString("en-IN")}.`);
        }

        if (cpn.totalLimit != null && cpn.usedCount >= Number(cpn.totalLimit)) {
          throw new Error("Coupon usage limit reached.");
        }

        if (cpn.perUserLimit != null) {
          const usage = await CouponUsage.findOne({ couponId: cpn._id, userId: req.user.id }).session(session);
          const used = usage?.count || 0;
          if (used >= Number(cpn.perUserLimit)) throw new Error("Per-user coupon limit reached.");
        }

        const breakdown = calcDiscount({
          coupon: cpn,
          cartTotal: computedSubtotal,
          shipping: computedShippingBase,
        });

        discount = Number(breakdown.discount || 0);
        shippingDiscount = Number(breakdown.shippingDiscount || 0);

        appliedCouponDoc = cpn;
        appliedCouponSnapshot = {
          couponId: cpn._id,
          code: cpn.code,
          type: cpn.type,
          value: cpn.value,
          maxDiscount: cpn.maxDiscount,
        };
      }

      const computedShipping = Math.max(0, computedShippingBase - shippingDiscount);
      const computedTotal = Math.max(0, computedSubtotal - discount) + computedShipping;

      if (computedTotal > 0 && computedTotal < MIN_PAYABLE_TOTAL) {
        throw new Error(
          `Minimum payable amount is ₹${MIN_PAYABLE_TOTAL}. Add more items or remove coupon.`
        );
      }

      // Payment
      const method = normalizeMethod(payment?.method);
      let payStatus = method === "cod" ? "unpaid" : "pending";

      if (method === "razorpay") {
        const razorpayOrderId = payment?.razorpayOrderId || payment?.razorpay_order_id;
        const razorpayPaymentId = payment?.razorpayPaymentId || payment?.razorpay_payment_id;
        const razorpaySignature = payment?.razorpaySignature || payment?.razorpay_signature;

        const ok = verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
        if (!ok) throw new Error("Invalid Razorpay payment");

        payStatus = "paid";
      }

      const shouldFinalize = method === "cod" || payStatus === "paid";

      // Create order
      const orderDocs = await LuxuryOrder.create(
        [
          {
            customerId: req.user.id,
            items: cleanItems,                                     // ✅ now includes variantId & attributes
            pricing: {
              subtotal: computedSubtotal,
              discount,
              shippingBase: computedShippingBase,
              shippingDiscount,
              shipping: computedShipping,
              total: computedTotal,
              currency: "INR",
              coupon: appliedCouponSnapshot || undefined,
            },
            shippingAddress: {
              label: shippingAddress.label || "Home",
              firstName: shippingAddress.firstName || customer.firstName,
              lastName: shippingAddress.lastName || customer.lastName,
              email: shippingAddress.email || customer.email,
              phone: shippingAddress.phone || customer.phone,
              addressLine1: shippingAddress.addressLine1,
              addressLine2: shippingAddress.addressLine2 || "",
              city: shippingAddress.city,
              state: shippingAddress.state,
              pincode: shippingAddress.pincode,
              country: shippingAddress.country || "India",
            },
            payment: {
              method,
              status: payStatus,
              gateway: method === "razorpay" ? "razorpay" : "",
              transactionId: payment?.transactionId ? String(payment.transactionId) : "",
              razorpayOrderId: payment?.razorpayOrderId || payment?.razorpay_order_id || "",
              razorpayPaymentId: payment?.razorpayPaymentId || payment?.razorpay_payment_id || "",
              razorpaySignature: payment?.razorpaySignature || payment?.razorpay_signature || "",
            },
            status: shouldFinalize ? "placed" : "pending_payment",
            website: WEBSITE,
          },
        ],
        { session }
      );

      createdOrder = orderDocs[0];

      if (shouldFinalize) {
        if (appliedCouponDoc) {
          await Coupon.updateOne({ _id: appliedCouponDoc._id }, { $inc: { usedCount: 1 } }, { session });

          await CouponUsage.updateOne(
            { couponId: appliedCouponDoc._id, userId: req.user.id },
            { $inc: { count: 1 }, $set: { lastUsedAt: new Date() } },
            { upsert: true, session }
          );
        }

        const points = Math.floor(computedTotal / 100);

        const purchaseHistoryEntry = {
          productId: cleanItems?.[0]?.productId || null,
          productName: cleanItems?.[0]?.name || "Order",
          amount: computedTotal,
          date: new Date(),
          status: createdOrder.status,
          coupon: appliedCouponSnapshot?.code || "",
          discount,
        };

        await Customer.updateOne(
          { _id: req.user.id },
          {
            $push: { orders: createdOrder._id, purchaseHistory: purchaseHistoryEntry },
            $inc: { totalOrders: 1, totalSpent: computedTotal, loyaltyPoints: points },
          },
          { session }
        );
      }
    });

    return res.status(201).json({
      success: true,
      message: "Order placed",
      orderId: createdOrder._id,
      status: createdOrder.status,
      paymentStatus: createdOrder.payment?.status,
      order: createdOrder,
      pricing: createdOrder.pricing,
    });
  } catch (err) {
    const msg = err?.message || "Internal server error";

    if (String(msg).startsWith("Invalid productId")) {
      return res.status(400).json({ success: false, message: msg });
    }
    if (
      msg.includes("Coupon") ||
      msg.toLowerCase().includes("coupon") ||
      msg.toLowerCase().includes("razorpay") ||
      msg.includes("Minimum payable") ||
      msg.includes("Minimum order")
    ) {
      return res.status(400).json({ success: false, message: msg });
    }
    if (msg === "Customer not found" || msg === "Address not found") {
      return res.status(404).json({ success: false, message: msg });
    }

    console.error("placeOrder error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    session.endSession();
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const orders = await LuxuryOrder.find({ customerId: req.user.id }).sort({ createdAt: -1 });
    return res.json({ success: true, orders });
  } catch (err) {
    console.error("getMyOrders error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid orderId" });
    }

    const order = await LuxuryOrder.findOne({ _id: orderId, customerId: req.user.id });

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    return res.json({ success: true, order });
  } catch (err) {
    console.error("getOrderById error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};