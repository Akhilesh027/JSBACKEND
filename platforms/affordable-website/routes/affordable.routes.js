const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../../../shared/middleware/authMiddleware');
const affordableAuthMiddleware = require('../middleware/authMiddleware');
const  productController  = require('../controllers/productController');
const cartController = require('../controllers/cartController');
const addressController = require('../controllers/addressController');
const orderController = require('../controllers/orderController');
const auth = require('../middleware/authMiddleware');

const wishlistController = require('../controllers/wishlistController');
// Public Routes
router.post('/api/affordable/signup', authController.signup);
router.post('/api/affordable/login', authController.login);
router.post('/api/affordable/logout', authController.logout);

// Protected Routes (require authentication)
router.get('/api/affordable/profile', authMiddleware, authController.getProfile);
router.put('/api/affordable/profile', authMiddleware, authController.updateProfile);
router.put('/api/affordable/change-password', authMiddleware, authController.changePassword);
router.post("/api/affordable/forgot-password", authController.forgotPassword);
router.post("/api/affordable/reset-password", authController.resetPassword);

router.get("/api/affordable/products", productController.getProducts);
router.get("/api/affordable/products/:id", productController.getProductById);

router.get("/api/cart/affordable/:userId", auth, cartController.getCart);
router.post("/api/cart/affordable/add", auth, cartController.addToCart);
router.put("/api/cart/affordable/update/:userId/:itemId/:quantity", auth, cartController.updateQuantity);
router.delete("/api/cart/affordable/remove/:userId/:itemId", auth, cartController.removeItem);
router.delete("/api/cart/affordable/clear/:userId", auth, cartController.clearCart);


router.get("/api/affordable/address/:userId", auth, addressController.getAddressesByUser);
router.post("/api/affordable/address", auth, addressController.addAddress);
router.put("/api/affordable/address/:addressId", auth, addressController.updateAddress);
router.delete("/api/affordable/address/:addressId/:userId", auth, addressController.deleteAddress);


router.post("/api/affordable/orders", auth, orderController.createOrder);
router.get("/api/affordable/orders/:userId", auth, orderController.getOrdersByUser);


router.get("/api/affordable/wishlist", auth, wishlistController.getWishlist);
router.post("/api/affordable/wishlist/:productId", auth, wishlistController.addToWishlist);
router.delete("/api/affordable/wishlist/:productId", auth, wishlistController.removeFromWishlist);
module.exports = router;