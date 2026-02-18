const mongoose = require("mongoose");

const VendorAddressSchema = new mongoose.Schema(
  {
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },

    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },

    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, trim: true },

    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },

    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("VendorAddress", VendorAddressSchema);
