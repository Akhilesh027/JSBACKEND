const mongoose = require("mongoose");

const VendorOrderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },

    // snapshot fields (so order doesn’t change if product changes later)
    name: { type: String, required: true },
    sku: { type: String, default: "" },
    image: { type: String, default: "" },
    tier: { type: String, default: "" },
    category: { type: String, default: "" },
    subcategory: { type: String, default: "" },
    material: { type: String, default: "" },
    color: { type: String, default: "" },
    size: { type: String, default: "" },

    unitPrice: { type: Number, required: true }, // price at time of order
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true }, // unitPrice * quantity
  },
  { _id: false }
);

const VendorOrderAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String, default: "" },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
  },
  { _id: false }
);

const VendorOrderSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },

    orderNumber: { type: String, unique: true, index: true }, // ex: VOR-2026-000001
    status: {
      type: String,
      enum: ["pending", "reviewing", "confirmed", "rejected", "processing", "shipped", "delivered", "cancelled","approved"],
      default: "pending",
      index: true,
    },

    items: { type: [VendorOrderItemSchema], default: [] },

    shippingAddress: { type: VendorOrderAddressSchema, required: true },

    pricing: {
      subtotal: { type: Number, required: true },
      gstRate: { type: Number, default: 0.18 },
      gstAmount: { type: Number, required: true },
      total: { type: Number, required: true },
    },

    note: { type: String, default: "" }, // vendor note to admin (optional)

    meta: {
      forwardedToAdmin: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// Generate orderNumber on create
VendorOrderSchema.pre("save", async function (next) {
  if (this.orderNumber) return next();
  // Simple unique string (safe enough); if you want sequential, use counter collection
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  const date = new Date();
  const yyyy = date.getFullYear();
  this.orderNumber = `VOR-${yyyy}-${rand}`;
  next();
});

module.exports = mongoose.model("VendorOrder", VendorOrderSchema);
