const mongoose = require("mongoose");

const InteriorInquirySchema = new mongoose.Schema(
  {
    // Customer Contact
    name: {
      type: String,
      required: [true, "Customer name is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      default: "",
    },

    // Source Form Type
    formType: {
      type: String,
      enum: ["consultation", "experience_center_visit", "cost_estimator", "general_inquiry"],
      default: "consultation",
    },

    // Project Specifications
    bhk: {
      type: String,
      trim: true,
      default: "3 BHK",
    },
    plotMeasurements: {
      type: String,
      trim: true,
      default: "",
    },
    budgetEstimation: {
      type: String,
      trim: true,
      default: "",
    },
    city: {
      type: String,
      trim: true,
      default: "Hyderabad",
    },
    locality: {
      type: String,
      trim: true,
      default: "",
    },

    // Estimator specific details (if submitted via cost estimator)
    selectedTier: {
      type: String,
      trim: true,
      default: "",
    },
    selectedRooms: {
      type: [String],
      default: [],
    },
    calculatedEstimate: {
      type: Number,
      default: 0,
    },

    // Additional Notes
    notes: {
      type: String,
      trim: true,
      default: "",
    },

    // Lead Management & Admin Status
    status: {
      type: String,
      enum: ["new", "contacted", "in_discussion", "scheduled", "converted", "closed"],
      default: "new",
    },
    adminNotes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Add index on status and createdAt for fast queries
InteriorInquirySchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("InteriorInquiry", InteriorInquirySchema);
