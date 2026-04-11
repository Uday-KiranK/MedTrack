const fs = require("fs");
const path = require("path");

let pdfjsLib;

// ========================================
// LOAD PDF.JS (CommonJS SAFE)
// ========================================
function loadPDFJS() {
  if (!pdfjsLib) {
    pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");

    // 🔥 Correct worker for Node (NO .mjs)
    const pdfWorker = require("pdfjs-dist/legacy/build/pdf.worker.js");

    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
  }
  return pdfjsLib;
}

// ========================================
// MAIN FUNCTION
// ========================================
async function parseLabValues(filePath) {
  try {
    const pdfjs = loadPDFJS();

    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(fs.readFileSync(filePath)),
    });

    const pdf = await loadingTask.promise;

    const extracted = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      const items = content.items
        .map(item => ({
          text: item.str.trim(),
          x: Math.round(item.transform[4]),
          y: Math.round(item.transform[5]),
        }))
        .filter(item => item.text.length > 0);

      // sort visually
      items.sort((a, b) => b.y - a.y || a.x - b.x);

      // group into rows
      const rows = [];
      let currentRow = [];
      let prevY = items[0]?.y;

      items.forEach(item => {
        if (Math.abs(item.y - prevY) < 10) {
          currentRow.push(item);
        } else {
          rows.push(currentRow.sort((a, b) => a.x - b.x));
          currentRow = [item];
        }
        prevY = item.y;
      });

      if (currentRow.length) {
        rows.push(currentRow.sort((a, b) => a.x - b.x));
      }

      // ========================================
      // PARSE ROWS
      // ========================================
      let currentEntry = null;

      for (let row of rows) {
        const rowText = row.map(i => i.text).join(" ").trim();

        // ❌ skip noise
        if (
          /interpretation|method|reference|associated|useful|note/i.test(rowText)
        ) {
          if (currentEntry) {
            extracted.push(currentEntry);
            currentEntry = null;
          }
          continue;
        }

        // ✅ detect parameter + value + unit
        const match = rowText.match(
          /([A-Za-z\-\(\) ]+?)\s*(\d+\.?\d*)\s*(mg\/dL|ng\/mL|pg\/mL|μIU\/mL|gm\/dL|%|ratio)/i
        );

        if (match) {
          if (currentEntry) extracted.push(currentEntry);

          currentEntry = {
            parameter: cleanParameter(match[1]),
            value: parseFloat(match[2]),
            unit: normalizeUnit(match[3]),
            reference_text: "",
          };
        }
        // ✅ attach reference lines
        else if (currentEntry) {
          if (
            /(Normal|Range|Adult|Optimal|Deficiency|High|Low|Desirable|Insufficiency)/i.test(
              rowText
            )
          ) {
            currentEntry.reference_text +=
              (currentEntry.reference_text ? " " : "") + rowText;
          }
        }
      }

      if (currentEntry) extracted.push(currentEntry);
    }

    return extracted;

  } catch (err) {
    console.error("Lab parsing error:", err);
    throw err;
  }
}

// ========================================
// HELPERS
// ========================================
function cleanParameter(text) {
  return text
    .replace(/\*+/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUnit(u) {
  if (!u) return "N/A";

  const map = {
    "mg/dl": "mg/dL",
    "ng/ml": "ng/mL",
    "pg/ml": "pg/mL",
    "μiu/ml": "μIU/mL",
    "gm/dl": "gm/dL",
  };

  return map[u.toLowerCase()] || u;
}

module.exports = { parseLabValues };