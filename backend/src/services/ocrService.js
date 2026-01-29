const fs = require("fs");
const path = require("path");
const Tesseract = require("tesseract.js");

let pdfjsLib;
try {
  pdfjsLib = require("pdfjs-dist/legacy/build/pdf.mjs");
} catch (err) {
  console.error("Failed to load pdfjs-dist:", err.message);
  throw err;
}

// ================================================
// Worker setup - critical for recent pdfjs-dist versions
// ================================================

// Calculate absolute path to the copied worker file
// Worker setup
const workerFileName = "pdf.worker.min.mjs"; // confirm name matches your ls output

const workerPath = path.resolve(
  __dirname,                    // .../backend/src/services
  "../../public/pdfjs/",        // up 2 levels to backend/ → then public/pdfjs/
  workerFileName
);

// Debug prints – keep these for now
console.log("Current __dirname:", __dirname);
console.log("Resolved worker path:", workerPath);
console.log("Worker file exists?", fs.existsSync(workerPath));

if (!fs.existsSync(workerPath)) {
  console.error(`Worker file missing at: ${workerPath}`);
  console.error("Expected location: backend/public/pdfjs/pdf.worker.min.mjs");
  console.error("Run: npm run postinstall (or manually copy the file)");
  // You can throw or continue depending on preference
  // throw new Error("PDF.js worker not found");
}

// Set it
pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
pdfjsLib.GlobalWorkerOptions.workerPort = null;

console.log(`PDF.js worker configured successfully: ${workerPath}`);

// ================================================
// PDF text extraction (native layer when available)
// ================================================

async function extractTextFromPDF(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }

    const data = new Uint8Array(fs.readFileSync(filePath));
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;

    let fullText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      // Join all text items with space, preserve some structure
      const pageText = content.items.map(item => item.str).join(" ");
      fullText += pageText + "\n\n";
    }

    return fullText.trim() || "[No text extracted from PDF]";
  } catch (err) {
    console.error("PDF extraction failed:", err);
    throw new Error(`PDF parsing error: ${err.message}`);
  }
}

// ================================================
// Main entry point - handles PDF + images
// ================================================

async function extractTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    // Try native PDF extraction first
    try {
      return await extractTextFromPDF(filePath);
    } catch (pdfErr) {
      console.warn("Native PDF extraction failed, falling back to OCR if needed");
      // You could add OCR fallback here for scanned PDFs if desired
      throw pdfErr;
    }
  }

  if ([".jpg", ".jpeg", ".png"].includes(ext)) {
    try {
      const { data: { text } } = await Tesseract.recognize(
        filePath,
        "eng",
        {
          logger: m => console.log(m.progress ? `[Tesseract] ${Math.round(m.progress*100)}%` : m),
        }
      );
      return text.trim() || "[No text recognized in image]";
    } catch (ocrErr) {
      console.error("Tesseract OCR failed:", ocrErr);
      throw new Error(`Image OCR error: ${ocrErr.message}`);
    }
  }

  throw new Error(`Unsupported file format: ${ext}`);
}

module.exports = {
  extractTextFromFile,
};