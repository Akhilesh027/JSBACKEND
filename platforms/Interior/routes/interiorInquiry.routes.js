const express = require("express");
const router = express.Router();

const {
  createInquiry,
  getAllInquiries,
  getInquiryStats,
  getInquiryById,
  updateInquiry,
  deleteInquiry,
} = require("../controllers/interiorInquiryController");

// Public route to submit inquiries from the interior website
router.post("/inquiries", createInquiry);

// Admin routes to view, filter, update status, and manage inquiries
router.get("/inquiries/stats", getInquiryStats);
router.get("/inquiries", getAllInquiries);
router.get("/inquiries/:id", getInquiryById);
router.patch("/inquiries/:id", updateInquiry);
router.delete("/inquiries/:id", deleteInquiry);

module.exports = router;
