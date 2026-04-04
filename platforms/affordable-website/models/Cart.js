const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true }, // unique per item
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    attributes: {
      size: { type: String, default: null },
      color: { type: String, default: null },
      fabric: { type: String, default: null },
    },
    // snapshot to show cart even if product changes later
    productSnapshot: {
      name: { type: String },
      price: { type: Number },                 // final discounted price (after product discount)
      originalPrice: { type: Number },
      discount: { type: Number, default: 0 },  // product discount percentage
      gst: { type: Number, default: 0 },       // GST percentage
      isCustomized: { type: Boolean, default: false },
      finalPrice: { type: Number },            // same as price, kept for clarity
      image: { type: String },
      category: { type: String },
      inStock: { type: Boolean, default: true },
      colors: [{ type: String }],
      sizes: [{ type: String }],
      fabrics: [{ type: String }],
    },
  },
  { _id: false }
);

const CartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
      required: true,
    },
    items: { type: [CartItemSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cart", CartSchema);