const mongoose = require("mongoose");

const LuxuryOrderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "luxury_customers",
      required: true,
      index: true,
    },

    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "LuxuryProduct",
          required: true,
          index: true,
        },
        name: { type: String, required: true, trim: true },
        image: { type: String, default: "" },
        color: { type: String, default: "" },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
        lineTotal: { type: Number, required: true, min: 0 },
      },
    ],

    pricing: {
      subtotal: { type: Number, required: true, min: 0 },
      shipping: { type: Number, required: true, min: 0 },
      total: { type: Number, required: true, min: 0 },
      currency: { type: String, default: "INR" },
    },

    shippingAddress: {
      label: { type: String, default: "Home" },
      firstName: { type: String, default: "" },
      lastName: { type: String, default: "" },
      email: { type: String, default: "" },
      phone: { type: String, default: "" },

      addressLine1: { type: String, required: true },
      addressLine2: { type: String, default: "" },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pincode: { type: String, required: true },
      country: { type: String, default: "India" },
    },

    payment: {
      method: {
        type: String,
        enum: ["card", "upi", "netbanking", "cod"],
        default: "cod",
      },
      status: {
        type: String,
        enum: ["pending", "paid", "unpaid", "failed", "refunded"],
        default: "pending",
      },
      transactionId: { type: String, default: "" },

      // ✅ extra info (optional)
      meta: {
        upiId: { type: String, default: "" },
        bank: { type: String, default: "" },
        cardLast4: { type: String, default: "" },
      },
    },

    status: {
      type: String,
      enum: [
        "pending_payment",
        "placed",
        "cancelled",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "returned",
      ],
      default: "placed",
      index: true,
    },
    website: { type: String, default: "luxury", index: true },
    orderNumber: { type: String, unique: true, index: true },

    // optional: notes/admin fields
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

// ✅ auto calculate totals (safety)
// This ensures lineTotal is correct even if client sends wrong value.
LuxuryOrderSchema.pre("validate", function (next) {
  try {
    if (Array.isArray(this.items)) {
      this.items = this.items.map((it) => {
        const price = Number(it.price) || 0;
        const qty = Math.max(1, Number(it.quantity) || 1);
        it.quantity = qty;
        it.lineTotal = price * qty;
        return it;
      });

      const subtotal = this.items.reduce((s, it) => s + (Number(it.lineTotal) || 0), 0);
      const shipping = Number(this.pricing?.shipping ?? 0) || 0;

      this.pricing = this.pricing || {};
      this.pricing.subtotal = subtotal;
      this.pricing.total = subtotal + shipping;
      if (!this.pricing.currency) this.pricing.currency = "INR";
    }
    next();
  } catch (e) {
    next(e);
  }
});

// ✅ better unique order number
LuxuryOrderSchema.pre("save", function (next) {
  if (!this.orderNumber) {
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    this.orderNumber = `LUX-${Date.now()}-${rand}`;
  }

  // ✅ align status with payment method (optional)
  if (this.payment?.method === "cod") {
    if (!this.payment.status || this.payment.status === "pending") this.payment.status = "unpaid";
    if (this.status === "pending_payment") this.status = "placed";
  } else {
    // non-cod default pending
    if (!this.payment.status) this.payment.status = "pending";
    // you can keep placed or pending_payment; your choice:
    // if (!this.status) this.status = "pending_payment";
  }

  next();
});

module.exports = mongoose.model("luxury_orders", LuxuryOrderSchema, "luxury_orders");
