const mongoose = require("mongoose");

const EstimateSchema = new mongoose.Schema(
  {
    // Step 1 – Basic info
    floorplan: { type: String, required: true },
    purpose: { type: String, required: true },
    propertyType: { type: String, required: true },

    // ========== INTERIOR SERVICES (new) ==========
    kitchen: { type: Number, default: 0 },
    wardrobes: { type: Number, default: 0 },
    falseCeiling: { type: Number, default: 0 },
    electricalWorks: { type: Number, default: 0 },
    painting: { type: Number, default: 0 },
    curtainsBlinds: { type: Number, default: 0 },
    wallPanelling: { type: Number, default: 0 },
    glassPartitions: { type: Number, default: 0 },
    lighting: { type: Number, default: 0 },

    // ========== FURNITURE ITEMS ==========
    tvUnit: { type: Number, default: 0 },
    sofaSet: { type: Number, default: 0 },
    beds: { type: Number, default: 0 },
    diningTable: { type: Number, default: 0 },
    centerTable: { type: Number, default: 0 },
    crockeryUnit: { type: Number, default: 0 },
    foyerConsole: { type: Number, default: 0 },
    vanityUnit: { type: Number, default: 0 },
    studyUnit: { type: Number, default: 0 },
    outdoorFurniture: { type: Number, default: 0 },

    // Step 3 – Floorplan details
    plotSize: { type: String, default: "" },
    planFileUrl: { type: String, default: "" },
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