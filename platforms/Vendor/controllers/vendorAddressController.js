const VendorAddress = require("../models/VendorAddress.js");

const getVendorId = (req) => req.user?.id || req.vendor?._id || req.vendorId;

exports.getAddresses = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    if (!vendorId) return res.status(401).json({ message: "Unauthorized" });

    const addresses = await VendorAddress.find({ vendor: vendorId }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    res.json({ success: true, addresses });
  } catch (e) {
    console.error("getAddresses error:", e);
    res.status(500).json({ success: false, message: "Failed to fetch addresses" });
  }
};

exports.addAddress = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    if (!vendorId) return res.status(401).json({ message: "Unauthorized" });

    const {
      fullName,
      phone,
      addressLine1,
      addressLine2,
      city,
      state,
      pincode,
      isDefault = false,
    } = req.body;

    if (!fullName || !phone || !addressLine1 || !city || !state || !pincode) {
      return res.status(400).json({ message: "All required fields missing" });
    }

    // if setting new default -> unset old defaults
    if (isDefault) {
      await VendorAddress.updateMany({ vendor: vendorId }, { $set: { isDefault: false } });
    }

    const address = await VendorAddress.create({
      vendor: vendorId,
      fullName,
      phone,
      addressLine1,
      addressLine2: addressLine2 || "",
      city,
      state,
      pincode,
      isDefault: !!isDefault,
    });

    res.status(201).json({ success: true, address });
  } catch (e) {
    console.error("addAddress error:", e);
    res.status(500).json({ success: false, message: "Failed to save address" });
  }
};

exports.setDefaultAddress = async (req, res) => {
  try {
    const vendorId = getVendorId(req);
    const { addressId } = req.params;

    await VendorAddress.updateMany({ vendor: vendorId }, { $set: { isDefault: false } });
    await VendorAddress.updateOne({ _id: addressId, vendor: vendorId }, { $set: { isDefault: true } });

    const addresses = await VendorAddress.find({ vendor: vendorId }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    res.json({ success: true, addresses });
  } catch (e) {
    console.error("setDefaultAddress error:", e);
    res.status(500).json({ success: false, message: "Failed to set default address" });
  }
};
