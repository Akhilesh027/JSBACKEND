// server/src/modules/categories/category.model.js
const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },

    segment: {
      type: String,
      enum: ["all", "affordable", "midrange", "luxury"],
      default: "all",
      index: true,
    },

    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },

    description: { type: String, default: "" },
    imageUrl: { type: String, default: "" },

    status: {
      type: String,
      enum: ["active", "hidden", "disabled"],
      default: "active",
      index: true,
    },

    order: { type: Number, default: 0, index: true },

    showOnWebsite: { type: Boolean, default: true },
    showInNavbar: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    allowProducts: { type: Boolean, default: true },

    seoTitle: { type: String, default: "" },
    seoDescription: { type: String, default: "" },
    seoKeywords: { type: String, default: "" },

    // optional cached count (keep in sync later)
    productCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// unique per segment
CategorySchema.index({ segment: 1, slug: 1 }, { unique: true });
CategorySchema.index({ parentId: 1, segment: 1 });

module.exports = mongoose.model("Category", CategorySchema);
