const mongoose = require("mongoose");

const EstimateSchema = new mongoose.Schema(
  {
    floorplan: { type: String, required: true },
    purpose: { type: String, required: true },
    propertyType: { type: String, required: true },

    kitchen: { type: Boolean, default: true },
    wardrobe: { type: Number, default: 0 },
    tvUnit: { type: Number, default: 0 },

    plotSize: { type: String, default: "" },
    floorplanPdfUrl: { type: String, default: "" },
    floorplanImageUrls: { type: [String], default: [] },

    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    whatsappUpdates: { type: Boolean, default: true },
    city: { type: String, default: "" },

    // ✅ New fields for admin pricing
    estimatedAmount: { type: Number, min: 0 },
    totalAmount: { type: Number, min: 0 },

    status: { type: String, enum: ["draft", "submitted"], default: "draft" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Estimate", EstimateSchema);