const Estimate = require("../models/Estimate");

// Helper functions
const ok = (res, data, message = "OK") =>
  res.json({ success: true, message, data });

const bad = (res, status, message) =>
  res.status(status).json({ success: false, message });

// ---------- Step 1: Create estimate ----------
exports.createEstimate = async (req, res) => {
  try {
    const { floorplan, purpose, propertyType } = req.body;

    if (!floorplan || !purpose || !propertyType) {
      return bad(res, 400, "floorplan, purpose, propertyType are required");
    }

    const estimate = await Estimate.create({
      floorplan,
      purpose,
      propertyType,
      status: "draft",
    });

    return ok(res, { estimateId: estimate._id }, "Estimate created");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};

// ---------- Step 2: Update furniture (kitchen & wardrobe removed) ----------
exports.updateStep2 = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      tvUnit,
      sofaSet,
      beds,
      centerTables,
      crockeryUnit,
      diningTableSet,
      foyers,
      vanityUnit,
      studyUnit,
      outdoorFurniture,
    } = req.body;

    // Build update object with only the fields present in the new schema
    const updateData = {
      tvUnit: Number(tvUnit ?? 0),
      sofaSet: Number(sofaSet ?? 0),
      beds: Number(beds ?? 0),
      centerTables: Number(centerTables ?? 0),
      crockeryUnit: Number(crockeryUnit ?? 0),
      diningTableSet: Number(diningTableSet ?? 0),
      foyers: Number(foyers ?? 0),
      vanityUnit: Number(vanityUnit ?? 0),
      studyUnit: Number(studyUnit ?? 0),
      outdoorFurniture: Number(outdoorFurniture ?? 0),
    };

    const estimate = await Estimate.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!estimate) return bad(res, 404, "Estimate not found");
    return ok(res, estimate, "Step 2 updated");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};

// ---------- Step 3: Upload floorplan details (with Cloudinary) ----------
// This function is intended to be used with multer middleware that handles:
//   - 'planFile' (single file)
//   - 'floorplanPdf' (single file)
//   - 'floorplanImages' (multiple files)
exports.updateStep3 = async (req, res) => {
  try {
    const { id } = req.params;
    const { plotSize } = req.body;

    // Validate required field
    if (!plotSize) {
      return bad(res, 400, "plotSize is required");
    }

    // Get file URLs from multer (they are already uploaded to Cloudinary)
    const planFile = req.files?.planFile?.[0];
    const floorplanPdf = req.files?.floorplanPdf?.[0];
    const floorplanImages = req.files?.floorplanImages || [];

    const estimate = await Estimate.findById(id);
    if (!estimate) return bad(res, 404, "Estimate not found");

    // Update text fields
    estimate.plotSize = plotSize;

    // Update file URLs
    if (planFile) estimate.planFileUrl = planFile.path;   // Cloudinary secure URL
    if (floorplanPdf) estimate.floorplanPdfUrl = floorplanPdf.path;

    if (floorplanImages.length) {
      const newImageUrls = floorplanImages.map(img => img.path);
      estimate.floorplanImageUrls = [
        ...(estimate.floorplanImageUrls || []),
        ...newImageUrls,
      ];
    }

    await estimate.save();
    return ok(res, estimate, "Step 3 updated");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};

// ---------- Step 4: Submit estimate (contact details) ----------
exports.updateStep4Submit = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, whatsappUpdates, city } = req.body;

    if (!name || !phone || !city) {
      return bad(res, 400, "name, phone, city are required");
    }

    const estimate = await Estimate.findByIdAndUpdate(
      id,
      {
        name,
        phone,
        whatsappUpdates: whatsappUpdates ?? true,
        city,
        status: "submitted",
      },
      { new: true }
    );

    if (!estimate) return bad(res, 404, "Estimate not found");
    return ok(res, estimate, "Estimate submitted");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};

// ---------- Retrieve single estimate ----------
exports.getEstimateById = async (req, res) => {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return bad(res, 404, "Estimate not found");
    return ok(res, estimate, "Estimate fetched");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};

// ---------- List estimates (with filters) ----------
exports.getAllEstimates = async (req, res) => {
  try {
    const { status, q } = req.query;

    const filter = {};
    if (status) filter.status = status;

    if (q) {
      const s = String(q).trim();
      filter.$or = [
        { name: { $regex: s, $options: "i" } },
        { phone: { $regex: s, $options: "i" } },
        { city: { $regex: s, $options: "i" } },
        { floorplan: { $regex: s, $options: "i" } },
        { propertyType: { $regex: s, $options: "i" } },
      ];
    }

    const list = await Estimate.find(filter).sort({ createdAt: -1 });
    return ok(res, list, "Estimates fetched");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};

// ---------- Admin: update estimated/total amounts ----------
exports.updateEstimate = async (req, res) => {
  try {
    const { id } = req.params;
    const { estimatedAmount, totalAmount } = req.body;

    const update = {};
    if (estimatedAmount !== undefined) update.estimatedAmount = Number(estimatedAmount);
    if (totalAmount !== undefined) update.totalAmount = Number(totalAmount);

    const estimate = await Estimate.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!estimate) return bad(res, 404, "Estimate not found");

    return ok(res, estimate, "Estimate updated");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};