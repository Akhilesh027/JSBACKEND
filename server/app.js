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

// Body parsers
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
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

// Multer error handling (must be before routes)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "FILE_TOO_LARGE") {
      return res.status(413).json({ success: false, message: "File too large (max 10MB)" });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ success: false, message: `Unexpected field: ${err.field}` });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.message && err.message.includes("Only PDF and images allowed")) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

// Security (helmet + hpp)
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(hpp());

// Routes
app.use("/", AllRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found" });
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