const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authMiddleware = require('../../../shared/middleware/authMiddleware');
const affordableAuthMiddleware = require('../middleware/authMiddleware');

// Public Routes
router.post('/api/affordable/signup', authController.signup);
router.post('/api/affordable/login', authController.login);
router.post('/api/affordable/logout', authController.logout);

// Protected Routes (require authentication)
router.get('/api/affordable/profile', authMiddleware, authController.getProfile);
router.put('/api/affordable/profile', authMiddleware, authController.updateProfile);
router.put('/api/affordable/change-password', authMiddleware, authController.changePassword);

module.exports = router;