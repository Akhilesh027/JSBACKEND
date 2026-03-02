// models/MidrangeOrder.js
// ✅ FULL UPDATED SCHEMA for COD + RAZORPAY + Coupons + Shipping Discount + Tax
// ✅ Matches the updated controller fields (totals + coupon snapshot + razorpay ids/signature)
// ✅ Adds status "pending_payment" for online flows (optional but safe)

const mongoose = require("mongoose");

const midrangeOrderSchema = new mongoose.Schema(
  {
    // -----------------------------
    // Core
    // -----------------------------
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    website: {
      type: String,
      enum: ["affordable", "mid_range", "luxury"],
      default: "mid_range",
      index: true,
    },

    // -----------------------------
    // Items
    // -----------------------------
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: { type: String, default: "" },
        image: { type: String, default: "" },

        quantity: { type: Number, required: true, min: 1 },

        price: { type: Number, required: true }, // original
        discountPercent: { type: Number, default: 10 },
        discountAmount: { type: Number, default: 0 },
        finalPrice: { type: Number, required: true }, // discounted
      },
    ],

    // -----------------------------
    // Address snapshot
    // -----------------------------
    addressSnapshot: {
      fullName: { type: String, default: "" },
      phone: { type: String, default: "" },
      line1: { type: String, default: "" },
      line2: { type: String, default: "" },
      landmark: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      pincode: { type: String, default: "" },
    },

    // -----------------------------
    // Totals (supports coupons + shipping discount)
    // -----------------------------
    totals: {
      // items total after your product-level discount (10%)
      subtotal: { type: Number, default: 0 },

      // coupon discount on subtotal
      discount: { type: Number, default: 0 },

      // shipping before coupon
      shippingBase: { type: Number, default: 0 },

      // shipping discount from coupon (free shipping etc.)
      shippingDiscount: { type: Number, default: 0 },

      // shipping after coupon
      shipping: { type: Number, default: 0 },

      // tax (GST)
      tax: { type: Number, default: 0 },

      // final total
      total: { type: Number, default: 0 },
    },

    // -----------------------------
    // Coupon snapshot (optional)
    // -----------------------------
    coupon: {
      couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", default: null },
      code: { type: String, default: "" },
      type: { type: String, enum: ["percentage", "flat", "free_shipping"], default: undefined },
      value: { type: Number, default: 0 },
      maxDiscount: { type: Number, default: undefined },
    },

    // -----------------------------
    // Payment
    // -----------------------------
    payment: {
      method: { type: String, enum: ["COD", "RAZORPAY", "CARD"], default: "COD" },
      status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },

      // optional for clarity
      gateway: { type: String, default: "" },

      // Razorpay proof fields (for RAZORPAY payments)
      razorpayOrderId: { type: String, default: "" },
      razorpayPaymentId: { type: String, default: "" },
      razorpaySignature: { type: String, default: "" },

      // generic transaction reference (optional)
      transactionId: { type: String, default: "" },
    },

    // -----------------------------
    // Order status
    // -----------------------------
    status: {
      type: String,
      enum: ["pending_payment", "placed", "confirmed", "shipped", "delivered", "cancelled"],
      default: "placed",
      index: true,
    },
  },
  { timestamps: true }
);

midrangeOrderSchema.index({ userId: 1, website: 1, createdAt: -1 });

module.exports = mongoose.model("MidrangeOrder", midrangeOrderSchema);