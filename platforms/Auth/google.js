// controllers/googleAuth.js
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import crypto from "crypto";

import AffordableUser from "../affordable-website/models/affordable_customers.js";
import MidUser from "../midrange-website/models/midrange_customers.js";
import LuxuryUser from "../luxury-website/models/luxury_customers.js";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const pickUserModel = (website) => {
  switch (website) {
    case "affordable":
      return AffordableUser;
    case "mid":
      return MidUser;
    case "luxury":
      return LuxuryUser;
    default:
      return null;
  }
};

// ✅ IMPORTANT: map website -> platform (your schema uses "midrange")
const websiteToPlatform = (website) => {
  if (website === "mid") return "midrange";
  if (website === "luxury") return "luxury";
  return "affordable";
};

function signToken(user, website) {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      website, // affordable|mid|luxury (used by frontend / routing)
      platform: user.platform, // affordable|midrange|luxury (DB truth)
      role: user.role || "customer",
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

const googleAuth = async (req, res) => {
  try {
    const { credential, website } = req.body;

    if (!credential) return res.status(400).json({ error: "Missing credential" });

    const UserModel = pickUserModel(website);
    if (!UserModel) {
      return res.status(400).json({ error: "Invalid website. Use affordable|mid|luxury" });
    }

    const platform = websiteToPlatform(website);

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = (payload?.email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ error: "No email from Google" });

    let user = await UserModel.findOne({ email });

    if (!user) {
      const randomPassword = crypto.randomBytes(24).toString("hex");

      user = await UserModel.create({
        name: payload?.name || "",
        email,
        password: randomPassword, // schema requires password ✅
        platform,                // ✅ VERY IMPORTANT
        role: "customer",        // ✅ ensure
        isActive: true,          // ✅ ensure
        isVerified: true,        // ✅ google email is verified
        lastLogin: new Date(),   // ✅ match normal login
        // avatar: payload?.picture || "",
      });
    } else {
      let changed = false;

      // keep DB consistent with website
      if (!user.platform || user.platform !== platform) {
        user.platform = platform;
        changed = true;
      }

      if (!user.name && payload?.name) {
        user.name = payload.name;
        changed = true;
      }

      user.lastLogin = new Date();
      changed = true;

      if (changed) await user.save();
    }

    const token = signToken(user, website);

    // (cookie optional) - keep if you want
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: "Google login successful",
      website,
      token,
      customer: {
        id: user._id,
        name: user.name || "",
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        platform: user.platform,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    console.error("Google auth error:", err);
    return res.status(500).json({ error: "Google auth failed" });
  }
};

export default googleAuth;