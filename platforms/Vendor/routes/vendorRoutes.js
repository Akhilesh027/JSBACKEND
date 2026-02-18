const express = require("express");
const { registerVendor, listVendors, loginVendor, getVendorMe } = require("../controllers/vendorController");
const { uploadVendorDoc } = require("../utils/vendorUpload");

const { protectVendor } = require("../middleware/vendorAuth");


const router = express.Router();

router.post("/api/vendor/register", uploadVendorDoc.single("document"), registerVendor);
router.get("/api/vendor", listVendors);
router.post("/api/vendor/login", loginVendor);
const {
  getProducts,
  getProductById,
} = require("../controllers/productController");

// GET /api/products
router.get("/api/vendor/products", getProducts);

// GET /api/products/:id
router.get("/api/vendor/products/:id", getProductById);
router.get("/api/vendor/me", protectVendor, getVendorMe);



const {
  getCart,
  addToCart,
  updateCartQty,
  removeCartItem,
  clearCart,
} = require("../controllers/cartController");

router.get("/api/vendor/cart", protectVendor, getCart);
router.post("/api/vendor/cart", protectVendor, addToCart);
router.patch("/api/vendor/cart/:productId", protectVendor, updateCartQty);
router.delete("/api/vendor/cart/:productId", protectVendor, removeCartItem);
router.delete("/api/vendor/cart", protectVendor, clearCart);



const {
  getAddresses,
  addAddress,
  setDefaultAddress,
} = require("../controllers/vendorAddressController");

router.get("/api/vendor/addresses", protectVendor, getAddresses);
router.post("/api/vendor/addresses", protectVendor, addAddress);
router.patch("/api/vendor/addresses/:addressId/default", protectVendor, setDefaultAddress);



const {
  placeOrder,
  getMyOrders,
  getOrderById,
  getAllVendorOrders,
  trackOrder,
  
} = require("../controllers/vendorOrderController");
const {getVendorReports} = require("../controllers/VendorDashboard");
// create order from cart + address
router.post("/api/vendor/orders", protectVendor, placeOrder);

// list vendor orders
router.get("/api/vendor/orders", protectVendor, getMyOrders);

// order details
router.get("/api/vendor/orders/:orderId", protectVendor, getOrderById);
router.get("/api/vendor/vendor-orders", protectVendor, getAllVendorOrders);
router.get("/api/vendor/orders/track/:trackingId", protectVendor, trackOrder);
router.get("/api/vendor/reports", protectVendor, getVendorReports);

module.exports = router;
