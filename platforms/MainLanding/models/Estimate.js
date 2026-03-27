const mongoose = require("mongoose");

const EstimateSchema = new mongoose.Schema(
  {
    floorplan: { type: String, required: true },
    purpose: { type: String, required: true },
    propertyType: { type: String, required: true },

    // Step 2 – Furniture items
    kitchen: { type: Boolean, default: true },
    wardrobe: { type: Number, default: 0 },
    tvUnit: { type: Number, default: 0 },
    // New furniture items (quantities)
    sofaSet: { type: Number, default: 0 },
    beds: { type: Number, default: 0 },
    centerTables: { type: Number, default: 0 },
    crockeryUnit: { type: Number, default: 0 },
    diningTableSet: { type: Number, default: 0 },
    foyers: { type: Number, default: 0 },
    vanityUnit: { type: Number, default: 0 },
    studyUnit: { type: Number, default: 0 },
    outdoorFurniture: { type: Number, default: 0 },

    // Step 3 – Floorplan details
    plotSize: { type: String, default: "" },
    floorplanPdfUrl: { type: String, default: "" },
    floorplanImageUrls: { type: [String], default: [] },

    // Step 4 – Contact & submission
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    whatsappUpdates: { type: Boolean, default: true },
    city: { type: String, default: "" },

    // Admin pricing
    estimatedAmount: { type: Number, min: 0 },
    totalAmount: { type: Number, min: 0 },

    status: { type: String, enum: ["draft", "submitted"], default: "draft" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Estimate", EstimateSchema);