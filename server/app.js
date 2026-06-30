require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const hpp = require("hpp");
const cookieParser = require("cookie-parser");
const path = require("path");
const multer = require("multer");

const AllRoutes = require("../routes/All.routes");

const app = express();
app.set("trust proxy", 1);

// Body parsers — raised to 50MB so large JSON payloads (base64 images, etc.) are not rejected
// Note: multipart/form-data uploads bypass these parsers (multer handles them directly)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// Static files (single line)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// CORS allowlist
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:8083",
  "http://localhost:8084",
  "http://localhost:8085",
  "http://localhost:8086",
  "http://localhost:8087",
  "http://localhost:5000",
  "https://jsvendor.jsgallor.com",
  
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
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Security (helmet + hpp) — must come before routes
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(hpp());

// Routes
app.use("/", AllRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found" });
});

// ✅ Multer error handler — MUST be after routes so it catches upload errors from route handlers
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "FILE_TOO_LARGE") {
      return res.status(413).json({ success: false, message: "File too large (max 10MB per file)" });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ success: false, message: `Unexpected field: ${err.field}` });
    }
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }
  if (err.message && (err.message.includes("Only PDF and images allowed") || err.message.includes("Unsupported file type"))) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (String(err.message || "").startsWith("Not allowed by CORS")) {
    return res.status(403).json({ success: false, message: err.message });
  }
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

module.exports = app;