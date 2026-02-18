// server/src/utils/slugify.js
module.exports = function slugify(s = "") {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};
