const Manufacturer = require("../models/Manufacturer.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Manufacturer Signup
exports.signup = async (req, res) => {
  try {
    const {
      companyName,
      legalName,
      companyType,
      telephone,
      mobile,
      email,
      country,
      city,
      businessNature,
      yearEstablished,
      companyRelation,
      fullTimeEmployees,
      panNumber,
      gstNumber,
      itemsInterested,
      legalDisputes,
      countriesExported,
      moreDescription,

      // ✅ Bank details
      accountHolderName,
      bankName,
      accountNumber,
      confirmAccountNumber,
      ifscCode,
      branchName,

      password,
      confirmPassword,
      termsAccepted,
    } = req.body;

    // Required fields validation
    const requiredFields = [
      "companyName",
      "legalName",
      "companyType",
      "mobile",
      "email",
      "country",
      "city",
      "businessNature",
      "yearEstablished",
      "panNumber",
      "itemsInterested",

      // ✅ Bank details required
      "accountHolderName",
      "bankName",
      "accountNumber",
      "ifscCode",
      "branchName",

      "password",
    ];

    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Check terms acceptance
    if (!(termsAccepted === true || termsAccepted === "true")) {
      return res.status(400).json({
        success: false,
        message: "Terms and conditions must be accepted",
      });
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Check if bank account numbers match
    if (accountNumber !== confirmAccountNumber) {
      return res.status(400).json({
        success: false,
        message: "Bank account numbers do not match",
      });
    }

    // Password strength validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // Optional: basic year validation
    const parsedYear = parseInt(yearEstablished);
    const currentYear = new Date().getFullYear();
    if (isNaN(parsedYear) || parsedYear < 1900 || parsedYear > currentYear) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid year of establishment",
      });
    }

    // Optional: employee count validation
    const parsedEmployees = fullTimeEmployees ? parseInt(fullTimeEmployees) : 0;
    if (isNaN(parsedEmployees) || parsedEmployees < 0) {
      return res.status(400).json({
        success: false,
        message: "Full-time employees must be 0 or more",
      });
    }

    // Normalize values
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedPan = panNumber.toUpperCase().trim();
    const normalizedGst = gstNumber ? gstNumber.toUpperCase().trim() : "";
    const normalizedIfsc = ifscCode.toUpperCase().trim();

    // Check if manufacturer already exists
    const existingConditions = [
      { email: normalizedEmail },
      { panNumber: normalizedPan },
    ];

    if (normalizedGst) {
      existingConditions.push({ gstNumber: normalizedGst });
    }

    const existingManufacturer = await Manufacturer.findOne({
      $or: existingConditions,
    });

    if (existingManufacturer) {
      return res.status(409).json({
        success: false,
        message: "Manufacturer already registered with this email, PAN, or GST",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create manufacturer with all fields
    const manufacturer = await Manufacturer.create({
      companyName: companyName.trim(),
      legalName: legalName.trim(),
      companyType,
      telephone: telephone ? telephone.trim() : "",
      mobile: mobile.trim(),
      email: normalizedEmail,
      country: country.trim(),
      city: city.trim(),

      businessNature,
      yearEstablished: parsedYear,
      companyRelation: companyRelation || "",
      fullTimeEmployees: parsedEmployees,
      panNumber: normalizedPan,
      gstNumber: normalizedGst,

      itemsInterested: itemsInterested.trim(),
      legalDisputes: legalDisputes ? legalDisputes.trim() : "",
      countriesExported: countriesExported ? countriesExported.trim() : "",
      moreDescription: moreDescription ? moreDescription.trim() : "",

      // ✅ Bank details
      accountHolderName: accountHolderName.trim(),
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      ifscCode: normalizedIfsc,
      branchName: branchName.trim(),

      password: hashedPassword,
      termsAccepted: termsAccepted === "true" || termsAccepted === true,
      termsAcceptedAt: new Date(),
      verificationStatus: "Pending",
      isActive: true,
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        id: manufacturer._id,
        email: manufacturer.email,
        role: manufacturer.role,
      },
      process.env.JWT_SECRET || "BANNU9",
      { expiresIn: "7d" }
    );

    await manufacturer.save();

    res.status(201).json({
      success: true,
      message:
        "Manufacturer registration successful. Your account is pending verification.",
      token,
      manufacturer: {
        id: manufacturer._id,
        companyName: manufacturer.companyName,
        legalName: manufacturer.legalName,
        email: manufacturer.email,
        companyType: manufacturer.companyType,
        verificationStatus: manufacturer.verificationStatus,
        profileCompletion: manufacturer.profileCompletion,
        registrationDate: manufacturer.registrationDate,

        // ✅ Bank preview
        bankDetails: {
          accountHolderName: manufacturer.accountHolderName,
          bankName: manufacturer.bankName,
          accountNumber: manufacturer.maskedAccountNumber,
          ifscCode: manufacturer.ifscCode,
          branchName: manufacturer.branchName,
        },
      },
    });
  } catch (error) {
    console.error("Manufacturer signup error:", error);

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages,
      });
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        message: `Manufacturer with this ${field} already exists`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Manufacturer Login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const manufacturer = await Manufacturer.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!manufacturer) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (!manufacturer.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account is deactivated. Please contact support.",
      });
    }

    const isMatch = await bcrypt.compare(password, manufacturer.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    manufacturer.lastLogin = new Date();
    await manufacturer.save();

    const token = jwt.sign(
      {
        id: manufacturer._id,
        role: manufacturer.role,
        email: manufacturer.email,
      },
      process.env.JWT_SECRET || "BANNU9",
      { expiresIn: "7d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      manufacturer: {
        id: manufacturer._id,
        companyName: manufacturer.companyName,
        legalName: manufacturer.legalName,
        email: manufacturer.email,
        companyType: manufacturer.companyType,
        verificationStatus: manufacturer.verificationStatus,
        profileCompletion: manufacturer.profileCompletion,
        totalOrders: manufacturer.totalOrders,
        totalRevenue: manufacturer.totalRevenue,
        activeProducts: manufacturer.activeProducts,
        factoriesLinked: manufacturer.factoriesLinked,
        registrationDate: manufacturer.registrationDate,
        lastLogin: manufacturer.lastLogin,

        // ✅ Bank preview
        bankDetails: {
          accountHolderName: manufacturer.accountHolderName,
          bankName: manufacturer.bankName,
          accountNumber: manufacturer.maskedAccountNumber,
          ifscCode: manufacturer.ifscCode,
          branchName: manufacturer.branchName,
        },
      },
    });
  } catch (error) {
    console.error("Manufacturer login error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};