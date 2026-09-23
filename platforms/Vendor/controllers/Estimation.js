const Estimation = require("../models/Estimation");
const { sendWhatsAppMessage } = require("../../../shared/services/whatsappService");

const safeParse = (value) => {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
};

function sendVendorWhatsAppUpdate(estimation) {
  setImmediate(async () => {
    try {
      const clientPhone =
        estimation.userDetails?.phone ||
        estimation.clientPhone ||
        "";
      if (!clientPhone) return;

      const clientName = estimation.clientName || estimation.userDetails?.clientName || "Client";
      const projectName = estimation.projectName || "Interior / Furniture Project";
      const step = estimation.step || "Estimation";

      let msg = "";
      if (step === "Quotation") {
        const qAmt = estimation.quotationDetails?.quotationAmount || estimation.estimatedCost || "—";
        const qNotes = estimation.quotationDetails?.notes || "Quotation submitted for your review.";
        msg = `📋 *Project Quotation Ready - JS GALLOR*\n\nHello *${clientName}*,\nA quotation for your project *${projectName}* has been prepared:\n\n💰 *Quote Amount:* ₹${qAmt}\n📝 *Details:* ${qNotes}\n\nOur team is ready to assist you with any questions.`;
      } else if (step === "Final Order") {
        const stage = estimation.finalOrder?.currentStage || "Order Confirmed & Work Started";
        msg = `🛠️ *Project Order Confirmed - JS GALLOR*\n\nHello *${clientName}*,\nWork on your project *${projectName}* has officially commenced!\n\n📌 *Current Stage:* ${stage}\n\nWe will keep you posted as milestones progress.`;
      } else if (step === "Update") {
        const upd = estimation.updatesSection || {};
        const title = upd.progressTitle || upd.updateType || "Project Progress Update";
        const note = upd.progressNote || "New milestone reached";
        const nextAction = upd.nextAction ? `\n⏳ *Next Step:* ${upd.nextAction}` : "";
        msg = `🔔 *Project Update - JS GALLOR*\n\nHello *${clientName}*,\nHere is the latest progress update on *${projectName}*:\n\n📌 *${title}*\n📝 ${note}${nextAction}\n\n_Thank you for partnering with JS GALLOR._`;
      } else if (step === "Closing") {
        msg = `🎉 *Project Handover Completed - JS GALLOR*\n\nHello *${clientName}*,\nCongratulations! Your project *${projectName}* has reached completion and handover.\n\nThank you for trusting JS GALLOR with your space.`;
      }

      if (msg) {
        await sendWhatsAppMessage(clientPhone, msg);
        console.log(`✅ [VendorWhatsApp] Sent ${step} update to ${clientPhone}`);
      }
    } catch (err) {
      console.error("❌ [VendorWhatsApp] Error sending update:", err.message);
    }
  });
}

// ========== CREATE ESTIMATION ==========
// Expects vendorId in request body (form-data or JSON)
exports.createEstimation = async (req, res) => {
  try {
    const { vendorId } = req.body;
    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId is required" });
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

    sendVendorWhatsAppUpdate(estimation);

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

// ========== GET ALL ESTIMATIONS FOR A VENDOR ==========
// Expects vendorId as a query parameter: ?vendorId=...
exports.getVendorEstimations = async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId is required" });
    }
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

// ========== UPDATE ESTIMATION ==========
// Expects vendorId in request body (JSON or form-data)
exports.updateEstimation = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId } = req.body;
    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId is required" });
    }

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

    // Handle files (if new files are uploaded, replace)
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

    sendVendorWhatsAppUpdate(estimation);

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