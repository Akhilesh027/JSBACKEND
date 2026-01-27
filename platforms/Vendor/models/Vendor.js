const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },
    legalName: { type: String, required: true, trim: true },
password: { type: String, required: true },
    companyType: { type: String, required: true, trim: true },
    telephone: { type: String, default: "", trim: true },
    mobile: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },

    country: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },

    businessNature: { type: String, required: true, trim: true },
    estYear: { type: Number, required: true },

    relation: { type: String, required: true, trim: true },
    employees: { type: String, required: true, trim: true },

    pan: { type: String, required: true, trim: true, uppercase: true },
    gst: { type: String, required: true, trim: true, uppercase: true },

    items: { type: String, required: true, trim: true },

    legalDisputes: { type: String, required: true, trim: true },
    exportCountries: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },

    documentUrl: { type: String, default: "" },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

vendorSchema.index({ email: 1 }, { unique: true });
vendorSchema.index({ mobile: 1 }, { unique: true });

module.exports = mongoose.model("Vendor", vendorSchema);
