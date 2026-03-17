// models/AffordableOrder.js
const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Product.variants", default: null }, // NEW
    quantity: { type: Number, required: true, min: 1 },

    // pricing snapshot per item
    price: { type: Number, required: true }, // original
    discountPercent: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    finalPrice: { type: Number, required: true }, // discounted

    // NEW: selected variant attributes at time of order
    attributes: {
      size: { type: String, default: null },
      color: { type: String, default: null },
      fabric: { type: String, default: null },
    },

    // Snapshot for safe history
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
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    addressId: { type: mongoose.Schema.Types.ObjectId, ref: "AffordableAddress", required: true },
    website: { type: String, enum: ["affordable"], default: "affordable", index: true },
    items: { type: [orderItemSchema], required: true },

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
      shippingDiscount: { type: Number, default: 0 },
      total: { type: Number, required: true },
    },

    payment: {
      method: { type: String, enum: ["cod", "razorpay", "card"], required: true },
      status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
      upiId: { type: String, default: "" },
      cardLast4: { type: String, default: "" },
      razorpayOrderId: { type: String, default: "" },
      razorpayPaymentId: { type: String, default: "" },
      razorpaySignature: { type: String, default: "" },
    },

    status: {
      type: String,
      enum: ["placed", "approved", "confirmed", "shipped", "delivered", "cancelled","intransit","assemble"],
      default: "placed",
      index: true,
    },

    statusHistory: { type: [statusHistorySchema], default: [] },
  },
  { timestamps: true }
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

orderSchema.pre("save", function (next) {
  if (this.isNew && (!this.statusHistory || this.statusHistory.length === 0)) {
    this.statusHistory = [
      { status: this.status || "placed", changedAt: new Date(), note: "Order created" },
    ];
  }
  next();
});

module.exports = mongoose.model("AffordableOrder", orderSchema);