const rateLimit = require("express-rate-limit");

// Helper to create a consistent look for the error message
const createMessage = (role) => {
  return {
    status: 429,
    message: `Too many requests from this IP. ${role} limit exceeded. Please try again later.`,
  };
};

// 1. E-COMMERCE / PUBLIC: For browsing products and carts
const ecommerceLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, 
  message: createMessage("Customer"),
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. VENDOR / MANUFACTURER: Higher limit for inventory management
const vendorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: createMessage("Vendor"),
  standardHeaders: true,
  legacyHeaders: false,
});

// 3. ADMIN: High priority access
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: createMessage("Admin"),
  standardHeaders: true,
  legacyHeaders: false,
});

// 4. AUTH: Protects Login/Signup from brute force
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // Only 10 attempts per hour
  message: createMessage("Security"),
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  ecommerceLimiter,
  vendorLimiter,
  adminLimiter,
  authLimiter
};