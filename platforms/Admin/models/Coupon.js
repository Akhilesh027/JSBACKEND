const mongoose = require("mongoose");

const CouponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    // coupon belongs to which website segment (or all)
    website: {
      type: String,
      enum: ["affordable", "midrange", "luxury", "all"],
      required: true,
      default: "all",
      index: true,
    },

    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "private",
    },

    type: {
      type: String,
      enum: ["percentage", "flat", "free_shipping"],
      required: true,
    },

    value: {
      type: Number,
      required: true,
      default: 0,
    }, // percent or ₹, free_shipping => 0

    maxDiscount: {
      type: Number,
    }, // only for percentage

    minOrder: {
      type: Number,
    }, // ₹

    startAt: {
      type: Date,
      required: true,
    },

    endAt: {
      type: Date,
      required: true,
    },

    totalLimit: {
      type: Number,
    }, // overall usage

    perUserLimit: {
      type: Number,
    },

    usedCount: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["draft", "active", "scheduled", "expired", "disabled"],
      default: "draft",
      index: true,
    },

    // ✅ category application scope
    applyTo: {
      type: String,
      enum: ["all_categories", "selected_categories"],
      default: "all_categories",
    },

    // ✅ selected categories
    categories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
      },
    ],
  },
  { timestamps: true }
);

// ✅ unique per website + code
CouponSchema.index({ website: 1, code: 1 }, { unique: true });

// optional helpful indexes
CouponSchema.index({ applyTo: 1 });
CouponSchema.index({ categories: 1 });

module.exports = mongoose.model("Coupon", CouponSchema);