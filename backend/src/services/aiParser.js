// src/services/aiParser.js
const axios = require("axios");

// ========================================
// PROVIDER CONFIG
// ========================================
let currentProvider = "groq";   // switches between "groq" and "openrouter"

const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct";

// ========================================
// 🔐 SANITIZATION
// ========================================
function sanitize(text) {
  return text
    .replace(/Patient Name\s*:.*?\n/gi, "")
    .replace(/Age\s*[:/]\s*.*?\n/gi, "")
    .replace(/Mobile No\s*:.*?\n/gi, "")
    .replace(/Reg\.?\s*ID\s*:.*?\n/gi, "")
    .replace(/Reg\.?\s*No\s*:.*?\n/gi, "")
    .replace(/HPE No\..*?\n/gi, "")
    .replace(/Sample ID\s*:.*?\n/gi, "")
    .replace(/Dr\..*?\n/gi, "")
    .replace(/Scan to download report/gi, "")
    .replace(/\bInterpretation\s*:\s*[\s\S]*?(?=\n\n[A-Z]|\*\*\*END|\n\s*Reference:)/gi, "")
    .replace(/\bNote\s*:\s*[\s\S]*?(?=\n\n[A-Z]|\*\*\*END)/gi, "")
    .replace(/\bReference\s*:\s*[\s\S]*?(?=\n\n[A-Z]|\*\*\*END)/gi, "")
    .trim();
}

