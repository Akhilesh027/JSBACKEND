// models/LegalPage.js
const mongoose = require("mongoose");

const LEGAL_WEBSITES = ["affordable", "midrange", "luxury"];
const PAGE_TYPES = [
  "privacy_policy",
  "terms_conditions",
  "refund_policy",
  "shipping_policy",
  "about",
  "contact",
];
const PAGE_STATUS = ["draft", "published"];

const legalPageSchema = new mongoose.Schema(
  {
    website: {
      type: String,
      enum: LEGAL_WEBSITES,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: PAGE_TYPES,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: PAGE_STATUS,
      default: "draft",
    },
  },
  {
    timestamps: true,
  }
);

// one slug per website
legalPageSchema.index({ website: 1, slug: 1 }, { unique: true });

// optional: one page type per website
legalPageSchema.index({ website: 1, type: 1 }, { unique: true });

module.exports = mongoose.model("LegalPage", legalPageSchema);