const InteriorInquiry = require("../models/InteriorInquiry");

// 1. Create a new interior inquiry (Public endpoint)
exports.createInquiry = async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      formType,
      bhk,
      plotMeasurements,
      budgetEstimation,
      city,
      locality,
      selectedTier,
      selectedRooms,
      calculatedEstimate,
      notes,
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: "Full name and phone number are required.",
      });
    }

    const newInquiry = await InteriorInquiry.create({
      name: name.trim(),
      phone: phone.trim(),
      email: email ? email.trim() : "",
      formType: formType || "consultation",
      bhk: bhk || "3 BHK",
      plotMeasurements: plotMeasurements ? plotMeasurements.trim() : "",
      budgetEstimation: budgetEstimation ? budgetEstimation.trim() : "",
      city: city ? city.trim() : "Hyderabad",
      locality: locality ? locality.trim() : "",
      selectedTier: selectedTier || "",
      selectedRooms: Array.isArray(selectedRooms) ? selectedRooms : [],
      calculatedEstimate: typeof calculatedEstimate === "number" ? calculatedEstimate : 0,
      notes: notes ? notes.trim() : "",
      status: "new",
    });

    return res.status(201).json({
      success: true,
      message: "Your inquiry has been submitted successfully!",
      data: newInquiry,
    });
  } catch (error) {
    console.error("Error creating interior inquiry:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to submit inquiry",
    });
  }
};

// 2. Get all inquiries with search, filter, pagination (Admin endpoint)
exports.getAllInquiries = async (req, res) => {
  try {
    const {
      status,
      formType,
      bhk,
      search,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    const query = {};

    if (status && status !== "all") {
      query.status = status;
    }

    if (formType && formType !== "all") {
      query.formType = formType;
    }

    if (bhk && bhk !== "all") {
      query.bhk = bhk;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { email: searchRegex },
        { locality: searchRegex },
        { city: searchRegex },
      ];
    }

    const pageNumber = parseInt(page, 10) || 1;
    const pageSize = parseInt(limit, 10) || 20;
    const skip = (pageNumber - 1) * pageSize;
    const sortOrder = order === "asc" ? 1 : -1;

    const [inquiries, totalCount] = await Promise.all([
      InteriorInquiry.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      InteriorInquiry.countDocuments(query),
    ]);

    return res.status(200).json({
      success: true,
      data: inquiries,
      pagination: {
        total: totalCount,
        page: pageNumber,
        limit: pageSize,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching interior inquiries:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch inquiries",
    });
  }
};

// 3. Get metrics & stats summary (Admin endpoint)
exports.getInquiryStats = async (req, res) => {
  try {
    const [total, newCount, inDiscussion, converted, scheduled] = await Promise.all([
      InteriorInquiry.countDocuments(),
      InteriorInquiry.countDocuments({ status: "new" }),
      InteriorInquiry.countDocuments({ status: "in_discussion" }),
      InteriorInquiry.countDocuments({ status: "converted" }),
      InteriorInquiry.countDocuments({ status: "scheduled" }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        total,
        new: newCount,
        inDiscussion,
        converted,
        scheduled,
      },
    });
  } catch (error) {
    console.error("Error fetching inquiry stats:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch stats",
    });
  }
};

// 4. Get a single inquiry by ID
exports.getInquiryById = async (req, res) => {
  try {
    const { id } = req.params;
    const inquiry = await InteriorInquiry.findById(id);

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: inquiry,
    });
  } catch (error) {
    console.error("Error fetching inquiry details:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch inquiry details",
    });
  }
};

// 5. Update inquiry status or admin notes (Admin endpoint)
exports.updateInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes, notes } = req.body;

    const updates = {};
    if (status) updates.status = status;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;
    if (notes !== undefined) updates.notes = notes;

    const updated = await InteriorInquiry.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Inquiry updated successfully",
      data: updated,
    });
  } catch (error) {
    console.error("Error updating inquiry:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update inquiry",
    });
  }
};

// 6. Delete inquiry (Admin endpoint)
exports.deleteInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await InteriorInquiry.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Inquiry not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Inquiry deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting inquiry:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to delete inquiry",
    });
  }
};
