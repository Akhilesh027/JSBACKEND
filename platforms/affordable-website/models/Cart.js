const mongoose = require("mongoose");

const CartItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1, default: 1 },

    // snapshot to show cart even if product changes later
    productSnapshot: {
      name: { type: String },
      price: { type: Number },
      originalPrice: { type: Number },
      image: { type: String },
      category: { type: String },
      inStock: { type: Boolean, default: true },
      colors: [{ type: String }],
    },
  },
  { _id: false }
);

const CartSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },
    items: { type: [CartItemSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cart", CartSchema);
