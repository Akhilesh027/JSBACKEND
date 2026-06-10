const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");

const {
  registerVendor,
  loginVendor,
  checkVendorEmail,
  resetVendorPassword,
  getVendorDocuments,
  deleteVendorDocument,
  uploadVendorDocuments,
  getVendorMe,
} = require("../controllers/vendorController");

const {
  createEstimation,
  getVendorEstimations,
  updateEstimation,
} = require("../controllers/Estimation");

const {
  getPortfolio,
  updatePortfolio,
  addOrUpdateVideo,
  addOrUpdateImage,
  updateTestimonials,
  deleteVideo,
} = require("../controllers/portfolioController");

// ========== Vendor Auth ==========
router.post(
  "/api/vendors/register",
  upload.fields([
    { name: "portfolioFiles", maxCount: 10 },
    { name: "productImages", maxCount: 10 },
  ]),
  registerVendor
);

router.post("/api/vendors/login", loginVendor);
router.post("/api/vendors/check-email", checkVendorEmail);
router.post("/api/vendors/reset-password", resetVendorPassword);

// ========== Vendor Profile ==========
router.get("/api/vendors/me", getVendorMe);

// ========== Estimations ==========
router.post(
  "/api/vendors/estimations",
  upload.fields([
    { name: "estimationDocument", maxCount: 1 },
    { name: "quotationDocument", maxCount: 1 },
    { name: "finalOrderImages", maxCount: 10 },
    { name: "updateAttachments", maxCount: 10 },
    { name: "closingImages", maxCount: 10 },
  ]),
  createEstimation
);

router.get("/api/vendors/estimations", getVendorEstimations);

router.put(
  "/api/vendors/estimations/:id",
  upload.fields([
    { name: "estimationDocument", maxCount: 1 },
    { name: "quotationDocument", maxCount: 1 },
    { name: "finalOrderImages", maxCount: 10 },
    { name: "updateAttachments", maxCount: 10 },
    { name: "closingImages", maxCount: 10 },
  ]),
  updateEstimation
);

router.get("/api/vendors/vendor/:vendorId", getVendorEstimations);

// ========== Documents ==========
router.get("/api/vendors/documents", getVendorDocuments);
router.post(
  "/api/vendors/documents",
  upload.array("documents", 10),
  uploadVendorDocuments
);
router.delete("/api/vendors/documents/:id", deleteVendorDocument);

// ========== Portfolio ==========
router.get("/api/vendors/portfolio", getPortfolio);
router.put("/api/vendors/portfolio", updatePortfolio);
router.post("/api/vendors/portfolio/video", upload.single("video"), addOrUpdateVideo);
router.post("/api/vendors/portfolio/image", upload.single("image"), addOrUpdateImage);
router.put("/api/vendors/portfolio/testimonials", updateTestimonials);
router.delete("/api/vendors/portfolio/video/:index", deleteVideo);

module.exports = router;