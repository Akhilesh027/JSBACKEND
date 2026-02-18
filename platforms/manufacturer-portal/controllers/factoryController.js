const Factory = require("../models/Factory");

// Get All Factories
exports.getAllFactories = async (req, res) => {
  try {
    const factories = await Factory.find({ manufacturer: req.user.id });
    res.json({ success: true, factories });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Create Factory
exports.createFactory = async (req, res) => {
  try {
    const { name, location, capacity, manager } = req.body;
    if (!name || !location) {
      return res.status(400).json({ success: false, message: "Name and location are required" });
    }

    const factory = await Factory.create({
      manufacturer: req.user.id,
      name,
      location,
      capacity,
      manager,
    });

    res.status(201).json({ success: true, factory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Update Factory
exports.updateFactory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, capacity, manager } = req.body;

    const factory = await Factory.findOne({ _id: id, manufacturer: req.user.id });
    if (!factory) return res.status(404).json({ success: false, message: "Factory not found" });

    factory.name = name ?? factory.name;
    factory.location = location ?? factory.location;
    factory.capacity = capacity ?? factory.capacity;
    factory.manager = manager ?? factory.manager;

    await factory.save();
    res.json({ success: true, factory });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Delete Factory
exports.deleteFactory = async (req, res) => {
  try {
    const { id } = req.params;
    const factory = await Factory.findOneAndDelete({ _id: id, manufacturer: req.user.id });
    if (!factory) return res.status(404).json({ success: false, message: "Factory not found" });

    res.json({ success: true, message: "Factory deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};