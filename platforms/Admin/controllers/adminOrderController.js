const mongoose = require("mongoose");
const Manufacturer = require("../../manufacturer-portal/models/Manufacturer");
const PurchaseOrder = require("../models/PurchaseOrder");

exports.getManufacturersForOrder = async (req, res) => {
  try {
    // ✅ only VERIFIED manufacturers
    const manufacturers = await Manufacturer.find({
      verificationStatus: "Verified",
      isActive: true,
    })
      .select(
        "_id companyName legalName email mobile telephone country city itemsInterested businessNature verificationStatus"
      )
      .sort({ createdAt: -1 });

    return res.json({ success: true, manufacturers });
  } catch (err) {
    console.error("getManufacturersForOrder error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
// GET manufacturer full details by id
exports.getManufacturerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid manufacturer id" });
    }

    const manufacturer = await Manufacturer.findById(id).select(
      "companyName legalName email mobile telephone city country verificationStatus businessNature itemsInterested"
    );

    if (!manufacturer) {
      return res.status(404).json({ success: false, message: "Manufacturer not found" });
    }

    res.json({ success: true, manufacturer });
  } catch (err) {
    console.error("getManufacturerById error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
exports.createOrder = async (req, res) => {
  try {
    const {
      manufacturerId,
      productName,
      sku,
      quantity,
      address,
      expectedDate,
      paymentOption,
      notes,
      status,
    } = req.body;

    if (!manufacturerId || !mongoose.Types.ObjectId.isValid(manufacturerId)) {
      return res.status(400).json({ success: false, message: "Invalid manufacturerId" });
    }

    if (!productName || !String(productName).trim()) {
      return res.status(400).json({ success: false, message: "productName is required" });
    }

    if (!quantity || Number(quantity) < 1) {
      return res.status(400).json({ success: false, message: "quantity must be at least 1" });
    }

    if (!address || !expectedDate || !paymentOption) {
      return res.status(400).json({
        success: false,
        message: "address, expectedDate, paymentOption are required",
      });
    }

    // ensure manufacturer exists + verified
    const mfg = await Manufacturer.findOne({
      _id: manufacturerId,
      verificationStatus: "Verified",
      isActive: true,
    });

    if (!mfg) {
      return res.status(404).json({
        success: false,
        message: "Manufacturer not found or not verified",
      });
    }

    const order = await PurchaseOrder.create({
      manufacturer: manufacturerId,
      productName: String(productName).trim(),
      sku: sku ? String(sku).trim() : undefined,
      quantity: Number(quantity),
      address,
      expectedDate: new Date(expectedDate),
      paymentOption,
      notes: notes || "",
      status: status || "sent",
    });

    res.status(201).json({ success: true, message: "Order created", order });
  } catch (err) {
    console.error("createOrder error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.listOrders = async (req, res) => {
  try {
    const { manufacturerId } = req.query;

    const filter = {};
    if (manufacturerId) {
      if (!mongoose.Types.ObjectId.isValid(manufacturerId)) {
        return res.status(400).json({ success: false, message: "Invalid manufacturerId" });
      }
      filter.manufacturer = manufacturerId;
    }

    const orders = await PurchaseOrder.find(filter)
      .populate("manufacturer", "companyName city country")
      .sort({ createdAt: -1 });

    res.json({ success: true, orders });
  } catch (err) {
    console.error("listOrders error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
exports.getAllOrders = async (req, res) => {
  try {
    const { manufacturerId } = req.query;

    const filter = {};
    if (manufacturerId && mongoose.Types.ObjectId.isValid(String(manufacturerId))) {
      filter.manufacturer = manufacturerId;
    }

    const orders = await PurchaseOrder.find(filter)
      .populate("manufacturer", "companyName city country email mobile telephone verificationStatus")
      .sort({ createdAt: -1 });

    return res.json({ success: true, orders });
  } catch (err) {
    console.error("getAllOrders error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
