const Estimate = require("../models/Estimate");

const ok = (res, data, message = "OK") =>
  res.json({ success: true, message, data });

const bad = (res, status, message) =>
  res.status(status).json({ success: false, message });

// ---------- Step 1: Create estimate (unchanged) ----------
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

// ---------- Step 2: Update BOTH interior services & furniture ----------
exports.updateStep2 = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      // Interior services
      kitchen,
      wardrobes,
      falseCeiling,
      electricalWorks,
      painting,
      curtainsBlinds,
      wallPanelling,
      glassPartitions,
      lighting,
      // Furniture items
      tvUnit,
      sofaSet,
      beds,
      diningTable,
      centerTable,
      crockeryUnit,
      foyerConsole,
      vanityUnit,
      studyUnit,
      outdoorFurniture,
    } = req.body;

    const updateData = {
      // Interior
      kitchen: Number(kitchen ?? 0),
      wardrobes: Number(wardrobes ?? 0),
      falseCeiling: Number(falseCeiling ?? 0),
      electricalWorks: Number(electricalWorks ?? 0),
      painting: Number(painting ?? 0),
      curtainsBlinds: Number(curtainsBlinds ?? 0),
      wallPanelling: Number(wallPanelling ?? 0),
      glassPartitions: Number(glassPartitions ?? 0),
      lighting: Number(lighting ?? 0),
      // Furniture
      tvUnit: Number(tvUnit ?? 0),
      sofaSet: Number(sofaSet ?? 0),
      beds: Number(beds ?? 0),
      diningTable: Number(diningTable ?? 0),
      centerTable: Number(centerTable ?? 0),
      crockeryUnit: Number(crockeryUnit ?? 0),
      foyerConsole: Number(foyerConsole ?? 0),
      vanityUnit: Number(vanityUnit ?? 0),
      studyUnit: Number(studyUnit ?? 0),
      outdoorFurniture: Number(outdoorFurniture ?? 0),
    };

    const estimate = await Estimate.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    if (!estimate) return bad(res, 404, "Estimate not found");
    return ok(res, estimate, "Step 2 updated (interior + furniture)");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};

// ---------- Step 3: Upload floorplan details (unchanged) ----------
exports.updateStep3 = async (req, res) => {
  try {
    const { id } = req.params;
    const { plotSize } = req.body;

    if (!plotSize) {
      return bad(res, 400, "plotSize is required");
    }

    const estimate = await Estimate.findById(id);
    if (!estimate) return bad(res, 404, "Estimate not found");

    const planFile = req.files?.planFile?.[0];
    const floorplanPdf = req.files?.floorplanPdf?.[0];
    const floorplanImages = req.files?.floorplanImages || [];

    const planFileUrl = planFile ? `/uploads/${planFile.filename}` : null;
    const floorplanPdfUrl = floorplanPdf ? `/uploads/${floorplanPdf.filename}` : null;
    const floorplanImageUrls = floorplanImages.map(img => `/uploads/${img.filename}`);

    estimate.plotSize = plotSize;
    if (planFileUrl) estimate.planFileUrl = planFileUrl;
    if (floorplanPdfUrl) estimate.floorplanPdfUrl = floorplanPdfUrl;
    if (floorplanImageUrls.length) {
      estimate.floorplanImageUrls = [
        ...(estimate.floorplanImageUrls || []),
        ...floorplanImageUrls,
      ];
    }

    await estimate.save();
    return ok(res, estimate, "Step 3 updated");
  } catch (err) {
    console.error("Step3 error:", err);
    return bad(res, 500, err.message || "Server error");
  }
};

// ---------- Step 4: Submit estimate (unchanged) ----------
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

// ---------- Retrieve single estimate (unchanged) ----------
exports.getEstimateById = async (req, res) => {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return bad(res, 404, "Estimate not found");
    return ok(res, estimate, "Estimate fetched");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};

// ---------- List estimates (unchanged) ----------
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

// ---------- Admin: update estimated/total amounts (unchanged) ----------
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