const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1 },
price: { type: Number, required: true },       // original
        discountPercent: { type: Number, default: 10 },
        discountAmount: { type: Number, default: 0 },
        finalPrice: { type: Number, required: true },  // discounted
    // Snapshot for safe history (even if product changes later)
    productSnapshot: {
      name: String,
      price: Number,
      image: String,
      category: String,
      inStock: Boolean,
      colors: [String],
      originalPrice: Number,
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    addressId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AffordableAddress",
      required: true,
    },

    items: { type: [orderItemSchema], required: true },

    pricing: {
      subtotal: { type: Number, required: true },
      discount: { type: Number, default: 0 },
      shippingCost: { type: Number, default: 0 },
      total: { type: Number, required: true },
    },

    payment: {
      method: { type: String, enum: ["cod", "upi", "card"], required: true },
      upiId: { type: String, default: "" },
      cardLast4: { type: String, default: "" },
      status: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    },
    website: { type: String, default: "affordable" },
   status: {
  type: String,
  enum: [
    "placed",     // order created by customer
    "approved",   // admin approved
    "confirmed",  // seller/manufacturer confirmed
    "shipped",    // dispatched
    "delivered",  // delivered to customer
    "cancelled"   // cancelled at any stage before delivery
  ],
  default: "placed",
},
statusHistory: [
  {
    status: {
      type: String,
      enum: [
        "placed",
        "approved",
        "confirmed",
        "shipped",
        "delivered",
        "cancelled",
      ],
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // admin
    },
  },
],

  },
  { timestamps: true }
);

module.exports = mongoose.model("AffordableOrder", orderSchema);
