const Vendor = require("../../Vendor/models/Vendor");
const Estimation = require("../../Vendor/models/Estimation");

// Helper: compute total spent from completed projects (example)
async function computeTotalSpent(vendorId) {
  const estimations = await Estimation.find({
    vendorId,
    step: "Closing", // or any "completed" status
  });
  return estimations.reduce((sum, e) => sum + (Number(e.estimatedCost) || 0), 0);
}

// GET /api/vendors/all (or /api/vendors/list)
exports.getAllVendors = async (req, res) => {
  try {
    const { status, search } = req.query;
    const query = {};
    if (status && status !== "all") query.status = status;
    if (search) {
      query.$or = [
        { businessName: { $regex: search, $options: "i" } },
        { vendorName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }
    const vendors = await Vendor.find(query).select("-password").sort({ createdAt: -1 });
    // Add computed totalSpent (optional)
    const vendorsWithSpent = await Promise.all(
      vendors.map(async (v) => ({
        ...v.toObject(),
        totalSpent: await computeTotalSpent(v._id),
      }))
    );
    res.json({ success: true, vendors: vendorsWithSpent });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// PATCH /api/vendors/:id/approve
exports.approveVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndUpdate(
      req.params.id,
      { status: "approved" },
      { new: true }
    ).select("-password");
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });
    res.json({ success: true, message: "Vendor approved", vendor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// DELETE /api/vendors/:id
exports.deleteVendor = async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!vendor) return res.status(404).json({ success: false, message: "Vendor not found" });
    // Optionally delete uploaded files (portfolio, documents)
    res.json({ success: true, message: "Vendor deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
// Get all estimations for admin reporting (populated with vendor info)
exports.getAllEstimations = async (req, res) => {
  try {
    const estimations = await Estimation.find()
      .populate('vendorId', 'businessName vendorName email phone status')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      estimations,
    });
  } catch (error) {
    console.error("Get all estimations error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};