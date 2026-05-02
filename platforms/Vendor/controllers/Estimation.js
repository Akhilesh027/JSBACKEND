const Estimation = require("../models/Estimation");

const safeParse = (value) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
};

// Create a new estimation (vendorId from authenticated vendor)
exports.createEstimation = async (req, res) => {
  try {
    const vendorId = req.vendor._id; // from protectVendor middleware

    const {
      projectName,
      estimatedCost,
      description,
      clientName,
      location,
      priority,
      vendorType,
      step,
      userDetails,
      quotationDetails,
      finalOrder,
      updatesSection,
      closingSection,
    } = req.body;

    // Basic validation
    if (!projectName || !estimatedCost || !clientName || !location) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: projectName, estimatedCost, clientName, location",
      });
    }

    const estimation = await Estimation.create({
      vendorId,
      projectName,
      estimatedCost,
      description: description || "",
      clientName,
      location,
      priority: priority || "Medium",
      vendorType: vendorType || "Interior",
      step: step || "Estimation",
      userDetails: safeParse(userDetails),
      quotationDetails: safeParse(quotationDetails),
      finalOrder: safeParse(finalOrder),
      updatesSection: safeParse(updatesSection),
      closingSection: safeParse(closingSection),
      estimationDocument: req.files?.estimationDocument?.[0]?.path || "",
      quotationDocument: req.files?.quotationDocument?.[0]?.path || "",
      finalOrderImages: req.files?.finalOrderImages?.map((f) => f.path) || [],
      updateAttachments: req.files?.updateAttachments?.map((f) => f.path) || [],
      closingImages: req.files?.closingImages?.map((f) => f.path) || [],
    });

    return res.status(201).json({
      success: true,
      message: "Estimation saved successfully",
      estimation,
    });
  } catch (error) {
    console.error("Create estimation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save estimation",
    });
  }
};

// Get all estimations for the logged-in vendor
exports.getVendorEstimations = async (req, res) => {
  try {
    const vendorId = req.vendor._id;
    const estimations = await Estimation.find({ vendorId }).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      estimations,
    });
  } catch (error) {
    console.error("Get estimations error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch estimations",
    });
  }
};

// Update an existing estimation (only if it belongs to the vendor)
exports.updateEstimation = async (req, res) => {
  try {
    const { id } = req.params;
    const vendorId = req.vendor._id;

    // Find estimation and ensure it belongs to the vendor
    const estimation = await Estimation.findOne({ _id: id, vendorId });
    if (!estimation) {
      return res.status(404).json({
        success: false,
        message: "Estimation not found or unauthorized",
      });
    }

    const {
      projectName,
      estimatedCost,
      description,
      clientName,
      location,
      priority,
      vendorType,
      step,
      userDetails,
      quotationDetails,
      finalOrder,
      updatesSection,
      closingSection,
    } = req.body;

    // Update fields (only if provided)
    if (projectName !== undefined) estimation.projectName = projectName;
    if (estimatedCost !== undefined) estimation.estimatedCost = estimatedCost;
    if (description !== undefined) estimation.description = description;
    if (clientName !== undefined) estimation.clientName = clientName;
    if (location !== undefined) estimation.location = location;
    if (priority !== undefined) estimation.priority = priority;
    if (vendorType !== undefined) estimation.vendorType = vendorType;
    if (step !== undefined) estimation.step = step;
    if (userDetails !== undefined) estimation.userDetails = safeParse(userDetails);
    if (quotationDetails !== undefined) estimation.quotationDetails = safeParse(quotationDetails);
    if (finalOrder !== undefined) estimation.finalOrder = safeParse(finalOrder);
    if (updatesSection !== undefined) estimation.updatesSection = safeParse(updatesSection);
    if (closingSection !== undefined) estimation.closingSection = safeParse(closingSection);

    // Handle files (if new files are uploaded, replace or append – here we replace)
    if (req.files?.estimationDocument?.[0]) {
      estimation.estimationDocument = req.files.estimationDocument[0].path;
    }
    if (req.files?.quotationDocument?.[0]) {
      estimation.quotationDocument = req.files.quotationDocument[0].path;
    }
    if (req.files?.finalOrderImages) {
      estimation.finalOrderImages = req.files.finalOrderImages.map((f) => f.path);
    }
    if (req.files?.updateAttachments) {
      estimation.updateAttachments = req.files.updateAttachments.map((f) => f.path);
    }
    if (req.files?.closingImages) {
      estimation.closingImages = req.files.closingImages.map((f) => f.path);
    }

    await estimation.save();

    return res.status(200).json({
      success: true,
      message: "Estimation updated successfully",
      estimation,
    });
  } catch (error) {
    console.error("Update estimation error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update estimation",
    });
  }
};