const pool = require("../utils/db.js");
const axios = require("axios");

let currentProvider = "groq";
const GROQ_MODEL = "openai/gpt-oss-120b";
const OPENROUTER_MODEL = "meta-llama/llama-3.3-70b-instruct";

async function ensureTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medicine_info_cache (
        id SERIAL PRIMARY KEY,
        medicine_name_lower VARCHAR(255) UNIQUE NOT NULL,
        generic_name VARCHAR(255),
        uses TEXT,
        how_to_take TEXT,
        side_effects TEXT,
        precautions TEXT,
        dietary_advice TEXT,
        missed_dose TEXT,
        storage TEXT,
        raw_json JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (err) {
    console.error("Error initializing medicine_info_cache table:", err.message);
  }
}

ensureTable();

function getRuleBasedFallback(medicineName, medicineForm = 'Tablet', dosage = '') {
  const name = (medicineName || '').toLowerCase();

  let generic_name = medicineName;
  let uses = "Used to treat and manage medical conditions as prescribed by your physician.";
  let howToTake = `Take ${dosage || '1 unit'} as directed by your doctor. Swallow whole with a full glass of water.`;
  let sideEffects = "Mild nausea, headache, dizziness, or mild stomach upset may occur.";
  let precautions = "Do not double your dose if missed. Inform your doctor if you are pregnant, nursing, or taking other medications.";
  let dietaryAdvice = "Maintain adequate hydration. Avoid alcohol during medication course unless approved by your doctor.";
  let missedDose = "If you miss a dose, take it as soon as you remember. If it is almost time for your next dose, skip the missed dose and resume your normal schedule.";
  let storage = "Store at room temperature (below 30°C) away from moisture, heat, and direct sunlight. Keep out of reach of children.";

  if (name.includes('paracetamol') || name.includes('crocin') || name.includes('dolo') || name.includes('acetaminophen')) {
    generic_name = "Paracetamol / Acetaminophen (Analgesic & Antipyretic)";
    uses = "Relieves mild to moderate pain (headache, body ache, toothache) and effectively reduces fever.";
    howToTake = `Take ${dosage || '1 Tablet'} after meals with a full glass of water. Do not exceed 4000mg per day to protect liver health.`;
    sideEffects = "Rare side effects include mild skin rash, nausea, or liver strain if taken in excessive amounts.";
    precautions = "Avoid alcohol during treatment. Do not take alongside other paracetamol-containing combination medicines.";
    dietaryAdvice = "Avoid heavy alcohol consumption. Stay well-hydrated with fresh water and oral fluids.";
  } else if (name.includes('amoxicillin') || name.includes('azithromycin') || name.includes('ciplox') || name.includes('augmentin') || name.includes('antibiotic')) {
    generic_name = "Broad-Spectrum Antibiotic";
    uses = "Treats bacterial infections of the respiratory tract, throat, ears, lungs, skin, or urinary tract.";
    howToTake = `Take ${dosage || '1 unit'} at evenly spaced intervals daily. Complete the full prescribed course even if symptoms disappear early.`;
    sideEffects = "Mild diarrhea, soft stools, nausea, abdominal discomfort, or skin rash.";
    precautions = "Must finish full prescribed antibiotic course to prevent bacterial resistance. Seek immediate emergency care if severe hives occur.";
    dietaryAdvice = "Probiotic foods like yogurt or buttermilk can help restore healthy gut bacteria during antibiotic treatment.";
  } else if (name.includes('metformin') || name.includes('glycomet') || name.includes('diabetes')) {
    generic_name = "Metformin Hydrochloride (Antidiabetic Agent)";
    uses = "Controls high blood sugar levels in patients with Type 2 Diabetes Mellitus.";
    howToTake = `Take ${dosage || '1 Tablet'} with or immediately after meals to minimize stomach upset and digestive discomfort.`;
    sideEffects = "Nausea, mild indigestion, stomach gas, metallic taste, or diarrhea during initial weeks.";
    precautions = "Stay well-hydrated. Avoid heavy alcohol intake. Report unusual muscle pain, severe weakness, or breathing trouble to your doctor.";
    dietaryAdvice = "Follow a low-glycemic, fiber-rich diet. Limit refined sugars and processed carbohydrates.";
  } else if (name.includes('pantoprazole') || name.includes('pan') || name.includes('omeprazole') || name.includes('rabeprazole') || name.includes('acidity')) {
    generic_name = "Proton Pump Inhibitor (Acid Suppressant)";
    uses = "Reduces stomach acid production, treating acidity, heartburn, GERD, acid reflux, and stomach ulcers.";
    howToTake = `Take ${dosage || '1 Tablet'} 30 to 45 minutes before breakfast on an empty stomach with a glass of plain water.`;
    sideEffects = "Headache, constipation, mild diarrhea, or flatulence.";
    precautions = "Swallow tablet whole — do not crush, chew, or break gastro-resistant or delayed-release tablets.";
    dietaryAdvice = "Avoid spicy, fried, or highly acidic foods, caffeinated beverages, and late-night heavy dinners.";
  } else if (name.includes('cough') || name.includes('syrup') || medicineForm === 'Syrup') {
    generic_name = "Cough Expectorant & Antitussive";
    uses = "Soothes throat irritation, relieves cough, and thins airway mucus for easier breathing.";
    howToTake = `Measure exact dose using the provided measuring cup or spoon (${dosage || '10ml'}). Take ~10 minutes after meals.`;
    sideEffects = "Drowsiness, dry mouth, mild dizziness, or light stomach discomfort.";
    precautions = "Do not drive or operate machinery if feeling sleepy. Avoid drinking water immediately after syrup to allow throat soothing effect.";
    dietaryAdvice = "Sip warm water, herbal teas, or honey-lemon water to soothe bronchial passages.";
  }

  return {
    medicine_name: medicineName,
    generic_name,
    uses,
    howToTake,
    sideEffects,
    precautions,
    dietaryAdvice,
    missedDose,
    storage,
    isAiGenerated: false
  };
}

