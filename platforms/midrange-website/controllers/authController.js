const Customer = require('../models/midrange_customers');
const jwt = require('jsonwebtoken');

// Generate JWT Token for midrange
const generateToken = (id, email, role, membershipLevel) => {
  return jwt.sign(
    { 
      id, 
      email, 
      role, 
      platform: 'midrange',
      membershipLevel 
    },
    process.env.JWT_SECRET || 'MIDRANGE_SECRET_123',
    { expiresIn: '7d' }
  );
};

// Customer Signup for Mid-range website
exports.signup = async (req, res) => {
  try {
    const fullName = String(req.body.fullName || "").trim();
    const emailRaw = String(req.body.email || "").trim();
    const email = emailRaw.toLowerCase();
    const phone = String(req.body.phone || "").trim();
    const password = String(req.body.password || "");

    // ✅ Basic validation
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide full name, email, and password",
      });
    }

    // ✅ Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
      });
    }

    // ✅ Password rules
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    // ✅ Strength check (only if method exists)
    if (typeof Customer.checkPasswordStrength === "function") {
      const strength = Customer.checkPasswordStrength(password);
      if (strength < 2) {
        return res.status(400).json({
          success: false,
          message:
            "Password is too weak. Use at least 8 characters with uppercase letters and numbers",
        });
      }
    }

    // ✅ Optional: phone validation (only if provided)
    if (phone && phone.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid phone number",
      });
    }

    // ✅ Check if customer already exists
    const existingCustomer = await Customer.findOne({ email });
    if (existingCustomer) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    // ✅ Create customer
    const customer = await Customer.create({
      fullName,
      email,
      phone: phone || "",
      password, // hashed in schema pre-save
      platform: "midrange",
      role: "customer",
      membershipLevel: "standard",
      isActive: true,
      isVerified: false,
      lastLogin: new Date(),
      preferences: {
        newsletter: true,
        marketingEmails: true,
        productUpdates: true,
      },
    });

    // ✅ Generate token
    const token = generateToken(
      customer._id,
      customer.email,
      customer.role,
      customer.membershipLevel
    );

    // ✅ Response (safe fields only)
    return res.status(201).json({
      success: true,
      message: "Account created successfully! Welcome to JS Gallor Mid-range.",
      token,
      customer: {
        id: customer._id,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone || "",
        role: customer.role,
        platform: customer.platform,
        membershipLevel: customer.membershipLevel,
        membershipBadge: customer.membershipBadge,
        isVerified: customer.isVerified,
        loyaltyPoints: customer.loyaltyPoints,
        totalOrders: customer.totalOrders,
        totalSpent: customer.totalSpent,
        lastLogin: customer.lastLogin,
        createdAt: customer.createdAt,
        avatar: customer.avatar,
      },
    });
  } catch (error) {
    console.error("Mid-range signup error:", error);

    // ✅ Mongoose validation errors
    if (error?.name === "ValidationError") {
      const messages = Object.values(error.errors || {}).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages,
      });
    }

    // ✅ Duplicate key
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
// Customer Login for Mid-range website
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find customer
    const customer = await Customer.findOne({ 
      email: email.toLowerCase().trim(),
      platform: 'midrange'
    });

    if (!customer) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is active
    if (!customer.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact support.'
      });
    }

    // Check if account is locked
    if (customer.isLocked()) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked. Try again later.'
      });
    }

    // Compare password
    const isMatch = await customer.comparePassword(password);
    
    if (!isMatch) {
      // Increment login attempts
      await customer.incLoginAttempts();
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Reset login attempts on successful login
    await customer.resetLoginAttempts();
    
    // Update last login
    customer.lastLogin = new Date();
    
    // Add welcome loyalty points for first login (if not already added)
    if (customer.loyaltyPoints === 0) {
      customer.loyaltyPoints = 100; // Welcome bonus
    }
    
    await customer.save();

    // Generate token with membership info
    const token = generateToken(
      customer._id, 
      customer.email, 
      customer.role,
      customer.membershipLevel
    );

    // Remove sensitive data from response
    const customerData = customer.toObject();
    delete customerData.password;
    delete customerData.loginAttempts;
    delete customerData.lockUntil;

    res.status(200).json({
      success: true,
      message: 'Login successful! Welcome back.',
      token,
      customer: {
        id: customer._id,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone,
        role: customer.role,
        platform: customer.platform,
        membershipLevel: customer.membershipLevel,
        membershipBadge: customer.membershipBadge,
        isVerified: customer.isVerified,
        loyaltyPoints: customer.loyaltyPoints,
        totalOrders: customer.totalOrders,
        totalSpent: customer.totalSpent,
        lastOrderDate: customer.lastOrderDate,
        avatar: customer.avatar,
        preferences: customer.preferences,
        lastLogin: customer.lastLogin,
        createdAt: customer.createdAt
      }
    });

  } catch (error) {
    console.error('Mid-range login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Customer Logout
exports.logout = async (req, res) => {
  try {
    // For JWT, logout is handled client-side
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const customer = await Customer.findById(req.user.id)
      .select('-password -loginAttempts -lockUntil')
      .populate('orders', 'orderNumber totalAmount status createdAt');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.status(200).json({
      success: true,
      customer
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};


// Update Customer Profile
exports.updateProfile = async (req, res) => {
  try {
    const { fullName, phone, address, preferences } = req.body;
    const updates = {};

    if (fullName) updates.fullName = fullName.trim();
    if (phone) updates.phone = phone.trim();
    if (address) {
      updates.address = {
        shipping: {
          street: address.shipping?.street?.trim() || '',
          city: address.shipping?.city?.trim() || '',
          state: address.shipping?.state?.trim() || '',
          country: address.shipping?.country?.trim() || '',
          zipCode: address.shipping?.zipCode?.trim() || ''
        },
        billing: {
          street: address.billing?.street?.trim() || '',
          city: address.billing?.city?.trim() || '',
          state: address.billing?.state?.trim() || '',
          country: address.billing?.country?.trim() || '',
          zipCode: address.billing?.zipCode?.trim() || ''
        }
      };
    }
    if (preferences) {
      updates.preferences = {
        newsletter: preferences.newsletter || false,
        marketingEmails: preferences.marketingEmails || false,
        productUpdates: preferences.productUpdates || false
      };
    }

    const customer = await Customer.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password -loginAttempts -lockUntil');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      customer
    });
  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'All password fields are required'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'New passwords do not match'
      });
    }

    // Check password strength
    const strength = Customer.checkPasswordStrength(newPassword);
    if (strength < 2) {
      return res.status(400).json({
        success: false,
        message: 'New password is too weak. Use at least 8 characters with uppercase letters and numbers'
      });
    }

    // Get customer
    const customer = await Customer.findById(req.user.id);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Verify current password
    const isMatch = await customer.comparePassword(currentPassword);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    customer.password = newPassword;
    await customer.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Upgrade Membership Level
exports.upgradeMembership = async (req, res) => {
  try {
    const { membershipLevel } = req.body;
    
    if (!['standard', 'premium', 'elite'].includes(membershipLevel)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid membership level'
      });
    }

    const customer = await Customer.findByIdAndUpdate(
      req.user.id,
      { membershipLevel },
      { new: true }
    ).select('-password -loginAttempts -lockUntil');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Add loyalty points for upgrading
    if (membershipLevel === 'premium') {
      customer.loyaltyPoints += 500;
    } else if (membershipLevel === 'elite') {
      customer.loyaltyPoints += 1000;
    }
    
    await customer.save();

    // Generate new token with updated membership
    const token = generateToken(
      customer._id, 
      customer.email, 
      customer.role,
      customer.membershipLevel
    );

    res.status(200).json({
      success: true,
      message: `Membership upgraded to ${membershipLevel}`,
      token,
      customer: {
        id: customer._id,
        fullName: customer.fullName,
        membershipLevel: customer.membershipLevel,
        membershipBadge: customer.membershipBadge,
        loyaltyPoints: customer.loyaltyPoints
      }
    });
  } catch (error) {
    console.error('Upgrade membership error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

const crypto = require("crypto");
const nodemailer = require("nodemailer");

exports.forgotPassword = async (req, res) => {
  try {
    console.log("🔥 Midrange Forgot API HIT");

    const { email } = req.body;

    const customer = await Customer.findOne({
      email: email.toLowerCase().trim(),
      platform: "midrange",
    });

    // 🔐 Don't reveal user existence
    if (!customer) {
      return res.status(200).json({
        success: true,
        message: "If email exists, reset link sent",
      });
    }

    // 🔐 Generate token
    const resetToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    customer.resetPasswordToken = hashedToken;
    customer.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

    await customer.save();

    // 🔗 Reset URL (frontend midrange)
    const resetUrl = `http://localhost:8080/reset-password?token=${resetToken}`;

    console.log("🔗 Reset URL:", resetUrl);

    // 📩 Email transporter (same as affordable)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: customer.email,
      subject: "Reset Your Password - JS Gallor Mid-range",
      html: `
        <h2>Password Reset</h2>
        <p>Hello ${customer.fullName},</p>
        <p>You requested a password reset.</p>
        <p>
          <a href="${resetUrl}" target="_blank" 
          style="padding:10px 20px;background:#4f622b;color:#fff;text-decoration:none;border-radius:5px;">
          Reset Password
          </a>
        </p>
        <p>This link expires in 15 minutes.</p>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log("✅ Midrange email sent");
    } catch (err) {
      console.error("❌ Email error:", err);
      return res.status(500).json({
        success: false,
        message: "Email sending failed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Reset link sent to your email",
    });

  } catch (error) {
    console.error("❌ Forgot error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "Token and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    // 🔐 Hash token
    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const customer = await Customer.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!customer) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired token",
      });
    }

    // ✅ Update password
    customer.password = password;

    // ❌ Clear fields
    customer.resetPasswordToken = undefined;
    customer.resetPasswordExpire = undefined;

    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful",
    });

  } catch (error) {
    console.error("❌ Reset error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};