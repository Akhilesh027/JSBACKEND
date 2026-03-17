// models/LuxuryCart.js
const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true }, // unique per line item
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, default: null },
    attributes: {
      size: { type: String, default: null },
      color: { type: String, default: null },
      fabric: { type: String, default: null },
    },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, default: "" },
    quantity: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const LuxuryCartSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "luxury_customers", unique: true, required: true },
    items: [CartItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("LuxuryCart", LuxuryCartSchema);