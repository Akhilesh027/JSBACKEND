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
  return path.join(__dirname, "../uploads", safeName);
};

// ---------- View uploaded file ----------
exports.viewEstimateFile = async (req, res) => {
  try {
    const filePath = getSafeFilePath(req.params.filename);

    if (!fs.existsSync(filePath)) {
      return bad(res, 404, "File not found");
    }

    return res.sendFile(filePath);
  } catch (err) {
    return bad(res, 500, err.message || "Failed to view file");
  }
};

// ---------- Download uploaded file ----------
exports.downloadEstimateFile = async (req, res) => {
  try {
    const filePath = getSafeFilePath(req.params.filename);

    if (!fs.existsSync(filePath)) {
      return bad(res, 404, "File not found");
    }

    return res.download(filePath);
  } catch (err) {
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

    const fields = [
      "kitchen",
      "wardrobes",
      "falseCeiling",
      "electricalWorks",
      "painting",
      "curtainsBlinds",
      "wallPanelling",
      "glassPartitions",
      "lighting",
      "tvUnit",
      "sofaSet",
      "beds",
      "diningTable",
      "centerTable",
      "crockeryUnit",
      "foyerConsole",
      "vanityUnit",
      "studyUnit",
      "outdoorFurniture",
    ];

    const updateData = {};
    fields.forEach((field) => {
      updateData[field] = Number(req.body[field] ?? 0);
    });

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

    if (planFile) {
      estimate.planFileUrl = fileViewUrl(planFile.filename);
      estimate.planFileDownloadUrl = fileDownloadUrl(planFile.filename);
    }

    if (floorplanPdf) {
      estimate.floorplanPdfUrl = fileViewUrl(floorplanPdf.filename);
      estimate.floorplanPdfDownloadUrl = fileDownloadUrl(floorplanPdf.filename);
    }

    if (floorplanImages.length) {
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

    estimate.plotSize = plotSize;

    await estimate.save();

    return ok(res, estimate, "Step 3 updated");
  } catch (err) {
    console.error("Step3 error:", err);
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

// ---------- Get single ----------
exports.getEstimateById = async (req, res) => {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return bad(res, 404, "Estimate not found");

    return ok(res, estimate, "Estimate fetched");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};

// ---------- List ----------
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