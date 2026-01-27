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
      "password",
      
    ];

    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    // Check if manufacturer already exists
    const existingManufacturer = await Manufacturer.findOne({
      $or: [
        { email: email.toLowerCase().trim() },
        { panNumber: panNumber.toUpperCase().trim() },
        { gstNumber: gstNumber ? gstNumber.toUpperCase().trim() : null },
      ].filter(condition => condition !== null),
    });

    if (existingManufacturer) {
      return res.status(409).json({
        success: false,
        message: "Manufacturer already registered with this email, PAN, or GST",
      });
    }

    // Check if passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
      });
    }

    // Password strength validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create manufacturer with all fields
    const manufacturer = await Manufacturer.create({
      companyName: companyName.trim(),
      legalName: legalName.trim(),
      companyType: companyType,
      telephone: telephone ? telephone.trim() : "",
      mobile: mobile.trim(),
      email: email.toLowerCase().trim(),
      country: country.trim(),
      city: city.trim(),
      businessNature: businessNature,
      yearEstablished: parseInt(yearEstablished),
      companyRelation: companyRelation || "",
      fullTimeEmployees: fullTimeEmployees ? parseInt(fullTimeEmployees) : 0,
      panNumber: panNumber.toUpperCase().trim(),
      gstNumber: gstNumber ? gstNumber.toUpperCase().trim() : "",
      itemsInterested: itemsInterested.trim(),
      legalDisputes: legalDisputes ? legalDisputes.trim() : "",
      countriesExported: countriesExported ? countriesExported.trim() : "",
      moreDescription: moreDescription ? moreDescription.trim() : "",
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
      message: "Manufacturer registration successful. Your account is pending verification.",
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
      },
    });
  } catch (error) {
    console.error("Manufacturer signup error:", error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
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