const Vendor = require("../models/Vendor");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Document = require("../models/Document");

// Strong password regex
const STRONG_PWD = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

function signToken(vendor) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing in .env");
  return jwt.sign(
    {
      id: vendor._id,
      role: "vendor",
      email: vendor.email,
      status: vendor.status,
    },
    secret,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

// ========== REGISTER VENDOR ==========
exports.registerVendor = async (req, res) => {
  try {
    const {
      vendorName,
      businessName,
      email,
      phone,
      password,
      location,
      category,
      businessDesc,
      gstNo,
      businessType,
      yearsExp,
      servicesOffered,
      projectsCompleted,
      projectNames,
      previousWork,
      professionalExpertise,
    } = req.body;

    if (!vendorName || !businessName || !email || !phone || !password || !location || !category || !businessDesc) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    if (!STRONG_PWD.test(password)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters, include uppercase, lowercase, number, and special character (@$!%*?&)",
      });
    }

    const existing = await Vendor.findOne({
      $or: [{ email: email.toLowerCase().trim() }, { phone: phone.trim() }],
    });
    if (existing) {
      return res.status(400).json({ success: false, message: "Email or phone already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const portfolioFiles = req.files?.portfolioFiles?.map((f) => f.path) || [];
    const productImages = req.files?.productImages?.map((f) => f.path) || [];

    const vendor = new Vendor({
      vendorName,
      businessName,
      gstNo: gstNo || "",
      businessType: businessType || "",
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      password: hashedPassword,
      location,
      yearsExp: Number(yearsExp) || 0,
      category,
      servicesOffered: servicesOffered || "",
      projectsCompleted: Number(projectsCompleted) || 0,
      projectNames: projectNames || "",
      previousWork: previousWork || "",
      professionalExpertise: professionalExpertise || "",
      businessDesc,
      portfolioFiles,
      productImages,
      status: "pending",
    });

    await vendor.save();

    res.status(201).json({
      success: true,
      message: "Vendor registered successfully, pending admin approval",
      vendorId: vendor._id,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ success: false, message: "Registration failed" });
  }
};

// ========== LOGIN VENDOR ==========
exports.loginVendor = async (req, res) => {
  try {
    let { email, phone, password } = req.body;

    if (!email || !phone || !password) {
      return res.status(400).json({ success: false, message: "Email, phone, and password required" });
    }

    email = email.trim().toLowerCase();
    phone = phone.trim();

    const vendor = await Vendor.findOne({ email, phone });
    if (!vendor) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (vendor.status !== "approved") {
      return res.status(403).json({
        success: false,
        message: `Your account is ${vendor.status}. Please wait for admin approval.`,
      });
    }

    const token = signToken(vendor);

    res.status(200).json({
      success: true,
      token,
      vendor: {
        _id: vendor._id,
        vendorName: vendor.vendorName,
        businessName: vendor.businessName,
        email: vendor.email,
        phone: vendor.phone,
        status: vendor.status,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Login failed" });
  }
};

// ========== GET VENDOR PROFILE (public, expects vendorId in query) ==========
exports.getVendorMe = async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }
    const vendor = await Vendor.findById(vendorId).select("-password");
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }
    res.json({ success: true, vendor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ========== LIST VENDORS (public, optionally filtered) ==========
exports.listVendors = async (req, res) => {
  try {
    const { status = "pending", page = 1, limit = 20 } = req.query;
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(parseInt(limit, 10) || 20, 100);
    const skip = (p - 1) * l;

    const query = status ? { status } : {};
    const [items, total] = await Promise.all([
      Vendor.find(query).select("-password").sort({ createdAt: -1 }).skip(skip).limit(l),
      Vendor.countDocuments(query),
    ]);

    res.json({ data: items, pagination: { page: p, limit: l, total } });
  } catch (err) {
    console.error("listVendors error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ========== DOCUMENTS ==========

// Upload vendor documents (expects vendorId in request body)
exports.uploadVendorDocuments = async (req, res) => {
  try {
    const { vendorId, documentName, category } = req.body;
    const files = req.files; // array of uploaded files

    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: "No files uploaded" });
    }

    const savedDocs = [];
    for (const file of files) {
      const doc = await Document.create({
        vendorId,
        documentName: documentName || file.originalname,
        fileName: file.filename,
        filePath: file.path,
        fileSize: file.size,
        category: category || "General",
        mimeType: file.mimetype,
        uploadedAt: new Date(),
      });
      savedDocs.push(doc);
    }

    res.status(201).json({ success: true, documents: savedDocs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
};

// Get all documents of a vendor (expects vendorId in query)
exports.getVendorDocuments = async (req, res) => {
  try {
    const { vendorId } = req.query;
    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required" });
    }
    const documents = await Document.find({ vendorId }).sort({ uploadedAt: -1 });
    res.json({ success: true, documents });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch documents" });
  }
};

// Delete a document (expects vendorId in request body or query – we'll use body for simplicity)
exports.deleteVendorDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { vendorId } = req.body;
    if (!vendorId) {
      return res.status(400).json({ success: false, message: "vendorId required (in request body)" });
    }
    const doc = await Document.findOneAndDelete({ _id: id, vendorId });
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
    // optional: delete the physical file from disk here
    res.json({ success: true, message: "Document deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Delete failed" });
  }
};