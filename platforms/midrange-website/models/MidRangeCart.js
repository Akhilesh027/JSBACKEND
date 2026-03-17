const mongoose = require("mongoose");

const midRangeCartItemSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    attributes: {
      size: { type: String, default: null },
      color: { type: String, default: null },
      fabric: { type: String, default: null },
    },
  },
  { _id: false }
);

const midRangeCartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "midrange_customers",
      required: true,
      unique: true,
      index: true,
    },
    tier: {
      type: String,
      enum: ["mid_range"],
      default: "mid_range",
      immutable: true,
      index: true,
    },
    items: {
      type: [midRangeCartItemSchema],
      default: [],
    },
  },
  { timestamps: true }
);

midRangeCartSchema.index({ userId: 1, tier: 1 });

module.exports = mongoose.model("MidRangeCart", midRangeCartSchema);