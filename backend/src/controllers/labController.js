// src/controllers/labController.js
const { extractTextFromFile } = require("../services/ocrService");
const { parseWithAI, generateLabSummary } = require("../services/aiParser");
const fs = require("fs").promises;
const axios = require("axios");

exports.analyzeLabReport = async (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const filePath = req.file.path;

    // Extract raw text
    const rawText = await extractTextFromFile(filePath);

    if (!rawText || rawText.trim().length === 0) {
      await fs.unlink(filePath).catch(() => {});
      return res.status(400).json({ success: false, error: "Could not extract text from the file" });
    }

    // Parse parameters
    const extracted_parameters = await parseWithAI(rawText);

    // Generate patient-friendly summary
    let { summary, disclaimer } = await generateLabSummary(extracted_parameters);

    const targetLang = req.body.lang || 'en';
    if (targetLang !== 'en' && process.env.SARVAM_API_KEY) {
      try {
        console.log(`Translating summary to ${targetLang} via Sarvam AI...`);
        const sarvamResponse = await axios.post('https://api.sarvam.ai/translate', {
          input: summary,
          source_language_code: "en-IN",
          target_language_code: `${targetLang}-IN`,
          speaker_gender: "Male",
          mode: "formal",
          model: "sarvam-translate:v1"
        }, {
          headers: {
            'api-subscription-key': process.env.SARVAM_API_KEY,
            'Content-Type': 'application/json'
          }
        });
        
        if (sarvamResponse.data && sarvamResponse.data.translated_text) {
           summary = sarvamResponse.data.translated_text;
        }
      } catch (transErr) {
        console.error("Sarvam Translation Error:", transErr?.response?.data || transErr.message);
        // Fallback gracefully back to English on failure
      }
    }

    // Clean up file
    await fs.unlink(filePath).catch((err) => {
      console.warn("Failed to delete uploaded file:", err.message);
    });

    res.json({
      success: true,
      extracted_parameters: extracted_parameters || [],
      summary: summary,
      disclaimer: disclaimer
    });

  } catch (err) {
    console.error("❌ analyzeLabReport error:", err);

    if (req.file && req.file.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }

    res.status(500).json({
      success: false,
      error: err.message || "Internal server error while analyzing lab report"
    });
  }
};