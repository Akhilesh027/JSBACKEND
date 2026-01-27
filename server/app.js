require("dotenv").config();
const express = require("express");
const cors = require("cors");

// Import Routes
const AllRoutes = require("../routes/All.routes");
const corsOptions = require("../config/cors");
const helmet  = require("helmet");
const hpp = require("hpp");
const xss = require("xss-clean")

const app = express();

// Middleware
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));
app.set('trust proxy', 1); // Only add this if you are behind a proxy (like Heroku/Cloudflare)


// for dev cors can access all origins 
app.use(cors("*"));

// for production need to use this 
// app.use(cors(corsOptions))


app.disable("x-powered-by"); // Removes X-Powered-By header


// 2. Data Sanitization against XSS
// This will clean req.body, req.query, and req.params
app.use(xss());

// Helmet protects against: XSS ,Clickjacking ,MIME sniffing ,Insecure referrers , Legacy browser exploits
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // 1. By default, only allow things from your own domain
        "default-src": ["'self'"],
        
      
        // 2. Allow inline styles (common in React/Vue/standard CSS)
        // Otherwise, your CSS might not load at all
        "style-src": ["'self'", "'unsafe-inline'"],
        
        // 3. Allow images from your own site and 'data:' URIs (common for small icons)
        "img-src": ["'self'", "data:"],
        

        // 4. Prevent your site from being put in an iframe (Clickjacking protection)
        "frame-ancestors": ["'none'"],
        
        // 5. Disable old/dangerous plugins like Flash
        "object-src": ["'none'"],
        
        // 6. Force everything to HTTPS
        "upgrade-insecure-requests": [],
      },
    },
    // Set this to false for now to avoid issues with basic images
    crossOriginEmbedderPolicy: false, 
  })
);

app.use(hpp()); // Protects against parameter pollution

// Routes
app.use("/", AllRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
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