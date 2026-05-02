const fs = require("fs");
const path = require("path");
const Vendor = require("../models/Vendor");

// Helper to ensure upload directory exists
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// GET /api/vendors/portfolio
exports.getPortfolio = async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor._id).select("portfolio");
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }
    // Ensure default structure if empty
    const portfolio = vendor.portfolio || {};
    const defaultStats = {
      projectsDelivered: "120+",
      yearsExperience: "10+",
      partners: "25+",
      satisfaction: "100%"
    };
    const stats = portfolio.stats || defaultStats;
    // Convert stats object to array for frontend display
    const statsArray = [
      { title: "Projects Delivered", value: stats.projectsDelivered },
      { title: "Years of Experience", value: stats.yearsExperience },
      { title: "Trusted Manufacturing Partners", value: stats.partners },
      { title: "Client Satisfaction Focus", value: stats.satisfaction }
    ];
    res.json({
      success: true,
      portfolio: {
        videos: portfolio.videos || [],
        images: portfolio.images || [],
        testimonials: portfolio.testimonials || [],
        stats: statsArray
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// PUT /api/vendors/portfolio (bulk update)
exports.updatePortfolio = async (req, res) => {
  try {
    const { videos, images, testimonials } = req.body;
    const update = {};
    if (videos) update["portfolio.videos"] = videos;
    if (images) update["portfolio.images"] = images;
    if (testimonials) update["portfolio.testimonials"] = testimonials;
    const vendor = await Vendor.findByIdAndUpdate(
      req.vendor._id,
      { $set: update },
      { new: true }
    );
    res.json({ success: true, portfolio: vendor.portfolio });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

// POST /api/vendors/portfolio/video
// Fields: "video" (file), "title", "videoIndex" (optional, to replace existing)
exports.addOrUpdateVideo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No video file uploaded" });
    }
    const { title, videoIndex } = req.body;
    const vendor = await Vendor.findById(req.vendor._id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }
    // Ensure portfolio object exists
    if (!vendor.portfolio) vendor.portfolio = {};
    if (!vendor.portfolio.videos) vendor.portfolio.videos = [];

    // Save file to disk (optional: use cloud storage)
    const uploadDir = "uploads/portfolio/videos";
    ensureDir(uploadDir);
    const fileName = `${Date.now()}-${req.file.originalname}`;
    const filePath = path.join(uploadDir, fileName);
    fs.renameSync(req.file.path, filePath); // move from temp location
    const fileUrl = filePath.replace(/\\/g, "/");

    const newVideo = { title: title || "Untitled Video", url: fileUrl };

    if (videoIndex !== undefined && vendor.portfolio.videos[videoIndex]) {
      // Replace existing video
      vendor.portfolio.videos[videoIndex] = newVideo;
    } else {
      // Add new video
      vendor.portfolio.videos.push(newVideo);
    }
    await vendor.save();

    res.json({ success: true, videoUrl: fileUrl, videos: vendor.portfolio.videos });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Video upload failed" });
  }
};

// POST /api/vendors/portfolio/image
// Fields: "image" (file), "imageIndex" (optional), "title" (optional)
exports.addOrUpdateImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file uploaded" });
    }
    const { title, imageIndex } = req.body;
    const vendor = await Vendor.findById(req.vendor._id);
    if (!vendor) {
      return res.status(404).json({ success: false, message: "Vendor not found" });
    }
    if (!vendor.portfolio) vendor.portfolio = {};
    if (!vendor.portfolio.images) vendor.portfolio.images = [];

    const uploadDir = "uploads/portfolio/images";
    ensureDir(uploadDir);
    const fileName = `${Date.now()}-${req.file.originalname}`;
    const filePath = path.join(uploadDir, fileName);
    fs.renameSync(req.file.path, filePath);
    const fileUrl = filePath.replace(/\\/g, "/");

    const newImage = { title: title || "Portfolio Image", url: fileUrl };

    if (imageIndex !== undefined && vendor.portfolio.images[imageIndex]) {
      vendor.portfolio.images[imageIndex] = newImage;
    } else {
      vendor.portfolio.images.push(newImage);
    }
    await vendor.save();

    res.json({ success: true, imageUrl: fileUrl, images: vendor.portfolio.images });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Image upload failed" });
  }
};

// PUT /api/vendors/portfolio/testimonials
exports.updateTestimonials = async (req, res) => {
  try {
    const { testimonials } = req.body;
    if (!Array.isArray(testimonials)) {
      return res.status(400).json({ success: false, message: "Testimonials must be an array" });
    }
    const vendor = await Vendor.findByIdAndUpdate(
      req.vendor._id,
      { $set: { "portfolio.testimonials": testimonials } },
      { new: true }
    );
    res.json({ success: true, testimonials: vendor.portfolio.testimonials });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Update failed" });
  }
};

// DELETE /api/vendors/portfolio/video/:index
exports.deleteVideo = async (req, res) => {
  try {
    const index = parseInt(req.params.index);
    const vendor = await Vendor.findById(req.vendor._id);
    if (!vendor || !vendor.portfolio?.videos || !vendor.portfolio.videos[index]) {
      return res.status(404).json({ success: false, message: "Video not found" });
    }
    // Optional: delete the physical file
    const videoUrl = vendor.portfolio.videos[index].url;
    if (videoUrl && !videoUrl.includes("youtube.com")) {
      const filePath = path.join(process.cwd(), videoUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    vendor.portfolio.videos.splice(index, 1);
    await vendor.save();
    res.json({ success: true, videos: vendor.portfolio.videos });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Delete failed" });
  }
};