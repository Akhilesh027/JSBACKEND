const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, default: "" },

    addressLine1: { type: String, required: true },
    addressLine2: { type: String, default: "" },

    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },

    landmark: { type: String, default: "" },

    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AffordableAddress", addressSchema);
