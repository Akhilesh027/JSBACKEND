// controllers/adminManufacturer.controller.js
const Manufacturer = require("../../manufacturer-portal/models/Manufacturer");

// ✅ map your schema correctly for admin table
const normalizeManufacturer = (doc) => ({
  id: doc._id,

  // table fields
  companyName: doc.companyName || "",
  contactPerson: doc.legalName || "", // you don't have contactPerson, using legalName as best match
  mobile: doc.mobile || "",
  telephone: doc.telephone || "",
  email: doc.email || "",

  city: doc.city || "",
  country: doc.country || "",

  gstNumber: doc.gstNumber || "",
  panNumber: doc.panNumber || "",

  catalogCount: Number(doc.activeProducts || 0), // or create a real catalogs field later
  totalRevenue: Number(doc.totalRevenue || 0),
  totalOrders: Number(doc.totalOrders || 0),

  // ✅ status mapping for UI
  status: (doc.verificationStatus || "Pending").toLowerCase(), // pending/under review/verified/rejected

  // extra useful fields
  verificationStatus: doc.verificationStatus || "Pending",
  isActive: !!doc.isActive,
  profileCompletion: Number(doc.profileCompletion || 0),
  registrationDate: doc.registrationDate || doc.createdAt,

  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

// ✅ GET ALL
exports.getAllManufacturers = async (req, res) => {
  try {
    const manufacturers = await Manufacturer.find({ role: "manufacturer" })
      .sort({ createdAt: -1 })
      .lean();

    const data = manufacturers.map(normalizeManufacturer);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("getAllManufacturers error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch manufacturers" });
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
exports.getManufacturerById = async (req, res) => {
  try {
    const { id } = req.params;

    const manufacturer = await Manufacturer.findById(id).lean();

    if (!manufacturer) {
      return res
        .status(404)
        .json({ success: false, message: "Manufacturer not found" });
    }

    return res.status(200).json({
      success: true,
      data: normalizeManufacturer(manufacturer),
    });
  } catch (error) {
    console.error("getManufacturerById error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch manufacturer" });
  }
};
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

