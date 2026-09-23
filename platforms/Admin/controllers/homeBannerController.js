// platforms/Admin/controllers/homeBannerController.js
const HomeBanner = require("../models/HomeBanner");

const DEFAULT_PRESETS = {
  affordable: {
    videoBanner: {
      videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-living-room-with-a-modern-interior-design-4820-large.mp4",
      posterUrl: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1600&q=80",
      badge: "✨ Affordable Luxury 2026",
      title: "Design Your Dream Home",
      subtitle: "Experience modern furniture made accessible, stylish, and built to last.",
      ctaText: "Shop Collection",
      ctaLink: "/categories",
      isActive: true,
    },
    dualBanners: [
      {
        bannerIndex: 1,
        imageUrl: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200&q=80",
        badge: "Trending Now",
        title: "Living Room Essentials",
        subtitle: "Premium cushioned sofas starting from ₹14,999",
        ctaText: "Explore Living Room",
        ctaLink: "/categories/living-room",
        isActive: true,
      },
      {
        bannerIndex: 2,
        imageUrl: "https://images.unsplash.com/photo-1617806118233-18e1de247200?w=1200&q=80",
        badge: "Best Value",
        title: "Modern Dining & Kitchen",
        subtitle: "Handcrafted wooden dining sets with durable finish",
        ctaText: "Explore Dining",
        ctaLink: "/categories/dining",
        isActive: true,
      },
    ],
  },
  midrange: {
    videoBanner: {
      videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-modern-apartment-living-room-interior-design-4825-large.mp4",
      posterUrl: "https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1600&q=80",
      badge: "🌿 Crafted For Modern Homes",
      title: "Elevated Mid-Range Elegance",
      subtitle: "Curated Scandinavian & Contemporary pieces for refined spaces.",
      ctaText: "Discover Pieces",
      ctaLink: "/products",
      isActive: true,
    },
    dualBanners: [
      {
        bannerIndex: 1,
        imageUrl: "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=1200&q=80",
        badge: "Signature Collection",
        title: "Architectural Loungers & Sofas",
        subtitle: "Ergonomic comfort tailored with sustainable teakwood",
        ctaText: "View Collection",
        ctaLink: "/products",
        isActive: true,
      },
      {
        bannerIndex: 2,
        imageUrl: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&q=80",
        badge: "New Arrival",
        title: "Zen Bedroom Sanctuary",
        subtitle: "Minimalist bed frames and smart acoustic headboards",
        ctaText: "View Bedrooms",
        ctaLink: "/products",
        isActive: true,
      },
    ],
  },
};

/**
 * GET /api/public/banners/:website
 * or GET /api/admin/banners/:website
 */
exports.getBannersByWebsite = async (req, res) => {
  try {
    const website = String(req.params.website || "").toLowerCase();
    if (!["affordable", "midrange", "luxury"].includes(website)) {
      return res.status(400).json({ success: false, message: "Invalid website parameter" });
    }

    let banner = await HomeBanner.findOne({ website });

    if (!banner) {
      const preset = DEFAULT_PRESETS[website] || DEFAULT_PRESETS.affordable;
      banner = await HomeBanner.create({
        website,
        videoBanner: preset.videoBanner,
        dualBanners: preset.dualBanners,
        updatedBy: "System Seed",
      });
    }

    return res.status(200).json({
      success: true,
      data: banner,
    });
  } catch (error) {
    console.error("Error fetching banners:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch banners", error: error.message });
  }
};

/**
 * PUT /api/admin/banners/:website
 * Admin can update video banner (via URL) and dual banners (with images/dimensions)
 */
