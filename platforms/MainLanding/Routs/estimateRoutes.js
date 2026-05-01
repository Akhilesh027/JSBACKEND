// routes/estimateRoutes.js
const express = require("express");
const router = express.Router();

const {
  createEstimate,
  updateStep2,
  updateStep3,
  updateStep4Submit,
  getEstimateById,
  getAllEstimates,
  updateEstimate,
  viewEstimateFile,
  downloadEstimateFile,
} = require("../Controller/estimateController.js");

const { upload } = require("../middleware/upload.js");

// file routes first
router.get("/files/view/:filename", viewEstimateFile);
router.get("/files/download/:filename", downloadEstimateFile);

// estimate routes
router.post("/", createEstimate);
router.get("/", getAllEstimates);

router.patch("/:id/step2", updateStep2);

router.patch(
  "/:id/step3",
  upload.fields([
    { name: "planFile", maxCount: 1 },
    { name: "floorplanPdf", maxCount: 1 },
    { name: "floorplanImages", maxCount: 10 },
  ]),
  updateStep3
);

router.patch("/:id/step4", updateStep4Submit);
router.patch("/amount/:id", updateEstimate);

// keep dynamic route last
router.get("/:id", getEstimateById);

module.exports = router;