const transporter = require("../../platforms/Admin/utils/mailer");
const { sendWhatsAppMessage } = require("./whatsappService");

/**
 * Asynchronously sends estimate notifications:
 * 1. Admin Email with full structured data and file links.
 * 2. User WhatsApp message acknowledging "Form received, our team will get in touch".
 * 3. User Email acknowledging "Form received, our team will get in touch".
 */
function sendEstimateNotifications(estimate) {
  setImmediate(async () => {
    try {
      console.log(`🚀 [EstimateNotifications] Starting notifications for estimate: ${estimate._id}...`);
      await processEstimateNotifications(estimate);
    } catch (err) {
      console.error(`❌ [EstimateNotifications] Error processing estimate ${estimate._id}:`, err.message);
    }
  });
}

async function processEstimateNotifications(estimate) {
  if (!estimate) return;

  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "directorjsgallor@gmail.com";
  const publicApiBase = process.env.PUBLIC_API_URL || "https://api.jsgallor.com";

  const id = String(estimate._id).slice(-8).toUpperCase();
  const name = estimate.name || "Customer";
  const phone = estimate.phone || "";
  const email = estimate.email || "";
  const city = estimate.city || "Not specified";
  const floorplan = estimate.floorplan || "Not specified";
  const purpose = estimate.purpose || "Not specified";
  const propertyType = estimate.propertyType || "Not specified";
  const budgetRange = estimate.budgetRange || "Not specified";
  const plotSize = estimate.plotSize || "Not specified";

  // Identify whether this is interior or furniture based on populated fields
  const isInterior =
    (estimate.kitchen || 0) +
    (estimate.wardrobes || 0) +
    (estimate.falseCeiling || 0) +
    (estimate.electricalWorks || 0) +
    (estimate.painting || 0) +
    (estimate.curtainsBlinds || 0) +
    (estimate.wallPanelling || 0) +
    (estimate.glassPartitions || 0) +
    (estimate.lighting || 0) >
    0;

  const flowTitle = estimate.flowType === "furniture" || (!isInterior && (estimate.sofaSet || estimate.beds))
    ? "Furniture Estimation"
    : "Interior Estimation";

  // Build service / item breakdown
  const interiorServices = [
    { label: "Modular Kitchen", val: estimate.kitchen },
    { label: "Wardrobes", val: estimate.wardrobes },
    { label: "False Ceiling", val: estimate.falseCeiling },
    { label: "Electrical Works", val: estimate.electricalWorks },
    { label: "Painting", val: estimate.painting },
    { label: "Curtains & Blinds", val: estimate.curtainsBlinds },
    { label: "Wall Panelling", val: estimate.wallPanelling },
    { label: "Glass Partitions", val: estimate.glassPartitions },
    { label: "Lighting", val: estimate.lighting },
  ].filter((s) => Number(s.val || 0) > 0);

  const furnitureItems = [
    { label: "Sofa Set", val: estimate.sofaSet },
    { label: "Beds", val: estimate.beds },
    { label: "Dining Table", val: estimate.diningTable },
    { label: "TV Unit", val: estimate.tvUnit },
    { label: "Center Table", val: estimate.centerTable },
    { label: "Crockery Unit", val: estimate.crockeryUnit },
    { label: "Foyer Console", val: estimate.foyerConsole },
    { label: "Vanity Unit", val: estimate.vanityUnit },
    { label: "Study Unit", val: estimate.studyUnit },
    { label: "Outdoor Furniture", val: estimate.outdoorFurniture },
  ].filter((f) => Number(f.val || 0) > 0);

  // File links
  const makeFullUrl = (relUrl) => {
    if (!relUrl) return null;
    if (String(relUrl).startsWith("http")) return relUrl;
    return `${publicApiBase}${relUrl}`;
  };

  const planFileLink = makeFullUrl(estimate.planFileUrl);
  const pdfLink = makeFullUrl(estimate.floorplanPdfUrl || estimate.floorplanPdfDownloadUrl);
  const imageLinks = (estimate.floorplanImageUrls || []).map(makeFullUrl).filter(Boolean);

  // -------------------------------------------------------------
  // 1. Send Structured Lead Email to Admin
  // -------------------------------------------------------------
  if (transporter && adminEmail) {
    try {
      console.log(`✉️ [EstimateNotifications] Sending admin lead alert to: ${adminEmail}...`);
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: adminEmail,
        subject: `🔔 New Lead: ${flowTitle} from ${name} (${city}) - Ref #${id}`,
        html: `
          <div style="font-family: Arial, Helvetica, sans-serif; max-width: 680px; margin: 0 auto; color: #222; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #8B5A2B; padding: 20px; color: #fff; text-align: center;">
              <h2 style="margin: 0; font-size: 20px;">New Estimation Inquiry - ${flowTitle}</h2>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #f2e3d5;">Inquiry ID: #${id} | Received: ${new Date().toLocaleString("en-IN")}</p>
            </div>

            <div style="padding: 24px;">
              <!-- Lead Contact Details -->
              <h3 style="font-size: 15px; text-transform: uppercase; color: #8B5A2B; border-bottom: 2px solid #8B5A2B; padding-bottom: 6px; margin-top: 0;">
                👤 Customer Contact Details
              </h3>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
                <tr><td style="padding: 6px 0; width: 140px; color: #666;">Name:</td><td><b>${name}</b></td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Phone:</td><td><a href="tel:${phone}" style="color: #0066cc; font-weight: bold;">${phone}</a></td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Email:</td><td>${email ? `<a href="mailto:${email}" style="color: #0066cc;">${email}</a>` : '<span style="color:#888;">Not provided</span>'}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">City:</td><td><b>${city}</b></td></tr>
                <tr><td style="padding: 6px 0; color: #666;">WhatsApp Opt-in:</td><td>${estimate.whatsappUpdates ? '✅ Yes' : '❌ No'}</td></tr>
              </table>

              <!-- Scope & Property Details -->
              <h3 style="font-size: 15px; text-transform: uppercase; color: #8B5A2B; border-bottom: 2px solid #8B5A2B; padding-bottom: 6px;">
                🏡 Property & Budget Details
              </h3>
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
                <tr><td style="padding: 6px 0; width: 140px; color: #666;">Property Configuration:</td><td><b>${floorplan}</b></td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Property Type:</td><td><b>${propertyType}</b></td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Purpose:</td><td><b>${purpose}</b></td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Floorplan Size:</td><td>${plotSize}</td></tr>
                <tr><td style="padding: 6px 0; color: #666;">Budget Range:</td><td><b style="color: #0a7a3a; font-size: 14px;">${budgetRange}</b></td></tr>
              </table>

              <!-- Requirements List -->
              <h3 style="font-size: 15px; text-transform: uppercase; color: #8B5A2B; border-bottom: 2px solid #8B5A2B; padding-bottom: 6px;">
                📦 Required Services & Items
              </h3>
              ${interiorServices.length > 0
            ? `
                <div style="margin-bottom: 12px;">
                  <strong style="color: #444;">Interior Services:</strong>
                  <ul style="margin: 6px 0; padding-left: 20px; font-size: 13px;">
                    ${interiorServices.map((s) => `<li>${s.label}: <b>${s.val}</b></li>`).join("")}
                  </ul>
                </div>
              `
            : ""
          }
              ${furnitureItems.length > 0
            ? `
                <div style="margin-bottom: 12px;">
                  <strong style="color: #444;">Furniture Items:</strong>
                  <ul style="margin: 6px 0; padding-left: 20px; font-size: 13px;">
                    ${furnitureItems.map((f) => `<li>${f.label}: <b>${f.val}</b></li>`).join("")}
                  </ul>
                </div>
              `
            : ""
          }
              ${interiorServices.length === 0 && furnitureItems.length === 0 ? '<p style="font-size:13px;color:#888;">General complete consultation requested.</p>' : ""}

              <!-- Attachments / Floorplan links -->
              <h3 style="font-size: 15px; text-transform: uppercase; color: #8B5A2B; border-bottom: 2px solid #8B5A2B; padding-bottom: 6px;">
                📎 Uploaded Floorplan & Plans
              </h3>
              <div style="font-size: 13px; line-height: 1.8;">
                ${planFileLink ? `<div>📄 <b>2D/3D Plan:</b> <a href="${planFileLink}" target="_blank" style="color: #0066cc;">View / Download Document</a></div>` : ""}
                ${pdfLink ? `<div>📄 <b>Floorplan PDF:</b> <a href="${pdfLink}" target="_blank" style="color: #0066cc;">View / Download PDF</a></div>` : ""}
                ${imageLinks.length > 0
            ? `<div>🖼️ <b>Images (${imageLinks.length}):</b> ${imageLinks
              .map((img, i) => `<a href="${img}" target="_blank" style="color: #0066cc; margin-right: 8px;">Image ${i + 1}</a>`)
              .join(", ")}</div>`
            : ""
          }
                ${!planFileLink && !pdfLink && imageLinks.length === 0 ? '<span style="color:#888;">No files uploaded by client.</span>' : ""}
              </div>

              <div style="margin-top: 30px; padding-top: 14px; border-top: 1px solid #eee; font-size: 11px; color: #777; text-align: center;">
                Generated by JS GALLOR Lead Capture System • <a href="https://admin.jsgallor.com" style="color: #444;">Admin Portal</a>
              </div>
            </div>
          </div>
        `,
      });
      console.log(`✅ [EstimateNotifications] Admin lead email dispatched to ${adminEmail}`);
    } catch (err) {
      console.error(`❌ [EstimateNotifications] Admin email failed:`, err.message);
    }
  }

  // -------------------------------------------------------------
  // 2. Send User WhatsApp Confirmation
  // -------------------------------------------------------------
  if (phone) {
    try {
      console.log(`📱 [EstimateNotifications] Sending WhatsApp acknowledgment to: ${phone}...`);
      const waMessage = `✨ *Estimation Request Received - JS GALLOR*\n\nHello *${name}*,\n\nThank you for choosing *JS GALLOR*! We have successfully received your *${flowTitle}* enquiry.\n\n📋 *Enquiry Ref:* #${id}\n📍 *City:* ${city}\n🏡 *Configuration:* ${floorplan} (${propertyType})\n💰 *Budget Range:* ${budgetRange}\n\nOur specialized design consultants are currently reviewing your floorplan and specifications. *Our team will get in touch with you shortly* to share a tailored estimate and walk you through your dream project!\n\n_Have immediate questions? Reply directly to this chat or email directorjsgallor@gmail.com._`;

      const waRes = await sendWhatsAppMessage(phone, waMessage);
      if (waRes.success) {
        console.log(`✅ [EstimateNotifications] WhatsApp sent to user ${phone}`);
      } else {
        console.warn(`⚠️ [EstimateNotifications] WhatsApp send returned:`, waRes.error);
      }
    } catch (err) {
      console.error(`❌ [EstimateNotifications] User WhatsApp failed:`, err.message);
    }
  }

  // -------------------------------------------------------------
  // 3. Send User Email Confirmation
  // -------------------------------------------------------------
  if (email && transporter) {
    try {
      console.log(`✉️ [EstimateNotifications] Sending user confirmation email to: ${email}...`);
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: `Form Received: Your Estimation Request #${id} - JS GALLOR`,
        html: `
          <div style="font-family: Arial, Helvetica, sans-serif; max-width: 600px; margin: 0 auto; color: #222; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #1a1a1a; padding: 24px; text-align: center; color: #fff;">
              <h1 style="margin: 0; font-size: 22px; letter-spacing: 1px; color: #f4d06f;">JS GALLOR</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; color: #ccc;">Architecture • Interiors • Luxury Living</p>
            </div>

            <div style="padding: 24px;">
              <h2 style="font-size: 18px; color: #111; margin-top: 0;">We've Received Your Request!</h2>
              <p style="font-size: 14px; line-height: 1.6;">Dear <b>${name}</b>,</p>
              <p style="font-size: 14px; line-height: 1.6;">
                Thank you for submitting your <b>${flowTitle}</b> details. We are excited to collaborate on creating an exceptional living space for you.
              </p>

              <div style="background-color: #f9f6f0; border-left: 4px solid #8B5A2B; padding: 14px 18px; border-radius: 4px; margin: 20px 0;">
                <p style="margin: 0 0 6px 0; font-weight: bold; color: #8B5A2B; font-size: 14px;">Next Steps:</p>
                <p style="margin: 0; font-size: 13px; color: #444; line-height: 1.5;">
                  Our expert design team is reviewing your requirements and floorplan. <b>A dedicated interior specialist will get in touch with you shortly</b> with an itemized estimate and design recommendations.
                </p>
              </div>

              <h3 style="font-size: 13px; text-transform: uppercase; color: #777; margin-bottom: 8px;">Enquiry Summary</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 13px; line-height: 1.8;">
                <tr><td style="color: #666; width: 140px;">Reference ID:</td><td><b>#${id}</b></td></tr>
                <tr><td style="color: #666;">City:</td><td>${city}</td></tr>
                <tr><td style="color: #666;">Property Type:</td><td>${floorplan} (${propertyType})</td></tr>
                <tr><td style="color: #666;">Budget Preference:</td><td>${budgetRange}</td></tr>
              </table>

              <div style="margin-top: 30px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #777;">
                <p style="margin: 0;">Questions? Feel free to write to us at <a href="mailto:directorjsgallor@gmail.com" style="color: #8B5A2B;">directorjsgallor@gmail.com</a>.</p>
              </div>
            </div>
          </div>
        `,
      });
      console.log(`✅ [EstimateNotifications] User confirmation email sent to ${email}`);
    } catch (err) {
      console.error(`❌ [EstimateNotifications] User confirmation email failed:`, err.message);
    }
  }

  // -------------------------------------------------------------
  // 4. Send Instant Lead WhatsApp Alert to Admin Phone
  // -------------------------------------------------------------
  const adminPhone = process.env.ADMIN_NOTIFICATION_PHONE || "9550379505";
  if (adminPhone) {
    try {
      console.log(`📱 [EstimateNotifications] Sending admin WhatsApp lead alert to: ${adminPhone}...`);
      const adminWaMsg = `🚨 *NEW ESTIMATION LEAD - JS GALLOR*\n\n📋 *Inquiry:* ${flowTitle} (#${id})\n👤 *Client:* ${name}\n📞 *Phone:* ${phone}\n📧 *Email:* ${email || "Not provided"}\n📍 *City:* ${city}\n🏡 *Property:* ${floorplan} (${propertyType})\n💰 *Budget:* ${budgetRange}\n${planFileLink ? `📄 *Plan File:* ${planFileLink}\n` : ""}\n👉 *Open Admin Portal:* https://admin.jsgallor.com`;

      const adminRes = await sendWhatsAppMessage(adminPhone, adminWaMsg);
      if (adminRes.success) {
        console.log(`✅ [EstimateNotifications] Admin lead WhatsApp alert sent to ${adminPhone}`);
      } else {
        console.warn(`⚠️ [EstimateNotifications] Admin WhatsApp returned failure:`, adminRes.error);
      }
    } catch (adminWaErr) {
      console.error(`❌ [EstimateNotifications] Admin WhatsApp alert failed:`, adminWaErr.message);
    }
  }
}

module.exports = {
  sendEstimateNotifications,
  processEstimateNotifications,
};
