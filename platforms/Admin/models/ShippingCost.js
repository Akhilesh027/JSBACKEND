// models/ShippingCost.js
const mongoose = require("mongoose");

const SHIPPING_WEBSITES = ["all", "affordable", "midrange", "luxury"];

const shippingCostSchema = new mongoose.Schema(
  {
    website: {
      type: String,
      enum: SHIPPING_WEBSITES,
      required: true,
      default: "all",
      trim: true,
      lowercase: true,
    },

    city: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    // optional
    pincode: {
      type: String,
      default: "",
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// useful indexes
shippingCostSchema.index({ website: 1, city: 1, pincode: 1 });
shippingCostSchema.index({ city: 1, pincode: 1 });

module.exports = mongoose.model("ShippingCost", shippingCostSchema);
