// routes/vendorRoutes.js
const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const {
  registerVendor,
  loginVendor,
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

// ========== Vendor Auth (public) ==========
router.post(
  "/api/vendors/register",
  upload.fields([
    { name: "portfolioFiles", maxCount: 10 },
    { name: "productImages", maxCount: 10 },
  ]),
  registerVendor
);
router.post("/api/vendors/login", loginVendor);

// ========== Vendor Profile (public, expects ?vendorId=xxx) ==========
router.get("/api/vendors/me", getVendorMe);

// ========== Estimations (public, vendorId required) ==========
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
router.get("/api/vendors/estimations", getVendorEstimations);                // expects ?vendorId=xxx
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
router.get("/api/vendors/vendor/:vendorId", getVendorEstimations);           // alternative path param

// ========== Documents (public, vendorId required) ==========
router.get("/api/vendors/documents", getVendorDocuments);                   // expects ?vendorId=xxx
router.post("/api/vendors/documents", upload.array("documents", 10), uploadVendorDocuments); // expects vendorId in body
router.delete("/api/vendors/documents/:id", deleteVendorDocument);          // expects vendorId in body

// ========== Portfolio (public, vendorId required) ==========
router.get("/api/vendors/portfolio", getPortfolio);                         // expects ?vendorId=xxx
router.put("/api/vendors/portfolio", updatePortfolio);                      // expects vendorId in body
router.post("/api/vendors/portfolio/video", upload.single("video"), addOrUpdateVideo);   // expects vendorId in body
router.post("/api/vendors/portfolio/image", upload.single("image"), addOrUpdateImage);   // expects vendorId in body
router.put("/api/vendors/portfolio/testimonials", updateTestimonials);      // expects vendorId in body
router.delete("/api/vendors/portfolio/video/:index", deleteVideo);          // expects vendorId in body

module.exports = router;