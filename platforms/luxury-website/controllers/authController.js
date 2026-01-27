const Customer = require("../models/luxury_customers.js");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// Generate JWT Token for luxury
const generateToken = (id, email, vipTier) => {
  return jwt.sign(
    { id, email, platform: "luxury", vipTier, type: "customer" },
    process.env.JWT_SECRET || "LUXURY_SECRET_789",
    { expiresIn: "30d" }
  );
};

// ✅ Luxury Customer Signup
exports.signup = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, company, designation, preferences } =
      req.body;

    if (!firstName || !lastName || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields: firstName, lastName, email, phone, password",
      });
    }

    // Password strength validation
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      return res.status(400).json({
        success: false,
        message: "Password must contain uppercase, lowercase, numbers, and special characters",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPhone = String(phone).trim();

    const existingEmail = await Customer.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(409).json({ success: false, message: "Email already registered." });
    }

    const existingPhone = await Customer.findOne({ phone: normalizedPhone });
    if (existingPhone) {
      return res.status(409).json({ success: false, message: "Phone already registered." });
    }

    // ✅ IMPORTANT: do NOT hash here if your model hashes in pre-save
    const customer = await Customer.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      phone: normalizedPhone,
      password, // ✅ raw here (model should hash)

      company: company?.trim(),
      designation: designation?.trim(),
      platform: "luxury",
      vipTier: "standard",
      isVip: false,
      isActive: true,
      isVerified: false,
      preferences: preferences || {
        newsletter: true,
        exclusiveInvites: true,
        conciergeAlerts: true,
      },
      dataConsent: {
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        marketingConsent: true,
        privacyConsent: true,
      },
      lastLogin: new Date(),
    });

    const token = generateToken(customer._id, customer.email, customer.vipTier);

    return res.status(201).json({
      success: true,
      message: `Welcome ${customer.fullName}! Your luxury account has been created.`,
      token,
      customer: {
        id: customer._id,
        fullName: customer.fullName,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        vipTier: customer.vipTier,
        isVip: customer.isVip,
        isVerified: customer.isVerified,
        createdAt: customer.createdAt,
      },
    });
  } catch (error) {
    console.error("Luxury signup error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ✅ Luxury Customer Login (fixed)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please provide email and password" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ✅ DO NOT filter by platform unless you're sure platform exists in DB
    // If platform exists, keep it. If not, remove it.
    const customer = await Customer.findOne({ email: normalizedEmail }).select("+password");

    if (!customer) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (!customer.isActive) {
      return res.status(403).json({ success: false, message: "Account is deactivated" });
    }

    // ✅ Compare password
    let isMatch = false;

    if (typeof customer.comparePassword === "function") {
      isMatch = await customer.comparePassword(password);
    } else {
      isMatch = await bcrypt.compare(password, customer.password);
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    customer.lastLogin = new Date();
    await customer.save();

    const token = generateToken(customer._id, customer.email, customer.vipTier);

    return res.status(200).json({
      success: true,
      message: `Welcome back, ${customer.fullName}!`,
      token,
      customer: {
        id: customer._id,
        fullName: customer.fullName,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        vipTier: customer.vipTier,
        isVip: customer.isVip,
        isVerified: customer.isVerified,
        lastLogin: customer.lastLogin,
        createdAt: customer.createdAt,
      },
    });
  } catch (error) {
    console.error("Luxury login error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ✅ Logout
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

// ✅ Get Profile
exports.getProfile = async (req, res) => {
  try {
    const customer = await Customer.findById(req.user.id)
      .select("-password -loginAttempts -lockUntil")
      .populate("assignedConcierge", "name email phone")
      .populate("appointments", "date time service status")
      .populate("purchaseHistory.productId", "name category price images");

    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    return res.status(200).json({
      success: true,
      customer,
      conciergeAvailable: !!customer.assignedConcierge,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ✅ Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, company, designation, address, preferences } = req.body;

    const updates = {};
    if (firstName) updates.firstName = firstName.trim();
    if (lastName) updates.lastName = lastName.trim();
    if (phone) updates.phone = String(phone).trim();
    if (company) updates.company = company.trim();
    if (designation) updates.designation = designation.trim();

    if (address) {
      updates.address = {
        primary: {
          street: address.primary?.street?.trim() || "",
          city: address.primary?.city?.trim() || "",
          state: address.primary?.state?.trim() || "",
          country: address.primary?.country?.trim() || "",
          zipCode: address.primary?.zipCode?.trim() || "",
        },
        secondary: {
          street: address.secondary?.street?.trim() || "",
          city: address.secondary?.city?.trim() || "",
          state: address.secondary?.state?.trim() || "",
          country: address.secondary?.country?.trim() || "",
          zipCode: address.secondary?.zipCode?.trim() || "",
        },
      };
    }

    if (preferences) {
      updates.preferences = {
        ...preferences,
        style: preferences.style || [],
        materials: preferences.materials || [],
        colors: preferences.colors || [],
        budgetRange: preferences.budgetRange || { min: 0, max: 0 },
      };
    }

    const customer = await Customer.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password -loginAttempts -lockUntil");

    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      customer,
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

// ✅ Upgrade VIP Tier (Admin/Concierge use: /customers/:customerId/upgrade-tier)
exports.upgradeVipTier = async (req, res) => {
  try {
    const { customerId } = req.params; // ✅ upgrade other customer
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
      return res
        .status(400)
        .json({ success: false, message: `Cannot downgrade from ${customer.vipTier} to ${vipTier}` });
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

    const token = generateToken(customer._id, customer.email, customer.vipTier);

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

// ✅ Concierge request (placeholder)
exports.requestConcierge = async (req, res) => {
  try {
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
      message:
        "Concierge service request received. Our team will contact you within 24 hours.",
      requestId: `CON-${Date.now()}`,
      estimatedResponse: "24 hours",
      contactPerson: customer.assignedConcierge ? "Your assigned concierge" : "Our luxury support team",
    });
  } catch (error) {
    console.error("Concierge request error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};
