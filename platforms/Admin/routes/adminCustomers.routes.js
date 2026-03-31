const express = require("express");
const router = express.Router();

const {
  getAllCustomers,
  getAffordableCustomers,
  getMidrangeCustomers,
  getLuxuryCustomers,
  getAllCustomersFullDetails,
} = require("../controllers/adminCustomer.controller");

const {
  getAllManufacturers,
  deleteManufacturer,
  setUnderReviewManufacturer,
  rejectManufacturer,
  approveManufacturer,
  getManufacturerById,
  updateManufacturer,
  getManufacturerProducts
} = require("../controllers/adminManufacturer.controller");
const AllOrdersController = require("../controllers/AllOrdersController");
const adminCatalogController = require("../controllers/adminCatalogController");
const authMiddleware = require("../../../shared/middleware/authMiddleware");
const adminOrderController = require("../controllers/adminOrderController");
const ctrl = require("../controllers/adminManufacturerDashboard.controller");

const AffordableorderController = require("../controllers/AffordableorderController");

// ✅ NEW: Midrange Orders Controller (create this file)
const MidrangeorderController = require("../controllers/midrangeOrdersController");

// --------------------
// Customers
// --------------------
router.get("/api/admin/customers/all", getAllCustomers);
router.get("/api/admin/customers/all-details", getAllCustomersFullDetails);


router.get("/api/admin/manufacturers/all", getAllManufacturers);
router.patch("/api/admin/manufacturers/:id/approve", approveManufacturer);
router.patch("/api/admin/manufacturers/:id/reject", rejectManufacturer);
router.patch("/api/admin/manufacturers/:id/under-review", setUnderReviewManufacturer);
router.get("/api/admin/manufacturers/:id", getManufacturerById);
router.patch("/api/admin/manufacturers/:id", updateManufacturer);
router.delete("/api/admin/manufacturers/:id", deleteManufacturer);
router.get('/api/admin/manufacturers/products/:manufacturerId', getManufacturerProducts);
// --------------------
// Catalogs / Products
// --------------------
router.get("/api/admin/catalogs", adminCatalogController.getAllCatalogs);
router.put("/api/admin/catalogs/:id", adminCatalogController.updateCatalog);
router.patch("/api/admin/catalogs/:id/status", adminCatalogController.updateCatalogStatus);
router.delete("/api/admin/catalogs/:id", adminCatalogController.deleteCatalog);
router.put(
  "/api/admin/products/:productId/forward-website",
  adminCatalogController.forwardProductToWebsite
);

// --------------------
// Admin Orders (manufacturer orders)
// NOTE: you had duplicates. Keep ONE.
router.get("/api/admin/manufacturers", adminOrderController.getManufacturersForOrder);
router.get("/api/admin/manufacturers/:id", adminOrderController.getManufacturerById);
router.post("/api/admin/orders", adminOrderController.createOrder);
router.get("/api/admin/orders", adminOrderController.listOrders);
// router.get("/api/admin/orders", adminOrderController.getAllOrders); // ❌ duplicate route, remove or change path

// --------------------
// Dashboard
// --------------------
router.get("/api/admin/dashboard/manufacturers/summary", ctrl.getManufacturersSummary);
router.get("/api/admin/dashboard/manufacturers/recent", ctrl.getManufacturersRecentActivity);

// --------------------
// ✅ Website Orders - Affordable
// --------------------
router.get("/api/admin/affordable/orders", AffordableorderController.getOrders);
router.patch("/api/admin/affordable/orders/:id/approve", AffordableorderController.approveOrder);
router.patch("/api/admin/affordable/orders/:id/reject", AffordableorderController.rejectOrder);
router.patch("/api/admin/affordable/orders/:id/status", AffordableorderController.updateOrderStatus);

// --------------------
// ✅ Website Orders - Midrange (NEW)
// --------------------
router.get("/api/admin/midrange/orders", MidrangeorderController.getMidrangeOrders);
router.patch("/api/admin/midrange/orders/:id/approve", MidrangeorderController.approveMidrangeOrder);
router.patch("/api/admin/midrange/orders/:id/reject", MidrangeorderController.rejectMidrangeOrder);
router.patch("/api/admin/midrange/orders/:id/status", MidrangeorderController.updateOrderStatus);
router.get("/api/admin/midrange/orders/:id", MidrangeorderController.getMidrangeOrderById);
// --------------------
// ✅ Website Orders - Luxury (optional later)
// --------------------
 const LuxuryorderController = require("../controllers/adminLuxury.controller");
 router.get("/api/admin/luxury/orders", LuxuryorderController.getLuxuryOrdersAdmin);
 router.patch("/api/admin/luxury/orders/:id/approve", LuxuryorderController.approveLuxuryOrder);
 router.patch("/api/admin/luxury/orders/:id/status", LuxuryorderController.updateLuxuryOrderStatus);

router.get("/api/admin/orders/all", AllOrdersController.getAllOrders);

// --------------------
// CAP Admin Management
// --------------------
const {
  createAdmin,
  listAdmins,
  deleteAdmin,
  updateAdminRole,
  updateAdminActive,
  loginAdmin,
} = require("../controllers/capAdminController");

