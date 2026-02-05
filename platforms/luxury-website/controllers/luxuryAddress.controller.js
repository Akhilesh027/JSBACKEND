const Customer = require("../models/luxury_customers");

exports.getAddresses = async (req, res) => {
  const customer = await Customer.findById(req.user.id).select("addresses");
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

  return res.json({ success: true, addresses: customer.addresses || [] });
};

exports.addAddress = async (req, res) => {
  const payload = req.body;

  if (!payload?.addressLine1 || !payload?.city || !payload?.state || !payload?.pincode) {
    return res.status(400).json({ success: false, message: "addressLine1, city, state, pincode required" });
  }

  const customer = await Customer.findById(req.user.id);
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

  // If first address => default
  const isFirst = !customer.addresses || customer.addresses.length === 0;
  const isDefault = payload.isDefault === true || isFirst;

  // If setting default, unset others
  if (isDefault && customer.addresses?.length) {
    customer.addresses = customer.addresses.map((a) => ({ ...a.toObject(), isDefault: false }));
  }

  customer.addresses.push({
    label: payload.label || "Home",
    firstName: payload.firstName || customer.firstName,
    lastName: payload.lastName || customer.lastName,
    email: payload.email || customer.email,
    phone: payload.phone || customer.phone,
    addressLine1: payload.addressLine1,
    addressLine2: payload.addressLine2 || "",
    city: payload.city,
    state: payload.state,
    pincode: payload.pincode,
    country: payload.country || "India",
    isDefault,
  });

  await customer.save();

  return res.status(201).json({ success: true, message: "Address added", addresses: customer.addresses });
};

exports.updateAddress = async (req, res) => {
  const { addressId } = req.params;
  const payload = req.body;

  const customer = await Customer.findById(req.user.id);
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

  const idx = customer.addresses.findIndex((a) => String(a._id) === String(addressId));
  if (idx === -1) return res.status(404).json({ success: false, message: "Address not found" });

  const current = customer.addresses[idx].toObject();

  // If set default true -> unset others
  if (payload.isDefault === true) {
    customer.addresses = customer.addresses.map((a) => ({ ...a.toObject(), isDefault: false }));
  }

  customer.addresses[idx] = {
    ...current,
    ...payload,
    isDefault: payload.isDefault === true ? true : current.isDefault,
  };

  await customer.save();
  return res.json({ success: true, message: "Address updated", addresses: customer.addresses });
};

exports.setDefaultAddress = async (req, res) => {
  const { addressId } = req.params;

  const customer = await Customer.findById(req.user.id);
  if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });

  const found = customer.addresses.find((a) => String(a._id) === String(addressId));
  if (!found) return res.status(404).json({ success: false, message: "Address not found" });

  customer.addresses = customer.addresses.map((a) => ({
    ...a.toObject(),
    isDefault: String(a._id) === String(addressId),
  }));

  await customer.save();
  return res.json({ success: true, message: "Default address set", addresses: customer.addresses });
};
