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

    // ---------------- Core Info ----------------
    name: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    sku: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
    },

    shortDescription: {
      type: String,
      maxlength: 150,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    // ---------------- Pricing & Stock ----------------
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    quantity: {
      type: Number,
      default: 0,
      min: 0,
    },

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

    // ✅ Optional: to know it’s already forwarded to website
    forwardedToWebsite: {
      type: Boolean,
      default: false,
      index: true,
    },
    forwardedAt: {
      type: Date,
    },

    deliveryTime: {
      type: String,
      trim: true,
    },

    // ---------------- Attributes ----------------
    color: String,
    material: String,
    size: String,
    weight: String,
    location: String,

    // ---------------- Images ----------------
    // ✅ main image
    image: {
      type: String,
      required: true,
      trim: true,
    },

    // ✅ remaining images (max 4), total max 5 including main
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
-------------------------------------------------- */
productSchema.pre("save", async function (next) {
  try {
    if (this.sku) return next();

    const prefix = this.category
      ? this.category.substring(0, 3).toUpperCase()
      : "PRD";

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
   INDEXES
-------------------------------------------------- */
productSchema.index({ manufacturer: 1, sku: 1 });
productSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Product", productSchema);
