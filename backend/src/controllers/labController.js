const { extractTextFromFile } = require("../services/ocrService");
const { normalizeLabText } = require("../services/labTextNormalizer");
const { parseLabValues } = require("../services/labParser");
const { extractTables } = require("../services/pdfTableService");
const { parseLabTables } = require("../services/labTableParser");
const { parseLabPDF } = require("../services/layoutLabParser");

exports.analyzeLabReport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const result = await parseLabPDF(req.file.path);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};