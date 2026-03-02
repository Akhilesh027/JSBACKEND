require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const hpp = require("hpp");
const xss = require("xss-clean");
const cookieParser = require("cookie-parser");

// Import Routes
const AllRoutes = require("../routes/All.routes");

const app = express();

// If behind proxy (nginx / cloudflare / heroku)
app.set("trust proxy", 1);

// Body parsers
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

// Cookies (needed for res.cookie + reading cookies)
app.use(cookieParser());

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

  "http://manufacture.jsgallor.com",
  "http://vendor.jsgallor.com",
  "http://essentialstudio.jsgallor.com",
  "http://signaturespaces.jsgallor.com",
  "http://admin.jsgallor.com",
  "http://celestialiving.jsgallor.com",

  
];

// ✅ Single CORS middleware (credentials-friendly)
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