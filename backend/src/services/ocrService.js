const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const Tesseract = require("tesseract.js");

// ======================================
// PDF TEXT EXTRACTION (STABLE VERSION)
// ======================================

async function extractTextFromPDF(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);

    return data.text.trim() || "[No text extracted]";
  } catch (err) {
    console.error("PDF extraction failed:", err);
    throw new Error(`PDF parsing error: ${err.message}`);
  }
}

// ======================================
// IMAGE OCR
// ======================================

async function extractTextFromImage(filePath) {
  try {
    const { data: { text } } = await Tesseract.recognize(
      filePath,
      "eng",
      {
        logger: m =>
          m.progress
            ? `[Tesseract] ${Math.round(m.progress * 100)}%`
            : m,
      }
    );

    return text.trim() || "[No text recognized]";
  } catch (err) {
    console.error("OCR failed:", err);
    throw new Error(`OCR error: ${err.message}`);
  }
}

// ======================================
// MAIN ENTRY
// ======================================

async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    return await extractTextFromPDF(filePath);
  }

  if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    return await extractTextFromImage(filePath);
  }

  throw new Error(`Unsupported file format: ${ext}`);
}

module.exports = {
  extractTextFromFile,
};