router.post("/api/admin/cap/admins", /*protect, isCapAdmin,*/ createAdmin);
router.get("/api/admin/cap/admins", /*protect, isCapAdmin,*/ listAdmins);
router.patch("/api/admin/cap/admins/:id/role", /*protect, isCapAdmin,*/ updateAdminRole);
router.patch("/api/admin/cap/admins/:id/toggle", updateAdminActive);
router.delete("/api/admin/cap/admins/:id", /*protect, isCapAdmin,*/ deleteAdmin);


const {
  getVendorOrdersAdmin,
  approveVendorOrderAdmin,
  rejectVendorOrderAdmin,
  updateVendorOrderStatusAdmin,
} = require("../controllers/adminVendorOrdersController");

router.get("/api/admin/vendor-orders", getVendorOrdersAdmin);

router.patch("/api/admin/vendor-orders/:orderId/approve", approveVendorOrderAdmin);

router.patch("/api/admin/vendor-orders/:orderId/reject", rejectVendorOrderAdmin);
router.patch("/api/admin/vendor-orders/:orderId/status", updateVendorOrderStatusAdmin);


const Copupon = require("../controllers/adminCouponController");


router.get("/api/admin/coupons", Copupon.listCoupons);
router.post("/api/admin/coupons", Copupon.createCoupon);
router.put("/api/admin/coupons/:id", Copupon.updateCoupon);
router.patch("/api/admin/coupons/:id/disable", Copupon.disableCoupon);
router.delete("/api/admin/coupons/:id", Copupon.deleteCoupon);


const applyCtrl = require("../controllers/couponApplyController");
const redeemCtrl = require("../controllers/couponRedeemController");

// Customer checkout apply
router.post("/api/:website/coupons/apply", applyCtrl.applyCoupon);

// Call after order success
router.post("/api/:website/coupons/redeem", redeemCtrl.redeemCoupon);

const cat = require("../controllers/category.controller");

router.get("/api/admin/categories", cat.listCategories);
router.get("/api/admin/categories/export", cat.exportCSV);
router.post("/api/admin/categories", cat.createCategory);
router.get("/api/admin/categories/:id", cat.getCategory);
router.put("/api/admin/categories/:id", cat.updateCategory);
router.patch("/api/admin/categories/:id/toggle-disabled", cat.toggleDisabled);
router.delete("/api/admin/categories/:id", cat.deleteCategory);
const { getAllManufacturerReports } = require("../controllers/adminReportsController");

router.get("/api/admin/reports/manufacturers", getAllManufacturerReports);

const { getAllVendorReports } = require("../controllers/adminVendorReportsController");

// ✅ /api/admin/reports/vendors?days=30
router.get("/api/admin/reports/vendors", getAllVendorReports);


const {
  getSegmentOrders,
  getAllOrders,
} = require("../controllers/adminEcommerceReportsController");

// ✅ Your existing URLs in frontend:
router.get("/api/admin/:segment/orders", getSegmentOrders);

// ✅ Optional single endpoint (faster)
router.get("/api/admin/orders/all", getAllOrders);


const { getReportsOverview } = require("../controllers/adminReportsOverviewController");

// GET /api/admin/reports/overview?days=30&lowStock=10
router.get("/api/admin/reports/overview", getReportsOverview);


const { getCAPDashboard } = require("../controllers/capDashboard.js");
const { emailInvoice, downloadInvoicePdf } = require("../controllers/invoiceController.js");

router.get("/api/admin/cap/dashboard", getCAPDashboard);
router.use("/api/admin/auth", loginAdmin);
router.post("/api/admin/:website/orders/:id/invoice/email", emailInvoice);
router.get("/api/admin/:website/orders/:id/invoice/pdf", downloadInvoicePdf);




const {
  getLegalPages,
  getLegalPageById,
  getLegalPageBySlug,
  createLegalPage,
  updateLegalPage,
  deleteLegalPage,
} = require("../controllers/legalPageController.js");

// Admin routes
router.get("/api/admin/legal-pages", getLegalPages);
router.get("/api/admin/legal-pages/:id", getLegalPageById);
router.post("/api/admin/legal-pages", createLegalPage);
router.put("/api/admin/legal-pages/:id", updateLegalPage);
router.delete("/api/admin/legal-pages/:id", deleteLegalPage);
router.get("/api/public/legal-pages/by-slug", getLegalPageBySlug);



const {
  getShippingCosts,
  createShippingCost,
  updateShippingCost,
  deleteShippingCost,
  getShippingCostByLocation,
} = require("../controllers/shippingCostController");

// add your auth middleware here if you already have one
// const { protectAdmin } = require("../middleware/auth");

// ADMIN
router.get("/api/admin/shipping-costs", getShippingCosts);
router.post("/api/admin/shipping-costs", createShippingCost);
router.put("/api/admin/shipping-costs/:id", updateShippingCost);
router.delete("/api/admin/shipping-costs/:id", deleteShippingCost);

// USER
router.get("/api/shipping-costs/by-location", getShippingCostByLocation);
module.exports = router;
