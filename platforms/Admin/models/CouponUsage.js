// models/CouponUsage.js
const mongoose = require("mongoose");

const CouponUsageSchema = new mongoose.Schema(
  {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

CouponUsageSchema.index({ couponId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("CouponUsage", CouponUsageSchema);
