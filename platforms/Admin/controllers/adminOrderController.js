// controllers/adminManufacturer.controller.js
const mongoose = require("mongoose");
const Manufacturer = require("../../manufacturer-portal/models/Manufacturer");
const PurchaseOrder = require("../models/PurchaseOrder");
const Product = require("../../manufacturer-portal/models/Product");

// -------------------------------------------------------------------
// Manufacturers
// -------------------------------------------------------------------
exports.getManufacturersForOrder = async (req, res) => {
  try {
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

// -------------------------------------------------------------------
// Products – FULL details (including images, description, etc.)
// -------------------------------------------------------------------
exports.getManufacturerProducts = async (req, res) => {
  try {
    const { manufacturerId } = req.params;
    if (!manufacturerId) {
      return res.status(400).json({ success: false, message: "manufacturerId is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(manufacturerId)) {
      return res.status(400).json({ success: false, message: "Invalid manufacturerId format" });
    }

    // ✅ Return ALL fields from Product schema (images, description, category, stock, etc.)
    const products = await Product.find({ manufacturer: manufacturerId }).lean();

    return res.status(200).json({ success: true, products });
  } catch (err) {
    console.error("getManufacturerProducts error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
};

// -------------------------------------------------------------------
// Purchase Orders – multi‑item support
// -------------------------------------------------------------------
exports.createOrder = async (req, res) => {
  try {
    const {
      manufacturerId,
      items,
      address,
      expectedDate,
      paymentOption,
      notes,
      status = "draft",
    } = req.body;

    if (!manufacturerId || !mongoose.Types.ObjectId.isValid(manufacturerId)) {
      return res.status(400).json({ success: false, message: "Invalid manufacturerId" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: "At least one item is required" });
    }

    for (const item of items) {
      if (!item.productId || !item.productName || !item.quantity || item.quantity < 1) {
        return res.status(400).json({
          success: false,
          message: "Each item must have productId, productName, and quantity >= 1",
        });
      }
    }

    if (!address || !expectedDate || !paymentOption) {
      return res.status(400).json({
        success: false,
        message: "address, expectedDate, paymentOption are required",
      });
    }

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

    const lineItems = items.map((item) => ({
      productId: item.productId,
      productName: String(item.productName).trim(),
      sku: item.sku ? String(item.sku).trim() : undefined,
      quantity: Number(item.quantity),
    }));

    const order = await PurchaseOrder.create({
      manufacturer: manufacturerId,
      items: lineItems,
      address,
      expectedDate: new Date(expectedDate),
      paymentOption,
      notes: notes || "",
      status,
    });

    await order.populate("manufacturer", "companyName city country");

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