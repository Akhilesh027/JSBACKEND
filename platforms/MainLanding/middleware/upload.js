const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/\s+/g, "-");
    cb(null, `${base}-${Date.now()}${ext}`);
  },
});

// File filter: only images and PDFs
const fileFilter = (req, file, cb) => {
  const allowed = file.mimetype === "application/pdf" || file.mimetype.startsWith("image/");
  cb(null, allowed);
  // If not allowed, multer will skip the file but NOT throw an error automatically.
  // To reject the whole request, we need to handle it in middleware.
  // But we'll keep it simple and allow skipping.
};

// Multer instance with limits
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    fieldSize: 10 * 1024 * 1024, // 10 MB for other form fields
  },
});

// Export the configured multer and also a helper to handle file filter errors
module.exports = { upload };