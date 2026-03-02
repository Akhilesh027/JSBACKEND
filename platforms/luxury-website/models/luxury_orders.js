// models/luxury_orders.js
const mongoose = require("mongoose");

const LuxuryOrderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "luxury_customers",
      required: true,
      index: true,
    },

    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "LuxuryProduct",
          required: true,
          index: true,
        },
        name: { type: String, required: true, trim: true },
        image: { type: String, default: "" },
        color: { type: String, default: "" },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
        lineTotal: { type: Number, required: true, min: 0 },
      },
    ],

    // ✅ expanded pricing to match your controller fields
    pricing: {
      subtotal: { type: Number, required: true, min: 0 },
      discount: { type: Number, default: 0, min: 0 },
      shippingBase: { type: Number, default: 0, min: 0 },
      shippingDiscount: { type: Number, default: 0, min: 0 },
      shipping: { type: Number, required: true, min: 0 },
      total: { type: Number, required: true, min: 0 },
      currency: { type: String, default: "INR" },

      // ✅ store coupon snapshot inside pricing (your controller already does this)
      coupon: {
        couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
        code: { type: String, default: "" },
        type: { type: String, default: "" },
        value: { type: Number, default: 0 },
        maxDiscount: { type: Number, default: 0 },
      },
    },

    shippingAddress: {
      label: { type: String, default: "Home" },
      firstName: { type: String, default: "" },
      lastName: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },

      addressLine1: { type: String, required: true },
      addressLine2: { type: String, default: "" },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      country: { type: String, default: "India" },
    },

    payment: {
      // ✅ include razorpay
      method: {
        type: String,
        enum: ["card", "upi", "netbanking", "cod", "razorpay"],
        default: "cod",
      },
      status: {
        type: String,
        enum: ["pending", "paid", "unpaid", "failed", "refunded"],
        default: "pending",
      },

      gateway: { type: String, default: "" }, // "razorpay"
      transactionId: { type: String, default: "" },

      // ✅ Razorpay fields (store proof)
      razorpayOrderId: { type: String, default: "" },
      razorpayPaymentId: { type: String, default: "" },
      razorpaySignature: { type: String, default: "" },

      meta: {
        upiId: { type: String, default: "" },
        bank: { type: String, default: "" },
        cardLast4: { type: String, default: "" },
      },
    },

    status: {
      type: String,
      enum: [
        "pending_payment",
        "placed",
        "cancelled",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "returned",
      ],
      default: "placed",
      index: true,
    },

    website: { type: String, default: "luxury", index: true },
    orderNumber: { type: String, unique: true, index: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

// ✅ recalc line totals + pricing safety (but DO NOT overwrite discounts)
LuxuryOrderSchema.pre("validate", function (next) {
  try {
    if (Array.isArray(this.items)) {
      this.items = this.items.map((it) => {
        const price = Number(it.price) || 0;
        const qty = Math.max(1, Number(it.quantity) || 1);
        it.quantity = qty;
        it.lineTotal = price * qty;
        return it;
      });

      const subtotal = this.items.reduce((s, it) => s + (Number(it.lineTotal) || 0), 0);

      this.pricing = this.pricing || {};
      this.pricing.subtotal = subtotal;

      // keep shipping already computed by controller
      const shipping = Number(this.pricing.shipping ?? 0) || 0;
      const discount = Number(this.pricing.discount ?? 0) || 0;

      // ✅ total = subtotal - discount + shipping (clamped)
      const total = Math.max(0, subtotal - Math.max(0, discount) + Math.max(0, shipping));
      this.pricing.total = total;

      if (!this.pricing.currency) this.pricing.currency = "INR";
    }
    next();
  } catch (e) {
    next(e);
  }
});

LuxuryOrderSchema.pre("save", function (next) {
  if (!this.orderNumber) {
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    this.orderNumber = `LUX-${Date.now()}-${rand}`;
  }

  // ✅ align COD statuses
  if (this.payment?.method === "cod") {
    if (!this.payment.status || this.payment.status === "pending") this.payment.status = "unpaid";
    if (this.status === "pending_payment") this.status = "placed";
  }

  next();
});

LuxuryOrderSchema.index({ customerId: 1, website: 1, createdAt: -1 });

module.exports = mongoose.model("luxury_orders", LuxuryOrderSchema, "luxury_orders");