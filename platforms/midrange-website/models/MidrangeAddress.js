// models/MidrangeAddress.js
const mongoose = require("mongoose");

const midrangeAddressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true, index: true },

    website: {
      type: String,
      enum: ["affordable", "mid_range", "luxury"],
      default: "mid_range",
      index: true,
    },

    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },

    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    landmark: { type: String, trim: true },

    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },

    isDefault: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

midrangeAddressSchema.index({ userId: 1, website: 1, isDefault: -1, createdAt: -1 });

module.exports = mongoose.model("MidrangeAddress", midrangeAddressSchema);
