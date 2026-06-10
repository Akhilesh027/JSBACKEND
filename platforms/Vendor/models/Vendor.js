const mongoose = require("mongoose");
const portfolioSchema = new mongoose.Schema({
  videos: [{
    title: { type: String, required: true },
    url: { type: String, required: true }, // can be YouTube embed URL or file path
    uploadedAt: { type: Date, default: Date.now }
  }],
  images: [{
    title: { type: String, default: "Portfolio Image" },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now }
  }],
  testimonials: [{
    name: { type: String, required: true },
    role: { type: String, required: true },
    review: { type: String, required: true }
  }],
  stats: {
    projectsDelivered: { type: String, default: "120+" },
    yearsExperience: { type: String, default: "10+" },
    partners: { type: String, default: "25+" },
    satisfaction: { type: String, default: "100%" }
  }
}, { _id: false });

const vendorSchema = new mongoose.Schema(
  {
    vendorName: { type: String, required: true },
    businessName: { type: String, required: true },
    gstNo: { type: String, default: "" },
    businessType: { type: String, default: "" },
    email: { type: String, required: true, unique: true, lowercase: true },
phone: {
  type: String,
  required: true,
  unique: true,
  sparse: true
},
    password: { type: String, required: true }, // hashed
    location: { type: String, required: true },
    yearsExp: { type: Number, default: 0 },
    category: { type: String, required: true },
    servicesOffered: { type: String, default: "" },
    projectsCompleted: { type: Number, default: 0 },
    projectNames: { type: String, default: "" },
    previousWork: { type: String, default: "" },
    professionalExpertise: { type: String, default: "" },
    businessDesc: { type: String, required: true },
    portfolioFiles: [{ type: String }], // file paths or URLs
    productImages: [{ type: String }],
 portfolio: {
    type: portfolioSchema,
    default: () => ({})
  },

    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Vendor", vendorSchema);