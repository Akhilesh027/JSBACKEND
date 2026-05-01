const Estimate = require("../models/Estimate");
const path = require("path");
const fs = require("fs");

const ok = (res, data, message = "OK") =>
  res.json({ success: true, message, data });

const bad = (res, status, message) =>
  res.status(status).json({ success: false, message });

const fileViewUrl = (filename) => `/api/estimates/files/view/${filename}`;
const fileDownloadUrl = (filename) => `/api/estimates/files/download/${filename}`;

const getSafeFilePath = (filename) => {
  const safeName = path.basename(filename);

  const possiblePaths = [
    path.join(process.cwd(), "uploads", safeName),
    path.join(process.cwd(), "public", "uploads", safeName),
    path.join(__dirname, "../uploads", safeName),
    path.join(__dirname, "../../uploads", safeName),
  ];

  return possiblePaths.find((filePath) => fs.existsSync(filePath)) || possiblePaths[0];
};

// ---------- View uploaded file ----------
exports.viewEstimateFile = async (req, res) => {
  try {
    const filePath = getSafeFilePath(req.params.filename);

    console.log("VIEW FILE PATH:", filePath);

    if (!fs.existsSync(filePath)) {
      return bad(res, 404, "File not found");
    }

    return res.sendFile(filePath);
  } catch (err) {
    console.error("View file error:", err);
    return bad(res, 500, err.message || "Failed to view file");
  }
};

// ---------- Download uploaded file ----------
exports.downloadEstimateFile = async (req, res) => {
  try {
    const filePath = getSafeFilePath(req.params.filename);

    console.log("DOWNLOAD FILE PATH:", filePath);

    if (!fs.existsSync(filePath)) {
      return bad(res, 404, "File not found");
    }

    return res.download(filePath);
  } catch (err) {
    console.error("Download file error:", err);
    return bad(res, 500, err.message || "Failed to download file");
  }
};

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

// ---------- Step 2 ----------
exports.updateStep2 = async (req, res) => {
  try {
    const { id } = req.params;

    const updateData = {
      kitchen: Number(req.body.kitchen ?? 0),
      wardrobes: Number(req.body.wardrobes ?? 0),
      falseCeiling: Number(req.body.falseCeiling ?? 0),
      electricalWorks: Number(req.body.electricalWorks ?? 0),
      painting: Number(req.body.painting ?? 0),
      curtainsBlinds: Number(req.body.curtainsBlinds ?? 0),
      wallPanelling: Number(req.body.wallPanelling ?? 0),
      glassPartitions: Number(req.body.glassPartitions ?? 0),
      lighting: Number(req.body.lighting ?? 0),

      tvUnit: Number(req.body.tvUnit ?? 0),
      sofaSet: Number(req.body.sofaSet ?? 0),
      beds: Number(req.body.beds ?? 0),
      diningTable: Number(req.body.diningTable ?? 0),
      centerTable: Number(req.body.centerTable ?? 0),
      crockeryUnit: Number(req.body.crockeryUnit ?? 0),
      foyerConsole: Number(req.body.foyerConsole ?? 0),
      vanityUnit: Number(req.body.vanityUnit ?? 0),
      studyUnit: Number(req.body.studyUnit ?? 0),
      outdoorFurniture: Number(req.body.outdoorFurniture ?? 0),
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

// ---------- Step 3 ----------
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

    estimate.plotSize = plotSize;

    if (planFile) {
      estimate.planFileUrl = fileViewUrl(planFile.filename);
      estimate.planFileDownloadUrl = fileDownloadUrl(planFile.filename);
    }

    if (floorplanPdf) {
      estimate.floorplanPdfUrl = fileViewUrl(floorplanPdf.filename);
      estimate.floorplanPdfDownloadUrl = fileDownloadUrl(floorplanPdf.filename);
    }

    if (floorplanImages.length > 0) {
      const imageViewUrls = floorplanImages.map((img) => fileViewUrl(img.filename));
      const imageDownloadUrls = floorplanImages.map((img) =>
        fileDownloadUrl(img.filename)
      );

      estimate.floorplanImageUrls = [
        ...(estimate.floorplanImageUrls || []),
        ...imageViewUrls,
      ];

      estimate.floorplanImageDownloadUrls = [
        ...(estimate.floorplanImageDownloadUrls || []),
        ...imageDownloadUrls,
      ];
    }

    await estimate.save();

    return ok(res, estimate, "Step 3 updated");
  } catch (err) {
    console.error("Step 3 error:", err);
    return bad(res, 500, err.message || "Server error");
  }
};

// ---------- Step 4 ----------
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

// ---------- Get single estimate ----------
exports.getEstimateById = async (req, res) => {
  try {
    const estimate = await Estimate.findById(req.params.id);

    if (!estimate) return bad(res, 404, "Estimate not found");

    return ok(res, estimate, "Estimate fetched");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};

// ---------- Get all estimates ----------
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

// ---------- Admin amount update ----------
exports.updateEstimate = async (req, res) => {
  try {
    const { id } = req.params;
    const { estimatedAmount, totalAmount } = req.body;

    const update = {};

    if (estimatedAmount !== undefined) {
      update.estimatedAmount = Number(estimatedAmount);
    }

    if (totalAmount !== undefined) {
      update.totalAmount = Number(totalAmount);
    }

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