// ========================================
// 📄 DETECT NUMBER OF PAGES
// ========================================
function detectPageCount(text) {
  const pageMatches = text.match(/Page \d+ of \d+/gi) || [];
  const maxPage = pageMatches
    .map(m => {
      const match = m.match(/Page \d+ of (\d+)/i);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);
  return maxPage.length > 0 ? Math.max(...maxPage) : Math.ceil(text.length / 8000);
}

// ========================================
// 🔪 CHUNKING
// ========================================
function chunkText(text, maxChars = 3000) {
  const chunks = [];
  let current = "";
  const lines = text.split(/\n/);
  for (const line of lines) {
    if ((current + line).length > maxChars) {
      if (current) chunks.push(current.trim());
      current = line;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }
  if (current) chunks.push(current.trim());
  console.log(`📦 Report split into ${chunks.length} chunks`);
  return chunks;
}

// ========================================
// 🤖 MAIN PARSER
// ========================================
async function parseWithAI(text) {
  try {
    const cleanText = sanitize(text);
    const pageCount = detectPageCount(cleanText);
    console.log(`📄 Detected pages: ${pageCount}`);

    const chunks = chunkText(cleanText);
    let allResults = [];

    for (let i = 0; i < chunks.length; i++) {
      console.log(`🔄 Processing chunk ${i + 1}/${chunks.length}... (using ${currentProvider.toUpperCase()})`);

      const chunkResult = await parseChunkWithRetry(chunks[i]);
      console.log(`   → Chunk ${i + 1} returned ${chunkResult.length} parameters`);

      allResults = [...allResults, ...chunkResult];

      if (i < chunks.length - 1) {
        console.log("⏳ Waiting 20 seconds to respect rate limits...");
        await new Promise(resolve => setTimeout(resolve, 20000));
      }
    }

    // Adaptive deduplication
    let final;
    if (pageCount <= 10) {
      console.log("🔒 Using STRICT deduplication (≤10 pages)");
      const unique = {};
      allResults.forEach(item => {
        if (!item?.parameter) return;
        const key = item.parameter.toLowerCase().trim();
        if (!unique[key]) unique[key] = item;
      });
      final = cleanResults(Object.values(unique));
    } else {
      console.log("🔓 Using LOOSE deduplication (>10 pages)");
      const unique = {};
      allResults.forEach(item => {
        if (!item?.parameter) return;
        let key = item.parameter.toLowerCase().trim()
          .replace(/\*$/g, "")
          .replace(/\.$/g, "")
          .replace(/\s+/g, " ");
        if (!unique[key]) unique[key] = item;
      });
      final = cleanResults(Object.values(unique));
    }

    console.log(`✅ Final extracted parameters: ${final.length}`);
    return final;

  } catch (err) {
    console.error("Parser failed:", err.message);
    return [];
  }
}

// ========================================
// RETRY WITH FALLBACK
// ========================================
async function parseChunkWithRetry(text, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await parseChunk(text);
    } catch (err) {
      const status = err.response?.status;

      if (status === 429) {
        console.log(`⚠️ Rate limit hit on ${currentProvider}. Switching to ${currentProvider === "groq" ? "OpenRouter" : "Groq"}...`);
        currentProvider = currentProvider === "groq" ? "openrouter" : "groq";

        const wait = attempt === 0 ? 25000 : 35000;
        console.log(`⏳ Waiting ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      console.error(`Chunk error (attempt ${attempt + 1}):`, err.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 4000));
        continue;
      }
      return [];
    }
  }
  return [];
}

// ========================================
// PARSE SINGLE CHUNK
// ========================================
async function parseChunk(text) {
  const isOpenRouter = currentProvider === "openrouter";

  const url = isOpenRouter
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.groq.com/openai/v1/chat/completions";

  const headers = {
    Authorization: `Bearer ${isOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.GROQ_API_KEY}`,
    "Content-Type": "application/json"
  };

  if (isOpenRouter) {
    headers["HTTP-Referer"] = "https://medtrack.app";
    headers["X-Title"] = "MedTrack";
  }

  const systemPrompt = `You are a perfect medical lab report parser.
Return ONLY a valid JSON array. Start with [ and end with ].
No explanations, no markdown, no extra text.`;

  const userPrompt = `Extract EVERY test result row.

Return ONLY this exact JSON array:

[
  {
    "parameter": "exact name from report",
    "value": number or string,
    "unit": "exact unit or empty string",
    "reference_range": "full reference range or empty string"
  }
]

Rules:
- Capture every row that has a measured value.
- Strip ALL H*/L*/CH*/CL* flags.
- Keep exact parameter names (including *).
- For urine: value = "Negative", reference_range = "Negative"

Text:
${text}`;

  const response = await axios.post(url, {
    model: isOpenRouter ? OPENROUTER_MODEL : GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.0,
    max_tokens: 3000
  }, { 
    headers, 
    timeout: 60000 
  });

  const raw = response.data.choices[0].message.content.trim();
  console.log(`Raw output (${currentProvider.toUpperCase()}) first 500 chars:`, raw.substring(0, 500) + "...");

  return extractArray(raw);
}

// ========================================
// JSON EXTRACTOR + CLEAN RESULTS (your original)
// ========================================
function extractArray(raw) {
  let text = raw.replace(/^```json?|\n```$/g, "").trim();
  try { return normalizeToArray(JSON.parse(text)); } catch (_) {}
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try { return normalizeToArray(JSON.parse(match[0])); } catch (_) {}
  }
  console.warn("No JSON array found in chunk");
  return [];
}

function normalizeToArray(parsed) {
  if (Array.isArray(parsed)) return parsed.filter(i => i && typeof i === "object");
  if (typeof parsed === "object" && parsed !== null) {
    const vals = Object.values(parsed);
    if (Array.isArray(vals[0])) return vals[0];
    return vals.filter(v => v && typeof v === "object");
  }
  return [];
}

function cleanResults(data) {
  return data
    .filter(item => item && item.parameter && item.parameter.trim().length > 2)
    .map(item => {
      let param = item.parameter.trim()
        .replace(/\s+/g, " ")
        .replace(/^URINE ROUTINE\s+/i, "")
        .replace(/Apperance/i, "Appearance");

      let valueStr = String(item.value ?? "").trim()
        .replace(/\s*(H\*|L\*|CH\*|CL\*)\s*/gi, "")
        .replace(/^(Negative|Absent|Normal|Clear|Pale Yellow)[\s/-]*\1$/i, "$1")
        .replace(/^(\d+-\d+)\/hpf\d.*$/i, "$1")
        .replace(/^(Absent)\/hpf.*$/i, "Absent");

      let unit = String(item.unit ?? "").trim()
        .replace(/\s*(H\*|L\*|CH\*|CL\*)\s*/gi, "");

      if (!unit) {
        const glued = valueStr.match(/^([\d.]+)([a-zA-Z%\/µ^].*)$/i);
        if (glued) {
          valueStr = glued[1];
          unit = glued[2];
        }
      }

      const finalValue = isNaN(valueStr) ? valueStr : Number(valueStr);

      return {
        parameter: param,
        value: finalValue,
        unit: normalizeUnit(unit) || "",
        reference_range: String(item.reference_range ?? "").trim()
      };
    });
}

function normalizeUnit(unit) {
  if (!unit) return "";
  let u = unit.toLowerCase().trim();
  const map = {
    "mg/dl": "mg/dL", "ng/ml": "ng/mL", "pg/ml": "pg/mL",
    "uiu/ml": "μIU/mL", "gm/dl": "gm/dL", "g/dl": "gm/dL",
    "ml": "mL", "10^3/ul": "10^3/µL", "10^3/µl": "10^3/µL",
    "10^6/ul": "10^6/µL", "10^6/µl": "10^6/µL", "cumm": "/cumm",
    "fl": "fL", "pg": "pg", "u/l": "U/L", "iu/l": "IU/L",
    "ratio": "ratio", "mm/hr": "mm/hr", "mmol/l": "mmol/L"
  };
  return map[u] || unit.trim();
}

// ========================================
// AI SUMMARY GENERATION (More helpful & doctor-like)
// ========================================
async function generateLabSummary(extractedParams) {
  if (!extractedParams || extractedParams.length === 0) {
    return {
      summary: "No parameters could be extracted from the report.",
      disclaimer: "This is an informational summary only. It is NOT a medical diagnosis. Please consult your doctor."
    };
  }

  const paramsText = extractedParams
    .map(p => `${p.parameter}: ${p.value} ${p.unit} (Ref: ${p.reference_range})`)
    .join("\n");

  const prompt = `You are a caring, experienced doctor explaining lab results to a patient in simple, friendly language.

Write a warm, encouraging summary (maximum 180-200 words) of the lab report.

For each important finding:
- Explain what it means in everyday language
- Suggest natural, practical ways to improve it (Indian home foods/dishes with specific nutrients, daily habits, walking, yoga, sleep, etc.)
- Be positive and actionable

Do NOT give any medical diagnosis or prescribe medicines.
Always end with a strong disclaimer.

Lab Results:
${paramsText}

Write the summary now:`;

  try {
    const isOpenRouter = currentProvider === "openrouter";

    const url = isOpenRouter
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.groq.com/openai/v1/chat/completions";

    const headers = {
      Authorization: `Bearer ${isOpenRouter ? process.env.OPENROUTER_API_KEY : process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json"
    };

    if (isOpenRouter) {
      headers["HTTP-Referer"] = "https://medtrack.app";
      headers["X-Title"] = "MedTrack";
    }

    const response = await axios.post(url, {
      model: isOpenRouter ? OPENROUTER_MODEL : GROQ_MODEL,
      messages: [
        { role: "system", content: "You are a caring, experienced doctor speaking to a patient." },
        { role: "user", content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 700
    }, { headers, timeout: 45000 });

    const summaryText = response.data.choices[0].message.content.trim();

    return {
      summary: summaryText,
      disclaimer: "This is an informational AI-generated summary. It is NOT a medical diagnosis or treatment advice. Always consult your doctor for professional interpretation and next steps."
    };
  } catch (err) {
    console.error("Summary generation failed:", err.message);
    return {
      summary: "Unable to generate summary at this time.",
      disclaimer: "This is an informational AI-generated summary. It is NOT a medical diagnosis or advice. Always consult your doctor."
    };
  }
}

module.exports = { parseWithAI, generateLabSummary };