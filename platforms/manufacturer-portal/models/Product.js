const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  attributes: {
    size: { type: String, trim: true },
    color: { type: String, trim: true },
    fabric: { type: String, trim: true },
  },
  sku: { type: String, required: true, trim: true, uppercase: true },
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 5 },
  image: { type: String, trim: true },
});

const productSchema = new mongoose.Schema(
  {
    manufacturer: { type: mongoose.Schema.Types.ObjectId, ref: 'Manufacturer', required: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, index: true },
    subcategory: { type: String, trim: true, index: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    subCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    sku: { type: String, unique: true, sparse: true, index: true, trim: true, uppercase: true },
    shortDescription: { type: String, maxlength: 150, trim: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0, max: 100 },      // NEW: discount percentage
    quantity: { type: Number, default: 0, min: 0 },
      gst: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    isCustomized: {
    type: Boolean,
    default: false,
  },

    lowStockThreshold: { type: Number, default: 5 },
    availability: {
      type: String,
      enum: ['In Stock', 'Low Stock', 'Out of Stock'],
      default: 'In Stock',
      index: true,
    },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    tier: { type: String, enum: ['affordable', 'mid_range', 'luxury'], default: 'mid_range', index: true },
    forwardedToWebsite: { type: Boolean, default: false, index: true },
    forwardedAt: { type: Date },
    deliveryTime: { type: String, trim: true },

    color: { type: [String], default: [] },
    material: { type: String, trim: true },
    size: { type: [String], default: [] },
    weight: { type: String, trim: true },
    location: { type: String, trim: true },

    fabricTypes: { type: [String], default: [] },
    extraPillows: { type: Number, default: 0, min: 0 },

    image: { type: String, required: true, trim: true },
    galleryImages: {
      type: [String],
      default: [],
      validate: [
        function (arr) {
          return Array.isArray(arr) && arr.length <= 4;
        },
        'Max 5 images total (1 main + 4 gallery)',
      ],
    },

    hasVariants: { type: Boolean, default: false, index: true },
    variants: [variantSchema],
  },
  { timestamps: true }
);


// Auto SKU generation (only for simple products; variants have their own SKUs)
productSchema.pre('save', async function (next) {
  try {
    // For variant products, we don't auto‑generate the main SKU if not provided
    if (this.hasVariants) return next();
    if (this.sku) return next();

    const base = (this.subcategory || this.category || 'PRD')
      .toString()
      .trim()
      .replace(/[^a-zA-Z0-9]/g, '');
    const prefix = (base.substring(0, 3) || 'PRD').toUpperCase();
    for (let i = 0; i < 5; i++) {
      const unique = Math.random().toString(36).substring(2, 8).toUpperCase();
      const candidate = `${prefix}-${unique}`;
      const exists = await mongoose.models.Product.exists({ sku: candidate });
      if (!exists) {
        this.sku = candidate;
        return next();
      }
    }
    this.sku = `${prefix}-${Date.now().toString().slice(-6)}`;
    return next();
  } catch (err) {
    return next(err);
  }
});

// Guardrail (unchanged)
productSchema.pre('validate', function (next) {
  if (this.subCategoryId && !this.categoryId) {
    return next(new Error('categoryId is required when subCategoryId is provided'));
  }
  return next();
});

// Indexes (unchanged)
productSchema.index({ manufacturer: 1, sku: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ category: 1, subcategory: 1, createdAt: -1 });
productSchema.index({ categoryId: 1, subCategoryId: 1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);