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
} = require("../Controller/estimateController.js");

const upload = require("../../../shared/middleware/upload.js"); // ✅ direct import (no destructuring)

router.post("/", createEstimate);
router.patch("/:id/step2", updateStep2);
router.get("/", getAllEstimates);

router.patch(
  "/:id/step3",
  upload.fields([
    { name: "planFile", maxCount: 1 },           // ✅ added
    { name: "floorplanPdf", maxCount: 1 },
    { name: "floorplanImages", maxCount: 10 },
  ]),
  updateStep3
);

router.patch("/:id/step4", updateStep4Submit);
router.get("/:id", getEstimateById);
router.patch("/amount/:id", updateEstimate);

module.exports = router;