exports.updateBannersByWebsite = async (req, res) => {
  try {
    const website = String(req.params.website || "").toLowerCase();
    if (!["affordable", "midrange", "luxury"].includes(website)) {
      return res.status(400).json({ success: false, message: "Invalid website parameter" });
    }

    const { videoBanner, dualBanners } = req.body;

    let banner = await HomeBanner.findOne({ website });
    if (!banner) {
      banner = new HomeBanner({ website });
    }

    if (videoBanner) {
      banner.videoBanner = {
        videoUrl: videoBanner.videoUrl !== undefined ? videoBanner.videoUrl : banner.videoBanner?.videoUrl,
        posterUrl: videoBanner.posterUrl !== undefined ? videoBanner.posterUrl : banner.videoBanner?.posterUrl,
        badge: videoBanner.badge !== undefined ? videoBanner.badge : banner.videoBanner?.badge,
        title: videoBanner.title !== undefined ? videoBanner.title : banner.videoBanner?.title,
        subtitle: videoBanner.subtitle !== undefined ? videoBanner.subtitle : banner.videoBanner?.subtitle,
        ctaText: videoBanner.ctaText !== undefined ? videoBanner.ctaText : banner.videoBanner?.ctaText,
        ctaLink: videoBanner.ctaLink !== undefined ? videoBanner.ctaLink : banner.videoBanner?.ctaLink,
        isActive: videoBanner.isActive !== undefined ? Boolean(videoBanner.isActive) : true,
      };
    }

    if (Array.isArray(dualBanners) && dualBanners.length > 0) {
      banner.dualBanners = dualBanners.slice(0, 2).map((item, idx) => ({
        bannerIndex: idx + 1,
        imageUrl: item.imageUrl || "",
        badge: item.badge || "",
        title: item.title || "",
        subtitle: item.subtitle || "",
        ctaText: item.ctaText || "Shop Now",
        ctaLink: item.ctaLink || "/categories",
        isActive: item.isActive !== undefined ? Boolean(item.isActive) : true,
      }));
    }

    banner.updatedBy = (req.admin && req.admin.email) || "Admin";
    await banner.save();

    return res.status(200).json({
      success: true,
      message: `Banners for ${website} updated successfully`,
      data: banner,
    });
  } catch (error) {
    console.error("Error updating banners:", error);
    return res.status(500).json({ success: false, message: "Failed to update banners", error: error.message });
  }
};

/**
 * POST /api/admin/banners/upload
 * Handles banner image uploads via Cloudinary
 * Optionally auto-updates HomeBanner in DB if website and bannerIndex are passed
 */
exports.uploadBannerImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided" });
    }

    const imageUrl = req.file.path || req.file.secure_url || req.file.url;
    const website = (req.query.website || req.body.website || "").toLowerCase();
    const bannerIndex = parseInt(req.query.bannerIndex || req.body.bannerIndex, 10);

    // If website & bannerIndex are provided, auto-save to database immediately
    if (website && ["affordable", "midrange", "luxury"].includes(website) && (bannerIndex === 1 || bannerIndex === 2)) {
      let banner = await HomeBanner.findOne({ website });
      if (!banner) {
        banner = new HomeBanner({ website });
      }

      if (!Array.isArray(banner.dualBanners) || banner.dualBanners.length < 2) {
        banner.dualBanners = [
          { bannerIndex: 1, imageUrl: "", ctaLink: "/categories", isActive: true },
          { bannerIndex: 2, imageUrl: "", ctaLink: "/categories", isActive: true },
        ];
      }

      const targetIdx = bannerIndex - 1;
      banner.dualBanners[targetIdx].imageUrl = imageUrl;
      banner.dualBanners[targetIdx].isActive = true;
      banner.updatedBy = "Admin Upload";
      await banner.save();

      return res.status(200).json({
        success: true,
        message: `Banner ${bannerIndex} uploaded and saved to ${website} website`,
        imageUrl,
        data: banner,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Banner image uploaded successfully",
      imageUrl,
    });
  } catch (error) {
    console.error("Error uploading banner image:", error);
    return res.status(500).json({ success: false, message: "Image upload failed", error: error.message });
  }
};
