require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const hpp = require("hpp");
const xss = require("xss-clean");
const cookieParser = require("cookie-parser");
const path = require("path"); // <-- needed for basename
const multer = require("multer");


// Import Routes
const AllRoutes = require("../routes/All.routes");

const app = express();

// If behind proxy (nginx / cloudflare / heroku)
app.set("trust proxy", 1);

// Body parsers
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.use('/uploads', express.static('uploads'));

// Cookies (needed for res.cookie + reading cookies)
app.use(cookieParser());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ CORS Allowlist
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:8083",
  "http://localhost:8084",
  "http://localhost:8085",
  "http://localhost:8086",
  "http://localhost:8087",
  "http://localhost:5000",

  "https://jsgallormanufacture.jsgallor.com",
  "https://vendor.jsgallor.com",
  "https://www.jsgallor.com",
  "https://jsgallor.com",
  "https://essentialstudio.jsgallor.com",
  "https://signaturespaces.jsgallor.com",
  "https://admin.jsgallor.com",
  "https://celestialiving.jsgallor.com",
];

app.use(
  cors({
    origin: function (origin, cb) {
      // Allow requests with no origin (Postman, curl)
      if (!origin) return cb(null, true);

      if (ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true);
      }

      return cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use((err, req, res, next) => {
  // Handle Multer errors (e.g., file too large, wrong field name, file filter rejection)
  if (err instanceof multer.MulterError) {
    if (err.code === "FILE_TOO_LARGE") {
      return res.status(413).json({ success: false, message: "File too large (max 10MB)" });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ success: false, message: `Unexpected field: ${err.field}` });
    }
    return res.status(400).json({ success: false, message: err.message });
  }

  // Handle custom file filter errors (if you throw them in fileFilter)
  if (err.message && err.message.includes("Only PDF and images allowed")) {
    return res.status(400).json({ success: false, message: err.message });
  }

  // Pass other errors to default handler
  next(err);
});

// ✅ Preflight must include same config
app.options("*", cors({
  origin: function (origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS: " + origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Security headers (mostly useful if backend serves pages; safe for API too)
app.disable("x-powered-by");
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
  })
);

app.use(xss());
app.use(hpp());

// Routes
app.use("/", AllRoutes);
// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);

  // CORS errors usually come here
  if (String(err.message || "").startsWith("Not allowed by CORS")) {
    return res.status(403).json({
      success: false,
      message: err.message,
    });
  }

  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found",
  });
});

module.exports = app;