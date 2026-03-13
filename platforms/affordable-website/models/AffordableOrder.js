// models/AffordableOrder.js
// ✅ UPDATED FULL MODEL:
// - Adds coupon snapshot + shippingDiscount (your controller already uses it)
// - Adds payment.gateway fields (optional) for Razorpay future use
// - Adds statusHistory default push hook on create
// - Adds indexes for fast queries

const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },

    // ✅ pricing snapshot per item (optional but consistent with your other tiers)
    price: { type: Number, required: true }, // original
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    finalPrice: { type: Number, required: true }, // discounted

    // ✅ Snapshot for safe history
    productSnapshot: {
      name: String,
      price: Number,
      image: String,
      category: String,
      inStock: Boolean,
      colors: [String],
      originalPrice: Number,
    },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["placed", "approved", "confirmed", "shipped", "delivered", "cancelled","intransit","assemble"],
      required: true,
    },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // admin (optional)
    note: { type: String, default: "" }, // optional
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    addressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AffordableAddress",
      required: true,
    },

    website: { type: String, enum: ["affordable"], default: "affordable", index: true },

    items: { type: [orderItemSchema], required: true },

    // ✅ coupon snapshot (controller stores this)
    coupon: {
      couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
      code: String,
      type: { type: String, enum: ["flat", "percentage", "free_shipping"] },
      value: Number,
      maxDiscount: Number,
    },

    pricing: {
      subtotal: { type: Number, required: true },
      discount: { type: Number, default: 0 },
      shippingCost: { type: Number, default: 0 },
      shippingDiscount: { type: Number, default: 0 }, // ✅ MISSING before
      total: { type: Number, required: true },
    },

    payment: {
      method: { type: String, enum: ["cod", "razorpay", "card"], required: true },
      status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },

      // optional extra
      upiId: { type: String, default: "" },
      cardLast4: { type: String, default: "" },

      // Razorpay optional fields (future-proof)
      razorpayOrderId: { type: String, default: "" },
      razorpayPaymentId: { type: String, default: "" },
      razorpaySignature: { type: String, default: "" },
    },

    status: {
      type: String,
      default: "placed",
      default: "placed",
      enum: ["placed", "approved", "confirmed", "shipped", "delivered", "cancelled","intransit","assemble"],
      default: "placed",
      index: true,
    },

    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  { timestamps: true }
);

// ✅ indexes
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

// ✅ ensure statusHistory has "placed" on create
orderSchema.pre("save", function (next) {
  if (this.isNew && (!this.statusHistory || this.statusHistory.length === 0)) {
    this.statusHistory = [
      { status: this.status || "placed", changedAt: new Date(), note: "Order created" },
    ];
  }
  next();
});

module.exports = mongoose.model("AffordableOrder", orderSchema);