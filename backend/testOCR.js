const { extractTextFromFile } = require("./src/services/ocrService");
const fs = require("fs");
const path = require("path");
const os = require("os");

(async () => {
  try {
    // Path to your uploaded lab report PDF
    const inputFilePath = "uploads/labs/lab_1775045148459_215582871.pdf";

    console.log("Starting OCR extraction...");
    console.log("Input file:", inputFilePath);

    const extractedText = await extractTextFromFile(inputFilePath);

    console.log("\n=== COMPLETE EXTRACTED TEXT ===\n");
    console.log(extractedText);
    console.log("\n=== END OF EXTRACTED TEXT ===\n");

    // Save to ~/Downloads
    const downloadsDir = path.join(os.homedir(), "Downloads");
    const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const outputFileName = `extracted_lab_report_${dateStr}.txt`;
    const outputPath = path.join(downloadsDir, outputFileName);

    fs.writeFileSync(outputPath, extractedText, "utf-8");

    console.log(`\nFile successfully saved to:`);
    console.log(outputPath);
    console.log(`You can open it with: cat "${outputPath}"  or any text editor`);

  } catch (err) {
    console.error("Error during OCR test:");
    console.error(err.message);
    if (err.stack) console.error(err.stack);
  }
})();
