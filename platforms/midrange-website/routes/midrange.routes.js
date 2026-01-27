const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const midrangeAuthMiddleware = require('../middleware/authMiddleware');
const productController = require('../controllers/ProductController');
const cartController = require("../controllers/cartController");
const orderController = require("../controllers/midrangeOrderController");
const addressController = require("../controllers/midrangeAddressController");

// Public Routes
router.post('/api/midrange/signup', authController.signup);
router.post('/api/midrange/login', authController.login);
router.post('/api/midrange/logout', authController.logout);

// Protected Routes (require authentication)
router.get('/api/midrange/profile', midrangeAuthMiddleware, authController.getProfile);
router.put('/api/midrange/profile', midrangeAuthMiddleware, authController.updateProfile);
router.put('/api/midrange/change-password', midrangeAuthMiddleware, authController.changePassword);
router.put('/api/midrange/upgrade-membership', midrangeAuthMiddleware, authController.upgradeMembership);

router.get("/api/midrange/products", productController.getProducts);
router.get("/api/midrange/products/:id", productController.getProductById);

router.get("/api/midrange/cart/:id", midrangeAuthMiddleware, cartController.getCart);
router.put("/api/midrange/cart", midrangeAuthMiddleware, cartController.replaceCart);
router.post("/api/midrange/cart/add", midrangeAuthMiddleware, cartController.addToCart);
router.patch("/api/midrange/cart/item/:productId", midrangeAuthMiddleware, cartController.updateCartItem);
router.delete("/api/midrange/cart/item/:productId", midrangeAuthMiddleware, cartController.removeCartItem);
router.delete("/api/midrange/cart", midrangeAuthMiddleware, cartController.clearCart);

router.get("/api/midrange/addresses", midrangeAuthMiddleware, addressController.getMyAddresses);
router.post("/api/midrange/addresses", midrangeAuthMiddleware, addressController.addAddress);
router.patch("/api/midrange/addresses/:id/default", midrangeAuthMiddleware, addressController.setDefault);

// orders
router.post("/api/midrange/orders", midrangeAuthMiddleware, orderController.placeOrder);
router.get("/api/midrange/orders/:id",midrangeAuthMiddleware,orderController.getOrderById);
// routes/midrangeRoutes.js
router.get(
  "/api/midrange/orders",
  midrangeAuthMiddleware,
  orderController.getMyOrders
);

module.exports = router;