async function fetchMedicineInfoFromAI(medicineName, medicineForm, dosage) {
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

  const systemPrompt = `You are an expert clinical pharmacologist and medical AI assistant for patients.
Return ONLY valid JSON matching the requested structure. No explanations, no markdown tags.`;

  const userPrompt = `Provide comprehensive, accurate, patient-friendly medical information for the medicine: "${medicineName}" (Form: ${medicineForm || 'Tablet'}, Dosage: ${dosage || 'as prescribed'}).

Return ONLY this JSON object structure:
{
  "medicine_name": "${medicineName}",
  "generic_name": "Active salt/ingredient composition (e.g. Paracetamol 650mg)",
  "uses": "Clear 2-3 sentence explanation of primary medical uses, conditions treated, and benefits.",
  "howToTake": "Detailed instructions on how to take/administer, meal relationships (e.g. take with water, after meals), best time of day.",
  "sideEffects": "Common mild side effects and critical red-flag warnings to watch out for.",
  "precautions": "Important medical warnings, alcohol avoidance, pregnancy/breastfeeding advice, driving precautions, and medical history considerations.",
  "dietaryAdvice": "Foods, drinks, or supplements to take or avoid with this medication (e.g. alcohol, dairy, grapefruit, hydration).",
  "missedDose": "Clear guidance on what the patient should do if they forget a dose.",
  "storage": "Proper storage conditions (temperature, light, moisture, child safety)."
}`;

  const response = await axios.post(url, {
    model: isOpenRouter ? OPENROUTER_MODEL : GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2,
    max_tokens: 1000
  }, { headers, timeout: 35000 });

  const raw = response.data.choices[0].message.content.trim();
  const cleaned = raw.replace(/^```json?|\n```$/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    parsed.isAiGenerated = true;
    return parsed;
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      parsed.isAiGenerated = true;
      return parsed;
    }
    throw new Error("Failed to parse JSON from AI response");
  }
}

async function getMedicineInfo(medicineName, medicineForm = 'Tablet', dosage = '') {
  if (!medicineName) return null;
  const nameLower = medicineName.trim().toLowerCase();

  // 1. Check PostgreSQL Cache
  try {
    const cached = await pool.query(
      "SELECT * FROM medicine_info_cache WHERE medicine_name_lower = $1",
      [nameLower]
    );
    if (cached.rows.length > 0) {
      console.log(`⚡ Cache hit for medicine info: "${medicineName}"`);
      const row = cached.rows[0];
      return {
        medicine_name: medicineName,
        generic_name: row.generic_name,
        uses: row.uses,
        howToTake: row.how_to_take,
        sideEffects: row.side_effects,
        precautions: row.precautions,
        dietaryAdvice: row.dietary_advice,
        missedDose: row.missed_dose,
        storage: row.storage,
        isAiGenerated: true
      };
    }
  } catch (err) {
    console.log("DB Cache lookup error:", err.message);
  }

  // 2. Rule-based fallback as backup
  const ruleResult = getRuleBasedFallback(medicineName, medicineForm, dosage);

  // 3. AI Fetch via Groq/OpenRouter
  try {
    console.log(`🤖 Fetching AI medicine info for: "${medicineName}"...`);
    const aiResult = await fetchMedicineInfoFromAI(medicineName, medicineForm, dosage);

    if (aiResult) {
      // Save to DB cache
      try {
        await pool.query(`
          INSERT INTO medicine_info_cache (
            medicine_name_lower, generic_name, uses, how_to_take, side_effects, precautions, dietary_advice, missed_dose, storage, raw_json
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (medicine_name_lower) DO UPDATE SET
            generic_name = EXCLUDED.generic_name,
            uses = EXCLUDED.uses,
            how_to_take = EXCLUDED.how_to_take,
            side_effects = EXCLUDED.side_effects,
            precautions = EXCLUDED.precautions,
            dietary_advice = EXCLUDED.dietary_advice,
            missed_dose = EXCLUDED.missed_dose,
            storage = EXCLUDED.storage,
            raw_json = EXCLUDED.raw_json
        `, [
          nameLower,
          aiResult.generic_name || '',
          aiResult.uses || '',
          aiResult.howToTake || '',
          aiResult.sideEffects || '',
          aiResult.precautions || '',
          aiResult.dietaryAdvice || '',
          aiResult.missedDose || '',
          aiResult.storage || '',
          JSON.stringify(aiResult)
        ]);
        console.log(`✅ Saved "${medicineName}" to DB cache.`);
      } catch (saveErr) {
        console.error("DB cache save error:", saveErr.message);
      }

      return aiResult;
    }
  } catch (aiErr) {
    console.error("AI fetch failed, falling back to rules:", aiErr.message);
  }

  return ruleResult;
}

module.exports = { getMedicineInfo };
