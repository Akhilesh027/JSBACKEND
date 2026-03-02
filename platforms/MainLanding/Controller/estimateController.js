// controllers/estimateController.js
const Estimate = require("../models/Estimate");

const ok = (res, data, message = "OK") =>
  res.json({ success: true, message, data });

const bad = (res, status, message) =>
  res.status(status).json({ success: false, message });

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

exports.updateStep2 = async (req, res) => {
  try {
    const { id } = req.params;
    const { kitchen, wardrobe, tvUnit } = req.body;

    const estimate = await Estimate.findByIdAndUpdate(
      id,
      {
        kitchen: kitchen ?? true,
        wardrobe: Number(wardrobe ?? 0),
        tvUnit: Number(tvUnit ?? 0),
      },
      { new: true }
    );

    if (!estimate) return bad(res, 404, "Estimate not found");
    return ok(res, estimate, "Step 2 updated");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};

exports.updateStep3 = async (req, res) => {
  try {
    const { id } = req.params;
    const { plotSize } = req.body;

    const pdf = req.files?.floorplanPdf?.[0];
    const images = req.files?.floorplanImages || [];

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const pdfUrl = pdf ? `${baseUrl}/uploads/${pdf.filename}` : "";
    const imageUrls = images.map((f) => `${baseUrl}/uploads/${f.filename}`);

    const estimate = await Estimate.findById(id);
    if (!estimate) return bad(res, 404, "Estimate not found");

    if (plotSize) estimate.plotSize = plotSize;
    if (pdfUrl) estimate.floorplanPdfUrl = pdfUrl;
    if (imageUrls.length) {
      estimate.floorplanImageUrls = [
        ...(estimate.floorplanImageUrls || []),
        ...imageUrls,
      ];
    }

    await estimate.save();
    return ok(res, estimate, "Step 3 updated");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};

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

exports.getEstimateById = async (req, res) => {
  try {
    const estimate = await Estimate.findById(req.params.id);
    if (!estimate) return bad(res, 404, "Estimate not found");
    return ok(res, estimate, "Estimate fetched");
  } catch (err) {
    return bad(res, 500, err.message || "Server error");
  }
};
// GET /api/estimates?status=submitted&q=search
exports.getAllEstimates = async (req, res) => {
  try {
    // optional filters
    const { status, q } = req.query;

    const filter = {};
    if (status) filter.status = status; // draft/submitted

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