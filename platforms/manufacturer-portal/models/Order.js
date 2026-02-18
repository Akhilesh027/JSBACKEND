const mongoose = require("mongoose");

const orderss = new mongoose.Schema(
  {
    manufacturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Manufacturer",
      required: true,
    },
    name: { type: String, required: true },
    category: { type: String, required: true },
    sku: { type: String, unique: true, sparse: true },
    description: { type: String },
    price: { type: Number, required: true },
    quantity: { type: Number, default: 0 },
    availability: { 
      type: String, 
      enum: ["In Stock", "Out of Stock", "Low Stock"], 
      default: "In Stock" 
    },
    color: { type: String },
    material: { type: String },
    size: { type: String },
    weight: { type: String },
    location: { type: String },
    image: { type: String },
    galleryImages: [{ type: String }],
  },
  { timestamps: true }
);

// Index for faster queries
orderss.index({ manufacturer: 1, sku: 1 });

module.exports = mongoose.model("order", orderss);