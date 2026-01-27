// models/MidRangeCart.js
const mongoose = require("mongoose");

const midRangeCartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
  },
  { _id: false }
);

const midRangeCartSchema = new mongoose.Schema(
  {
    // ✅ user owning this cart
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "midrange_customers", // change if your user model name differs
      required: true,
      unique: true,
      index: true,
    },

    // ✅ fixed tier (important)
    tier: {
      type: String,
      enum: ["mid_range"],
      default: "mid_range",
      immutable: true,
      index: true,
    },

    // ✅ cart items
    items: {
      type: [midRangeCartItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Helpful compound index
midRangeCartSchema.index({ userId: 1, tier: 1 });

module.exports = mongoose.model("MidRangeCart", midRangeCartSchema);
