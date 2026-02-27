// ✅ Updated Product schema to support Parent Category + Sub Category (ID + slug/name)
// - Keeps your existing `category` and `subcategory` string fields (for easy filtering)
// - Adds `categoryId` and `subCategoryId` (ObjectId refs) for correct relations
// - Updates SKU generation prefix to use subcategory if present (better uniqueness)
// - Keeps your image rules (1 main + max 4 gallery)

const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    // ---------------- Manufacturer ----------------
    manufacturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Manufacturer",
      required: true,
      index: true,
    },

    name: { type: String, required: true, trim: true },

    category: { type: String, required: true, trim: true, index: true },
    subcategory: { type: String, trim: true, index: true },

    
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },
    subCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
      index: true,
    },

    sku: { type: String, unique: true, sparse: true, index: true, trim: true },

    shortDescription: { type: String, maxlength: 150, trim: true },
    description: { type: String, trim: true },

    // ---------------- Pricing & Stock ----------------
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, default: 0, min: 0 },
lowStockThreshold: { type: Number, default: 5 },

    availability: {
      type: String,
      enum: ["In Stock", "Low Stock", "Out of Stock"],
      default: "In Stock",
      index: true,
    },

    // ---------------- Admin Review ----------------
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    // ✅ Website tier (this is what you change while forwarding)
    tier: {
      type: String,
      enum: ["affordable", "mid_range", "luxury"],
      default: "mid_range",
      index: true,
    },

    forwardedToWebsite: { type: Boolean, default: false, index: true },
    forwardedAt: { type: Date },

    deliveryTime: { type: String, trim: true },

    // ---------------- Attributes ----------------
    color: String,
    material: String,
    size: String,
    weight: String,
    location: String,

    // ---------------- Images ----------------
    image: { type: String, required: true, trim: true },

    galleryImages: {
      type: [String],
      default: [],
      validate: [
        function (arr) {
          return Array.isArray(arr) && arr.length <= 4; // main + 4 = 5
        },
        "Max 5 images total (1 main + 4 gallery)",
      ],
    },
  },
  { timestamps: true }
);

/* --------------------------------------------------
   AUTO SKU GENERATION (ONLY IF NOT PROVIDED) + COLLISION SAFE
   ✅ prefix uses subcategory if present else category
-------------------------------------------------- */
productSchema.pre("save", async function (next) {
  try {
    if (this.sku) return next();

    const base =
      (this.subcategory || this.category || "PRD")
        .toString()
        .trim()
        .replace(/[^a-zA-Z0-9]/g, "");

    const prefix = (base.substring(0, 3) || "PRD").toUpperCase();

    // Try a few times to avoid rare SKU collision
    for (let i = 0; i < 5; i++) {
      const unique = Math.random().toString(36).substring(2, 8).toUpperCase();
      const candidate = `${prefix}-${unique}`;

      const exists = await mongoose.models.Product.exists({ sku: candidate });
      if (!exists) {
        this.sku = candidate;
        return next();
      }
    }

    // fallback (very rare)
    this.sku = `${prefix}-${Date.now().toString().slice(-6)}`;
    return next();
  } catch (err) {
    return next(err);
  }
});

/* --------------------------------------------------
   OPTIONAL: Guardrail — if subCategoryId exists, categoryId must exist
-------------------------------------------------- */
productSchema.pre("validate", function (next) {
  if (this.subCategoryId && !this.categoryId) {
    return next(new Error("categoryId is required when subCategoryId is provided"));
  }
  return next();
});

/* --------------------------------------------------
   INDEXES
-------------------------------------------------- */
productSchema.index({ manufacturer: 1, sku: 1 });
productSchema.index({ status: 1, createdAt: -1 });

// Helpful for catalogue filters
productSchema.index({ category: 1, subcategory: 1, createdAt: -1 });
productSchema.index({ categoryId: 1, subCategoryId: 1, createdAt: -1 });

module.exports = mongoose.model("Product", productSchema);
