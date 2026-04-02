const Customer = require("../models/luxury_customers.js");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// ✅ Stronger JWT secret handling
const JWT_SECRET = process.env.JWT_SECRET || "LUXURY_SECRET_789";
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is not set in production");
}

// Generate JWT Token for luxury – expects an object with id, email, platform, vipTier
function generateToken(payload) {
  return jwt.sign(
    {
      id: payload.id,
      email: payload.email,
      platform: payload.platform, // ✅ changed from 'website' to 'platform'
      vipTier: payload.vipTier,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

const normalizeEmail = (email) => String(email || "").toLowerCase().trim();
const normalizePhone = (phone) => String(phone || "").trim();

const validatePasswordStrength = (password) => {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
    return "Password must contain uppercase, lowercase, numbers, and special characters";
  }
  return null;
};

// ✅ Safe customer payload – ensures id is always present (mapped from _id)
const safeCustomerPayload = (customer) => ({
  id: customer._id,
  vipId: customer.vipId,
  fullName: customer.fullName,
  firstName: customer.firstName,
  lastName: customer.lastName,
  email: customer.email,
  phone: customer.phone,
  company: customer.company,
  designation: customer.designation,
  platform: customer.platform,
  vipTier: customer.vipTier,
  vipBadge: customer.vipBadge,
  isVip: customer.isVip,
  isVerified: customer.isVerified,
  isActive: customer.isActive,
  loyaltyPoints: customer.loyaltyPoints,
  rewardTier: customer.rewardTier,
  lastLogin: customer.lastLogin,
  createdAt: customer.createdAt,
  updatedAt: customer.updatedAt,
});

// ✅ Luxury Customer Signup
exports.signup = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      company,
      designation,
      preferences,
    } = req.body;

    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide all required fields: firstName, lastName, email, phone, password",
      });
    }

    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      return res.status(400).json({ success: false, message: pwErr });
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "Invalid email address." });
    }
    if (String(normalizedPhone).length < 8) {
      return res.status(400).json({ success: false, message: "Invalid phone number." });
    }

    const [existingEmail, existingPhone] = await Promise.all([
      Customer.findOne({ email: normalizedEmail }).lean(),
      Customer.findOne({ phone: normalizedPhone }).lean(),
    ]);

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: "Email already registered.",
      });
    }

    if (existingPhone) {
      return res.status(409).json({
        success: false,
        message: "Phone already registered.",
      });
    }

    const customer = await Customer.create({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password,
      company: company ? String(company).trim() : undefined,
      designation: designation ? String(designation).trim() : undefined,
      platform: "luxury",
      vipTier: "standard",
      isVip: false,
      isActive: true,
      isVerified: false,
      preferences: {
        newsletter: preferences?.newsletter ?? true,
        exclusiveInvites: preferences?.exclusiveInvites ?? true,
        conciergeAlerts: preferences?.conciergeAlerts ?? true,
      },
      dataConsent: {
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        marketingConsent: true,
        privacyConsent: true,
      },
      lastLogin: new Date(),
    });

    const token = generateToken({
      id: customer._id,
      email: customer.email,
      platform: customer.platform, // ✅ use platform
      vipTier: customer.vipTier,
    });

    const nameForMsg =
      customer.fullName ||
      `${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
      "there";

    return res.status(201).json({
      success: true,
      message: `Welcome ${nameForMsg}! Your luxury account has been created.`,
      token,
      customer: safeCustomerPayload(customer),
    });
  } catch (error) {
    console.error("Luxury signup error:", error);
    if (error?.code === 11000) {
      const dupField =
        Object.keys(error.keyPattern || {})[0] ||
        Object.keys(error.keyValue || {})[0] ||
        "field";
      const pretty =
        dupField === "email"
          ? "Email already registered."
          : dupField === "phone"
          ? "Phone already registered."
          : `${dupField} already exists`;
      return res.status(409).json({ success: false, message: pretty });
    }
    if (error?.name === "ValidationError") {
      const errors = Object.values(error.errors || {}).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ✅ Luxury Customer Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please provide email and password" });
    }

    const normalizedEmail = normalizeEmail(email);

    const customer = await Customer.findOne({ email: normalizedEmail }).select("+password");

    if (!customer) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (customer.isActive === false) {
      return res.status(403).json({ success: false, message: "Account is deactivated" });
    }

    const isMatch = await customer.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    customer.lastLogin = new Date();
    await customer.save();

    const token = generateToken({
      id: customer._id,
      email: customer.email,
      platform: customer.platform, // ✅ use platform
      vipTier: customer.vipTier,
    });

    customer.password = undefined;

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${customer.fullName}!`,
      token,
      customer: safeCustomerPayload(customer),
    });
  } catch (error) {
    console.error("Luxury login error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ✅ Logout (stateless JWT)
exports.logout = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Logged out successfully. We look forward to serving you again.",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ✅ Get Profile – now uses safeCustomerPayload
exports.getProfile = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const customer = await Customer.findById(req.user.id);

    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    return res.status(200).json({
      success: true,
      customer: safeCustomerPayload(customer),
      conciergeAvailable: !!customer.assignedConcierge,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ✅ Update Profile – now uses safeCustomerPayload in response
exports.updateProfile = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { firstName, lastName, phone, company, designation, address, preferences } = req.body;

    const customer = await Customer.findById(req.user.id).select("-password -loginAttempts -lockUntil");
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    if (phone) {
      const normalizedPhone = normalizePhone(phone);
      const dup = await Customer.findOne({ phone: normalizedPhone, _id: { $ne: req.user.id } });
      if (dup) {
        return res.status(409).json({ success: false, message: "Phone already registered." });
      }
      customer.phone = normalizedPhone;
    }

    if (firstName) customer.firstName = String(firstName).trim();
    if (lastName) customer.lastName = String(lastName).trim();
    if (company !== undefined) customer.company = company ? String(company).trim() : "";
    if (designation !== undefined) customer.designation = designation ? String(designation).trim() : "";

    if (address) {
      const current = customer.address || {};
      customer.address = {
        primary: {
          ...(current.primary || {}),
          ...(address.primary || {}),
        },
        secondary: {
          ...(current.secondary || {}),
          ...(address.secondary || {}),
        },
      };
      const trimObj = (obj) => {
        const out = { ...obj };
        Object.keys(out).forEach((k) => {
          if (typeof out[k] === "string") out[k] = out[k].trim();
        });
        return out;
      };
      customer.address.primary = trimObj(customer.address.primary);
      customer.address.secondary = trimObj(customer.address.secondary);
    }

    if (preferences) {
      const currentPrefs = customer.preferences || {};
      customer.preferences = {
        ...currentPrefs,
        ...preferences,
        style: Array.isArray(preferences.style) ? preferences.style : currentPrefs.style || [],
        materials: Array.isArray(preferences.materials)
          ? preferences.materials
          : currentPrefs.materials || [],
        colors: Array.isArray(preferences.colors) ? preferences.colors : currentPrefs.colors || [],
        budgetRange: preferences.budgetRange || currentPrefs.budgetRange || { min: 0, max: 0 },
      };
    }

    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      customer: safeCustomerPayload(customer),
    });
  } catch (error) {
    console.error("Update profile error:", error);
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ success: false, message: "Validation error", errors: messages });
    }
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ✅ Upgrade VIP Tier (Admin/Concierge)
exports.upgradeVipTier = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { vipTier, notes } = req.body;

    if (!["silver", "gold", "platinum", "diamond"].includes(vipTier)) {
      return res.status(400).json({ success: false, message: "Invalid VIP tier" });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    const tiers = ["standard", "silver", "gold", "platinum", "diamond"];
    const currentIndex = tiers.indexOf(customer.vipTier);
    const newIndex = tiers.indexOf(vipTier);

    if (newIndex <= currentIndex) {
      return res.status(400).json({
        success: false,
        message: `Cannot downgrade from ${customer.vipTier} to ${vipTier}`,
      });
    }

    customer.vipTier = vipTier;
    customer.isVip = true;
    if (notes) customer.conciergeNotes = notes;

    customer.vipBenefits = {
      freeShipping: ["silver", "gold", "platinum", "diamond"].includes(vipTier),
      extendedWarranty: ["gold", "platinum", "diamond"].includes(vipTier),
      prioritySupport: ["gold", "platinum", "diamond"].includes(vipTier),
      privateViewings: ["platinum", "diamond"].includes(vipTier),
      exclusiveAccess: ["platinum", "diamond"].includes(vipTier),
      customDesign: vipTier === "diamond",
    };

    await customer.save();

    const token = generateToken({
      id: customer._id,
      email: customer.email,
      platform: customer.platform, // ✅ use platform
      vipTier: customer.vipTier,
    });

    return res.status(200).json({
      success: true,
      message: `VIP tier upgraded to ${vipTier}`,
      token,
      customer: {
        id: customer._id,
        vipId: customer.vipId,
        fullName: customer.fullName,
        vipTier: customer.vipTier,
        vipBadge: customer.vipBadge,
        isVip: customer.isVip,
        vipBenefits: customer.vipBenefits,
        loyaltyPoints: customer.loyaltyPoints,
      },
    });
  } catch (error) {
    console.error("Upgrade VIP tier error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ✅ Concierge request
exports.requestConcierge = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { serviceType, requirements, preferredDate, notes } = req.body;

    if (!serviceType || !requirements) {
      return res.status(400).json({
        success: false,
        message: "Please provide service type and requirements",
      });
    }

    const customer = await Customer.findById(req.user.id);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

    return res.status(200).json({
      success: true,
      message: "Concierge service request received. Our team will contact you within 24 hours.",
      requestId: `CON-${Date.now()}`,
      estimatedResponse: "24 hours",
      contactPerson: customer.assignedConcierge ? "Your assigned concierge" : "Our luxury support team",
      preferredDate: preferredDate || null,
      notes: notes || null,
    });
  } catch (error) {
    console.error("Concierge request error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const crypto = require("crypto");
const nodemailer = require("nodemailer");

exports.forgotPassword = async (req, res) => {
  try {
    console.log("🔥 Luxury Forgot API HIT");

    const { email } = req.body;

    const normalizedEmail = String(email || "").toLowerCase().trim();

    const customer = await Customer.findOne({ email: normalizedEmail });

    // 🔐 Do not reveal existence
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

    // 🔗 Reset URL (luxury frontend)
    const resetUrl = `https://celestialiving.jsgallor.com/reset-password?token=${resetToken}`;

    console.log("🔗 Reset URL:", resetUrl);

    // 📩 Email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const name =
      customer.fullName ||
      `${customer.firstName || ""} ${customer.lastName || ""}`.trim() ||
      "Valued Client";

    const mailOptions = {
      from: process.env.SMTP_FROM,
      to: customer.email,
      subject: "Luxury Account Password Reset",
      html: `
        <div style="font-family:Arial;padding:20px">
          <h2 style="color:#d4af37;">Luxury Password Reset</h2>
          <p>Hello ${name},</p>
          <p>You requested a password reset for your luxury account.</p>

          <p>
            <a href="${resetUrl}" 
            style="display:inline-block;padding:12px 24px;background:#d4af37;color:#000;text-decoration:none;border-radius:6px;font-weight:bold;">
              Reset Password
            </a>
          </p>

          <p>This link will expire in 15 minutes.</p>
          <p>If you did not request this, please ignore.</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log("✅ Luxury email sent");
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

    // 🔐 Use your existing strong validator
    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      return res.status(400).json({
        success: false,
        message: pwErr,
      });
    }

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

    // ✅ Update password (your model handles hashing)
    customer.password = password;

    // ❌ Clear reset fields
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