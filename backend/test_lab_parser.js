require('dotenv').config();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { extractTextFromFile } = require('./src/services/ocrService');

// ===================================================
// AVAILABLE MODELS TO TEST
// ===================================================
// Groq Models:
//   - "openai/gpt-oss-120b"
//   - "openai/gpt-oss-20b"
//   - "qwen/qwen3.8-27b"
//   - "qwen/qwen3.6-27b"
//   - "groq/compound"
// OpenRouter Models:
//   - "google/gemini-2.0-flash-001"
//   - "meta-llama/llama-3.3-70b-instruct"
//   - "anthropic/claude-3.5-haiku"

const MODEL_NAME = process.argv[3] || "openai/gpt-oss-120b";
const PROVIDER = process.argv[4] || (MODEL_NAME.includes('/') && !MODEL_NAME.startsWith('openai/') && !MODEL_NAME.startsWith('qwen/') && !MODEL_NAME.startsWith('groq/') ? "openrouter" : "groq");

async function parseWithCustomModel(text, model, provider) {
  const isOpenRouter = provider.toLowerCase() === "openrouter";
  const url = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.groq.com/openai/v1/chat/completions";

  const apiKey = isOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(`API key for provider '${provider}' is missing in .env!`);
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };

  if (isOpenRouter) {
    headers["HTTP-Referer"] = "https://medtrack.app";
    headers["X-Title"] = "MedTrack";
  }

  const prompt = `Extract EVERY medical test result row from the following report.
Return ONLY a raw JSON array matching this structure:
[
  {
    "parameter": "exact test name",
    "value": number or string,
    "unit": "exact unit or empty string",
    "reference_range": "full reference range or empty string"
  }
]
Do NOT include markdown backticks or extra explanation.

Report Text:
${text}`;

  const res = await axios.post(url, {
    model: model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    max_tokens: 3000
  }, { headers, timeout: 45000 });

  const raw = res.data.choices[0].message.content.trim();
  let clean = raw.replace(/^```json?|\n```$/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return raw;
  }
}

async function main() {
  const filePathArg = process.argv[2];

  if (!filePathArg) {
    console.log(`
=============================================================
🩺 MedTrack Lab Report AI Testing Tool (PC Command Line)
=============================================================
Usage:
  node test_lab_parser.js <path-to-pdf-or-image> [model_name] [provider]

Examples:
  # Test with default model (openai/gpt-oss-120b on Groq):
  node test_lab_parser.js uploads/labs/sample.pdf

  # Test Qwen 3.8 model on Groq:
  node test_lab_parser.js uploads/labs/sample.pdf qwen/qwen3.8-27b groq

  # Test Gemini 2.0 Flash model on OpenRouter:
  node test_lab_parser.js uploads/labs/sample.pdf google/gemini-2.0-flash-001 openrouter

  # Test Llama 3.3 70B on OpenRouter:
  node test_lab_parser.js uploads/labs/sample.pdf meta-llama/llama-3.3-70b-instruct openrouter
=============================================================
`);
    process.exit(0);
  }

  const absolutePath = path.isAbsolute(filePathArg)
    ? filePathArg
    : path.join(__dirname, filePathArg);

  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File not found at: ${absolutePath}`);
    process.exit(1);
  }

  console.log(`\n=============================================================`);
  console.log(`📄 File: ${path.basename(absolutePath)}`);
  console.log(`🤖 Testing Model: ${MODEL_NAME} (${PROVIDER.toUpperCase()})`);
  console.log(`=============================================================\n`);

  console.log(`⏳ Step 1: Extracting raw text from file...`);
  const rawText = await extractTextFromFile(absolutePath);
  console.log(`\n--- [RAW TEXT PREVIEW (First 500 Chars)] ---`);
  console.log(rawText.substring(0, 500));
  console.log(`-------------------------------------------\n`);

  console.log(`⏳ Step 2: Parsing report with AI model (${MODEL_NAME})...`);
  const startTime = Date.now();
  const result = await parseWithCustomModel(rawText, MODEL_NAME, PROVIDER);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n✅ Finished in ${elapsed}s!`);
  console.log(`\n--- [PARSED RESULTS] ---`);
  console.dir(result, { depth: null, colors: true });
  console.log(`-------------------------\n`);
}

main().catch(err => {
  console.error("❌ Error during test execution:", err.response?.data || err.message);
});
