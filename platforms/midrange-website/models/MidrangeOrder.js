// models/MidrangeOrder.js
const mongoose = require("mongoose");

const statusHistoryEntrySchema = new mongoose.Schema({
  status: { type: String, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  changedAt: { type: Date, default: Date.now },
  note: { type: String, default: "" },
}, { _id: false });

const midrangeOrderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    website: {
      type: String,
      enum: ["affordable", "midrange", "luxury", "mid_range"],
      default: "midrange",
      index: true,
    },

    items: [{
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
      variantId: { type: mongoose.Schema.Types.ObjectId, ref: "Product.variants", default: null }, // NEW
      attributes: {                                                               // NEW
        size: { type: String, default: null },
        color: { type: String, default: null },
        fabric: { type: String, default: null },
      },
      name: { type: String, default: "" },
      image: { type: String, default: "" },
      quantity: { type: Number, required: true, min: 1 },
      price: { type: Number, required: true },
      discountPercent: { type: Number, default: 10 },
      discountAmount: { type: Number, default: 0 },
      finalPrice: { type: Number, required: true },
    }],

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

    totals: {
      subtotal: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      shippingBase: { type: Number, default: 0 },
      shippingDiscount: { type: Number, default: 0 },
      shipping: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
    },

    coupon: {
      couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", default: null },
      code: { type: String, default: "" },
      type: { type: String, enum: ["percentage", "flat", "free_shipping"] },
      value: { type: Number, default: 0 },
      maxDiscount: { type: Number },
    },

    payment: {
      method: { type: String, enum: ["COD", "RAZORPAY", "CARD"], default: "COD" },
      status: { type: String, enum: ["pending", "paid", "failed", "unpaid"], default: "pending" },
      gateway: { type: String, default: "" },
      razorpayOrderId: { type: String, default: "" },
      razorpayPaymentId: { type: String, default: "" },
      razorpaySignature: { type: String, default: "" },
      transactionId: { type: String, default: "" },
    },

    status: {
      type: String,
      enum: [
        "pending_payment", "placed", "approved", "confirmed",
        "shipped", "intransit", "delivered", "assemble",
        "cancelled", "rejected", "processing", "returned"
      ],
      default: "placed",
      index: true,
    },

    rejectionReason: { type: String, default: "" },
    cancelReason: { type: String, default: "" },

    statusHistory: [statusHistoryEntrySchema],

    // Timestamps for each status change
    approvedAt: Date,
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    confirmedAt: Date,
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    shippedAt: Date,
    shippedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    inTransitAt: Date,
    inTransitBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deliveredAt: Date,
    deliveredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    assembledAt: Date,
    assembledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    rejectedAt: Date,
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

midrangeOrderSchema.index({ userId: 1, website: 1, createdAt: -1 });

module.exports = mongoose.model("MidrangeOrder", midrangeOrderSchema);