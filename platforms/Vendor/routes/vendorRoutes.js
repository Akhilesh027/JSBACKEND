// routes/vendorRoutes.js
const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const { registerVendor,loginVendor,getVendorDocuments,deleteVendorDocument,uploadVendorDocuments ,getVendorMe} = require("../controllers/vendorController");
const { protectVendor } = require("../middleware/auth"); // we need this middleware

router.post(
  "/api/vendors/register",
  upload.fields([
    { name: "portfolioFiles", maxCount: 10 },
    { name: "productImages", maxCount: 10 },
  ]),
  registerVendor
);
router.post("/api/vendors/login", loginVendor);
const {
  createEstimation,
  getVendorEstimations,
  updateEstimation
} = require("../controllers/Estimation");
router.get("/api/vendors/me", protectVendor, getVendorMe);
// Protected routes (authentication required)

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
app.use(protectVendor);

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
router.get("/api/vendors/documents", protectVendor, getVendorDocuments);
router.post("/api/vendors/documents", protectVendor, upload.array("documents", 10), uploadVendorDocuments);
router.delete("/api/vendors/documents/:id", protectVendor, deleteVendorDocument);
const {
  getPortfolio,
  updatePortfolio,
  addOrUpdateVideo,
  addOrUpdateImage,
  updateTestimonials,
  deleteVideo
} = require("../controllers/portfolioController");
router.get("/api/vendors/portfolio", protectVendor, getPortfolio);
router.put("/api/vendors/portfolio", protectVendor, updatePortfolio);
router.post("/api/vendors/portfolio/video", protectVendor, upload.single("video"), addOrUpdateVideo);
router.post("/api/vendors/portfolio/image", protectVendor, upload.single("image"), addOrUpdateImage);
router.put("/api/vendors/portfolio/testimonials", protectVendor, updateTestimonials);
router.delete("/api/vendors/portfolio/video/:index", protectVendor, deleteVideo);

module.exports = router;