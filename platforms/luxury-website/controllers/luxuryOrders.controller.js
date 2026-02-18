
const Customer = require("../models/luxury_customers");
const LuxuryOrder = require("../models/luxury_orders.js");
const Coupon = require("../../Admin/models/Coupon.js");
const CouponUsage = require("../../Admin/models/CouponUsage.js");
const mongoose = require("mongoose");
const normalizeMethod = (m) => {
  const method = String(m || "").toLowerCase();
  if (["card", "upi", "netbanking", "cod"].includes(method)) return method;
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
discount = (cartTotal * Number(coupon.value)) / 100;
if (coupon.maxDiscount != null) {
discount = Math.min(discount, Number(coupon.maxDiscount));
}
} else if (coupon.type === "fixed") {
discount = Number(coupon.value);
if (coupon.maxDiscount != null) {
discount = Math.min(discount, Number(coupon.maxDiscount));
}
} else if (coupon.type === "free_shipping") {
shippingDiscount = shipping;
}
return { discount, shippingDiscount };
};

exports.placeOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const MIN_PAYABLE_TOTAL = 10; // ✅ minimum payable amount rule

    const { addressId, address, items, payment, coupon } = req.body;

    // ✅ validate items
    if (!Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ success: false, message: "Cart items required" });
    }

    // ✅ load customer
    const customer = await Customer.findById(req.user.id)
      .select("addresses firstName lastName email phone totalOrders totalSpent loyaltyPoints rewardTier")
      .session(session);

    if (!customer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    // ✅ Resolve shipping address snapshot
    let shippingAddress = null;

    if (addressId) {
      const addr = customer.addresses?.find((a) => String(a._id) === String(addressId));
      if (!addr) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ success: false, message: "Address not found" });
      }
      shippingAddress = addr.toObject ? addr.toObject() : addr;
    } else if (address) {
      if (!address.addressLine1 || !address.city || !address.state || !address.pincode) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Invalid address" });
      }
      shippingAddress = address;
    } else {
      const def = customer.addresses?.find((a) => a.isDefault);
      if (!def) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "No address found. Add an address." });
      }
      shippingAddress = def.toObject ? def.toObject() : def;
    }

    // ✅ normalize + validate items (server-side)
    const cleanItems = items.map((it, idx) => {
      const productId = it.productId || it.product?._id || it.id || null;

      if (!productId || !mongoose.Types.ObjectId.isValid(String(productId))) {
        throw new Error(`Invalid productId at item index ${idx}`);
      }

      const qty = Math.max(1, Number(it.quantity) || 1);
      const price = Math.max(0, Number(it.price) || 0);

      return {
        productId,
        name: String(it.name || ""),
        image: String(it.image || ""),
        color: String(it.color || ""),
        price,
        quantity: qty,
        lineTotal: price * qty,
      };
    });

    // ✅ totals compute (always compute server-side)
    const computedSubtotal = cleanItems.reduce((s, it) => s + it.lineTotal, 0);

    // Base shipping rule (luxury)
    const computedShippingBase =
      computedSubtotal > 500000 ? 0 : computedSubtotal === 0 ? 0 : 5000;

    // ----------------------------
    // ✅ COUPON APPLY (optional)
    // ----------------------------
    let appliedCouponSnapshot = null;
    let discount = 0;
    let shippingDiscount = 0;

    if (coupon?.code) {
      const website = "luxury"; // ✅ luxury segment here (or derive from req.params if you use /api/:website/orders)

      // If you use allowedWebsites check in coupon controller:
      if (typeof allowedWebsites !== "undefined" && !allowedWebsites.includes(website)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Invalid website segment." });
      }

      const code = normalizeCode(coupon.code);

      // Find coupon (website OR all)
      const cpn = await Coupon.findOne({ code, website: { $in: [website, "all"] } }).session(session);
      if (!cpn) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Invalid coupon." });
      }

      const computedStatus = computeStatusByDates(cpn);

      if (cpn.status === "disabled") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Coupon is disabled." });
      }
      if (computedStatus === "expired") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Coupon expired." });
      }
      if (computedStatus === "scheduled") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Coupon not started yet." });
      }
      if (cpn.status === "draft") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Coupon is not active." });
      }

      // ✅ min order (based on subtotal ONLY)
      if (cpn.minOrder != null && computedSubtotal < Number(cpn.minOrder)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: `Minimum order is ₹${Number(cpn.minOrder).toLocaleString("en-IN")}.`,
        });
      }

      // ✅ total limit
      if (cpn.totalLimit != null && cpn.usedCount >= Number(cpn.totalLimit)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Coupon usage limit reached." });
      }

      // ✅ per user limit
      if (cpn.perUserLimit != null) {
        const usage = await CouponUsage.findOne({ couponId: cpn._id, userId: req.user.id }).session(session);
        const used = usage?.count || 0;
        if (used >= Number(cpn.perUserLimit)) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: "Per-user coupon limit reached." });
        }
      }

      // ✅ compute discounts using your existing function
      const breakdown = calcDiscount({
        coupon: cpn,
        cartTotal: computedSubtotal,
        shipping: computedShippingBase,
      });

      discount = Math.max(0, Number(breakdown?.discount || 0));
      shippingDiscount = Math.max(0, Number(breakdown?.shippingDiscount || 0));

      appliedCouponSnapshot = {
        couponId: cpn._id,
        code: cpn.code,
        type: cpn.type,
        value: cpn.value,
        maxDiscount: cpn.maxDiscount,
      };
    }

    // ✅ final shipping after coupon shippingDiscount
    const computedShipping = Math.max(0, computedShippingBase - shippingDiscount);

    // ✅ final total after discount
    const computedTotal = Math.max(0, computedSubtotal - discount) + computedShipping;

    // ✅ MIN PAYABLE validation (₹10)
    if (computedTotal > 0 && computedTotal < MIN_PAYABLE_TOTAL) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        success: false,
        message: `Minimum payable amount is ₹${MIN_PAYABLE_TOTAL}. Add more items or remove coupon.`,
      });
    }

    // ✅ Payment method & statuses
    const method = normalizeMethod(payment?.method);
    const paymentStatus = method === "cod" ? "unpaid" : "pending";
    const orderStatus = "placed";

    // ✅ create order (store coupon snapshot + computed amounts)
    const order = await LuxuryOrder.create(
      [
        {
          customerId: req.user.id,
          items: cleanItems,
          pricing: {
            subtotal: computedSubtotal,
            discount,
            shippingBase: computedShippingBase,
            shippingDiscount,
            shipping: computedShipping,
            total: computedTotal,
            currency: "INR",
            coupon: appliedCouponSnapshot, // ✅ store in order
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
            status: paymentStatus,
            transactionId: payment?.transactionId ? String(payment.transactionId) : "",
            meta:
              method === "upi"
                ? { upiId: payment?.upiId || "" }
                : method === "netbanking"
                ? { bank: payment?.bank || "" }
                : method === "card"
                ? { last4: payment?.last4 || "" }
                : {},
          },
          status: orderStatus,
        },
      ],
      { session }
    );

    const createdOrder = order[0];

    // ✅ update coupon usage + usedCount inside same transaction
    if (appliedCouponSnapshot?.couponId) {
      await Coupon.updateOne(
        { _id: appliedCouponSnapshot.couponId },
        { $inc: { usedCount: 1 } },
        { session }
      );

      await CouponUsage.updateOne(
        { couponId: appliedCouponSnapshot.couponId, userId: req.user.id },
        { $inc: { count: 1 }, $set: { lastUsedAt: new Date() } },
        { upsert: true, session }
      );
    }

    // ✅ update customer stats safely (atomic)
    // points: 1 point per 100 spent (based on PAYABLE total)
    const points = Math.floor(computedTotal / 100);

    const purchaseHistoryEntry = {
      productId: cleanItems?.[0]?.productId || null,
      productName: cleanItems?.[0]?.name || "Order",
      amount: computedTotal,
      date: new Date(),
      status: orderStatus,
      coupon: appliedCouponSnapshot?.code || "",
      discount,
    };

    await Customer.updateOne(
      { _id: req.user.id },
      {
        $push: {
          orders: createdOrder._id,
          purchaseHistory: purchaseHistoryEntry,
        },
        $inc: {
          totalOrders: 1,
          totalSpent: computedTotal,
          loyaltyPoints: points,
        },
      },
      { session }
    );

    // ✅ commit
    await session.commitTransaction();
    session.endSession();

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
    console.error("placeOrder error:", err);

    await session.abortTransaction();
    session.endSession();

    if (String(err?.message || "").startsWith("Invalid productId")) {
      return res.status(400).json({ success: false, message: err.message });
    }

    return res.status(500).json({ success: false, message: "Internal server error" });
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
