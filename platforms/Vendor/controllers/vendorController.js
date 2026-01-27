const Vendor = require("../models/Vendor");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// strong password: min 8, 1 uppercase, 1 lowercase, 1 number, 1 symbol
const STRONG_PWD =
  /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

function signToken(vendor) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing in .env");

  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";

  // payload (keep it small)
  return jwt.sign(
    {
      id: vendor._id,
      role: "vendor",
      email: vendor.email,
      status: vendor.status,
    },
    secret,
    { expiresIn }
  );
}

// ✅ REGISTER
exports.registerVendor = async (req, res) => {
  try {
    const file = req.file;

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
      estYear,
      relation,
      employees,
      pan,
      gst,
      items,
      legalDisputes,
      exportCountries,
      description,
      agree,
      password, // ✅ added
    } = req.body;

    const required = {
      companyName,
      legalName,
      companyType,
      mobile,
      email,
      country,
      city,
      businessNature,
      estYear,
      relation,
      employees,
      pan,
      gst,
      items,
      legalDisputes,
      exportCountries,
      description,
      password,
    };

    for (const [k, v] of Object.entries(required)) {
      if (!String(v ?? "").trim()) {
        return res.status(400).json({ message: `${k} is required` });
      }
    }

    if (agree !== "true") {
      return res.status(400).json({ message: "Declaration is required" });
    }

    const year = Number(estYear);
    const thisYear = new Date().getFullYear();
    if (!Number.isFinite(year) || year < 1900 || year > thisYear) {
      return res.status(400).json({ message: "Invalid establishment year" });
    }

    const emailLower = String(email).toLowerCase().trim();
    if (!/^\S+@\S+\.\S+$/.test(emailLower)) {
      return res.status(400).json({ message: "Invalid email" });
    }

    if (!STRONG_PWD.test(String(password))) {
      return res.status(400).json({
        message:
          "Password must be min 8 chars and include uppercase, lowercase, number & symbol",
      });
    }

    const existing = await Vendor.findOne({
      $or: [{ email: emailLower }, { mobile: String(mobile).trim() }],
    });

    if (existing) {
      return res.status(409).json({
        message:
          existing.email === emailLower
            ? "Email already registered"
            : "Mobile already registered",
      });
    }

    const documentUrl = file ? `/uploads/vendors/${file.filename}` : "";

    const hashedPassword = await bcrypt.hash(String(password), 10);

    const vendor = await Vendor.create({
      companyName: String(companyName).trim(),
      legalName: String(legalName).trim(),
      companyType: String(companyType).trim(),
      telephone: String(telephone || "").trim(),
      mobile: String(mobile).trim(),
      email: emailLower,
      country: String(country).trim(),
      city: String(city).trim(),
      businessNature: String(businessNature).trim(),
      estYear: year,
      relation: String(relation).trim(),
      employees: String(employees).trim(),
      pan: String(pan).trim().toUpperCase(),
      gst: String(gst).trim().toUpperCase(),
      items: String(items).trim(),
      legalDisputes: String(legalDisputes).trim(),
      exportCountries: String(exportCountries).trim(),
      description: String(description).trim(),
      documentUrl,
      status: "pending",
      password: hashedPassword,
    });

    return res.status(201).json({
      message: "Vendor registration submitted",
      data: { id: vendor._id, status: vendor.status },
    });
  } catch (err) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0] || "field";
      return res.status(409).json({ message: `${field} already exists` });
    }

    console.error("registerVendor error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ LOGIN (Vendor)
exports.loginVendor = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const emailLower = String(email).toLowerCase().trim();

    // IMPORTANT: if your Vendor schema has password select:false, then use:
    // Vendor.findOne({ email: emailLower }).select("+password")
    const vendor = await Vendor.findOne({ email: emailLower });

    if (!vendor) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(String(password), String(vendor.password));
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // optional: block login until approved
    // if (vendor.status !== "approved") {
    //   return res.status(403).json({ message: "Vendor not approved yet" });
    // }

    const token = signToken(vendor);

    return res.json({
      message: "Login successful",
      token,
      user: {
        id: vendor._id,
        companyName: vendor.companyName,
        email: vendor.email,
        mobile: vendor.mobile,
        status: vendor.status,
      },
    });
  } catch (err) {
    console.error("loginVendor error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
exports.getVendorMe = async (req, res) => {
  try {
    // req.vendor comes from protectVendor middleware
    return res.json({
      user: req.vendor,
    });
  } catch (err) {
    console.error("getVendorMe error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// ✅ LIST (Admin use)
exports.listVendors = async (req, res) => {
  try {
    const { status = "pending", page = 1, limit = 20 } = req.query;

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const skip = (p - 1) * l;

    const query = status ? { status } : {};

    const [items, total] = await Promise.all([
      Vendor.find(query)
        .select("-password") // ✅ hide password
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(l),
      Vendor.countDocuments(query),
    ]);

    res.json({ data: items, pagination: { page: p, limit: l, total } });
  } catch (err) {
    console.error("listVendors error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
