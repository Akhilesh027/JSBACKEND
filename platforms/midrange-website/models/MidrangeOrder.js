// models/MidrangeOrder.js
const mongoose = require("mongoose");

const midrangeOrderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },

    website: {
      type: String,
      enum: ["affordable", "mid_range", "luxury"],
      default: "mid_range",
      index: true,
    },

    items: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
        name: String,
        image: String,
        quantity: { type: Number, required: true, min: 1 },

        price: { type: Number, required: true },       // original
        discountPercent: { type: Number, default: 10 },
        discountAmount: { type: Number, default: 0 },
        finalPrice: { type: Number, required: true },  // discounted
      },
    ],

    addressSnapshot: {
      fullName: String,
      phone: String,
      line1: String,
      line2: String,
      landmark: String,
      city: String,
      state: String,
      pincode: String,
    },

    totals: {
      subtotal: Number,
      shipping: Number,
      tax: Number,
      total: Number,
    },

    payment: {
      method: { type: String, enum: ["COD", "UPI", "CARD"], default: "COD" },
      status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
      transactionId: String,
    },

    status: {
      type: String,
      enum: ["placed", "confirmed", "shipped", "delivered", "cancelled"],
      default: "placed",
      index: true,
    },
  },
  { timestamps: true }
);

midrangeOrderSchema.index({ userId: 1, website: 1, createdAt: -1 });

module.exports = mongoose.model("MidrangeOrder", midrangeOrderSchema);
