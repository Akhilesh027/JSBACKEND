// server/models/LuxuryCart.js
const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, default: "" },
    color: { type: String, default: "" },
    quantity: { type: Number, default: 1 },
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
