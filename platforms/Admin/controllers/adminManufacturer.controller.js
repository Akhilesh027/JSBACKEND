// controllers/adminManufacturer.controller.js
const mongoose = require("mongoose");
const Manufacturer = require("../../manufacturer-portal/models/Manufacturer");
const Product = require("../../manufacturer-portal/models/Product"); // ✅ added product model import

function normalizeManufacturer(m) {
  return {
    id: String(m._id),
    companyName: m.companyName,
    contactPerson: m.legalName || m.contactPerson,
    email: m.email,
    mobile: m.mobile,
    telephone: m.telephone,
    city: m.city,
    state: m.state, // may be undefined; frontend can handle empty
    country: m.country,
    gstNumber: m.gstNumber,
    panNumber: m.panNumber,
    catalogCount: m.productCount || m.activeProducts || 0, // use computed productCount
    totalRevenue: m.totalRevenue || 0,
    totalOrders: m.totalOrders || 0,
    profileCompletion: m.profileCompletion || 0,
    isActive: m.isActive,
    verificationStatus: m.verificationStatus,
    status: m.verificationStatus?.toLowerCase() || "pending",
  };
}

exports.getAllManufacturers = async (req, res) => {
  try {
    const manufacturers = await Manufacturer.aggregate([
      { $match: { role: "manufacturer" } },
      {
        $lookup: {
          from: "products", // ensure this matches the actual collection name
          localField: "_id",
          foreignField: "manufacturer",
          as: "products"
        }
      },
      {
        $addFields: {
          productCount: { $size: "$products" }
        }
      },
      {
        $project: { products: 0 } // remove the products array from result
      },
      { $sort: { createdAt: -1 } }
    ]);

    const data = manufacturers.map(normalizeManufacturer);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("getAllManufacturers error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch manufacturers" });
  }
};



exports.getManufacturerProducts = async (req, res) => {
  try {
    const { manufacturerId } = req.params;
    if (!manufacturerId) {
      return res.status(400).json({ success: false, message: "manufacturerId is required" });
    }
    if (!mongoose.Types.ObjectId.isValid(manufacturerId)) {
      return res.status(400).json({ success: false, message: "Invalid manufacturerId format" });
    }
    const products = await Product.find({ manufacturer: manufacturerId })
      .select("name sku price")
      .lean();
    return res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("getManufacturerProducts error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch products" });
  }
};
// ✅ APPROVE (Verified)
exports.approveManufacturer = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Manufacturer.findByIdAndUpdate(
      id,
      { verificationStatus: "Verified", isActive: true },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: "Manufacturer not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Manufacturer approved",
      data: normalizeManufacturer(updated),
    });
  } catch (error) {
    console.error("approveManufacturer error:", error);
    return res.status(500).json({ success: false, message: "Approve failed" });
  }
};

// ✅ REJECT
exports.rejectManufacturer = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Manufacturer.findByIdAndUpdate(
      id,
      { verificationStatus: "Rejected", isActive: false },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: "Manufacturer not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Manufacturer rejected",
      data: normalizeManufacturer(updated),
    });
  } catch (error) {
    console.error("rejectManufacturer error:", error);
    return res.status(500).json({ success: false, message: "Reject failed" });
  }
};

// ✅ OPTIONAL: Set Under Review
exports.setUnderReviewManufacturer = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Manufacturer.findByIdAndUpdate(
      id,
      { verificationStatus: "Under Review" },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: "Manufacturer not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Manufacturer set to Under Review",
      data: normalizeManufacturer(updated),
    });
  } catch (error) {
    console.error("setUnderReviewManufacturer error:", error);
    return res.status(500).json({ success: false, message: "Update failed" });
  }
};

// ✅ DELETE
exports.deleteManufacturer = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await Manufacturer.findByIdAndDelete(id).lean();

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Manufacturer not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Manufacturer deleted",
      id,
    });
  } catch (error) {
    console.error("deleteManufacturer error:", error);
    return res.status(500).json({ success: false, message: "Delete failed" });
  }
};

// ✅ GET SINGLE
exports.getManufacturerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid manufacturer ID' });
    }

    const manufacturer = await Manufacturer.findById(id).lean();
    if (!manufacturer) {
      return res.status(404).json({ success: false, message: 'Manufacturer not found' });
    }

    return res.status(200).json({
      success: true,
      data: normalizeManufacturer(manufacturer),
    });
  } catch (error) {
    console.error('getManufacturerById error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch manufacturer' });
  }
};

// ✅ UPDATE
exports.updateManufacturer = async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ only allow safe fields (DON'T allow password update here)
    const allowed = [
      "companyName",
      "legalName",
      "email",
      "mobile",
      "telephone",
      "city",
      "country",
      "gstNumber",
      "panNumber",
      "verificationStatus",
      "isActive",
    ];

    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const updated = await Manufacturer.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).lean();

    if (!updated) {
      return res.status(404).json({ success: false, message: "Manufacturer not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Manufacturer updated",
      data: normalizeManufacturer(updated),
    });
  } catch (error) {
    console.error("updateManufacturer error:", error);
    return res.status(500).json({ success: false, message: "Update failed" });
  }
};