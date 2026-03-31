function normalizeLabText(rawText) {
  if (!rawText) return "";

  return rawText
    // Remove excessive whitespace
    .replace(/\s+/g, " ")

    // Remove common noise phrases
    .replace(/END OF REPORT/gi, "")
    .replace(/Patient Name.*?Print Date.*?/gi, "")
    .replace(/Ref By.*?/gi, "")
    .replace(/Page \d+ of \d+/gi, "")

    // Normalize units spacing
    .replace(/mg\/dL/gi, "mg/dL")
    .replace(/ng\/mL/gi, "ng/mL")
    .replace(/pg\/mL/gi, "pg/mL")

    .trim();
}

module.exports = { normalizeLabText };
