const fs = require('fs');
const path = require('path');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

// Worker setup (you already have this working)
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(__dirname, '../../public/pdfjs/pdf.worker.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerPort = null;

// Optional: suppress font warnings
const STANDARD_FONTS_DIR = path.join(__dirname, '../../node_modules/pdfjs-dist/standard_fonts/');

async function parseLabPDF(filePath) {
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(fs.readFileSync(filePath)),
      standardFontDataUrl: STANDARD_FONTS_DIR + '/',
      disableFontFace: true,
      useSystemFonts: false,
    });

    const pdf = await loadingTask.promise;
    const extracted = [];
    let globalTitle = '';

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();

      const items = content.items
        .map(item => ({
          text: item.str.trim(),
          x: Math.round(item.transform[4]),
          y: Math.round(item.transform[5]),
          width: item.width,
        }))
        .filter(item => item.text.length > 0);

      if (items.length === 0) continue;

      // Sort top-down (higher y = higher on page)
      items.sort((a, b) => b.y - a.y || a.x - b.x);

      // Group into rows with tolerance
      const rows = [];
      let currentRow = [];
      let prevY = items[0].y;

      items.forEach(item => {
        if (Math.abs(item.y - prevY) < 12) { // slightly looser tolerance
          currentRow.push(item);
        } else {
          if (currentRow.length > 0) {
            currentRow.sort((a, b) => a.x - b.x);
            rows.push(currentRow);
          }
          currentRow = [item];
        }
        prevY = item.y;
      });
      if (currentRow.length > 0) {
        currentRow.sort((a, b) => a.x - b.x);
        rows.push(currentRow);
      }

      // Find headers and sections
      const headerIndices = [];
      let currentSection = '';
      for (let i = 0; i < rows.length; i++) {
        const rowText = rows[i].map(it => it.text).join(' ').toLowerCase().replace(/\s+/g, ' ');
        if (rowText.match(/(test|parameter|item|description)\s+(result|value|unit|range|reference|method)/i)) {
          headerIndices.push({ index: i, type: 'main' });
        } else if (rowText.match(/(complete|differential|absolute|chemical|microscopic|biochemistry|haematology|report|count|indices)/i) && rowText.length > 5) {
          currentSection = rows[i].map(it => it.text).join(' ').trim();
        }
      }

      if (headerIndices.length === 0) {
        headerIndices.push({ index: -1, type: 'fallback' });
      }

      // Detect global title if not set
      if (!globalTitle) {
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const line = rows[i].map(it => it.text).join(' ').trim();
          if (line.length > 20 && !line.toLowerCase().includes('patient') && !line.includes('Reg.') && !line.includes('HPE')) {
            globalTitle = line;
            break;
          }
        }
      }

      // Infer column starts from header or fallback
      let colStarts = [0];
      if (headerIndices[0]?.index >= 0) {
        const headerRow = rows[headerIndices[0].index];
        let lastX = 0;
        headerRow.forEach(item => {
          if (item.x > lastX + 50) colStarts.push(item.x);
          lastX = item.x + item.width;
        });
      }
      colStarts.push(9999);

      // Parse rows in each section
      let currentEntry = null;
      let lastParameter = null;

      for (let h = 0; h < headerIndices.length; h++) {
        const start = headerIndices[h].index + 1;
        const end = headerIndices[h + 1] ? headerIndices[h + 1].index : rows.length;

        for (let i = start; i < end; i++) {
          const row = rows[i];
          const rowTextAll = row.map(it => it.text).join(' ').toLowerCase().replace(/\s+/g, ' ');

          if (rowTextAll.includes('interpretation') || rowTextAll.includes('useful for') ||
              rowTextAll.includes('reference :') || rowTextAll.includes('method') ||
              rowTextAll.includes('associated tests') || rowTextAll.includes('**end')) {
            if (currentEntry) {
              extracted.push(currentEntry);
              currentEntry = null;
            }
            continue;
          }

          // Assign to columns
          const cols = Array(colStarts.length - 1).fill('');
          row.forEach(item => {
            for (let c = 0; c < colStarts.length - 1; c++) {
              if (item.x >= colStarts[c] && item.x < colStarts[c + 1]) {
                cols[c] += (cols[c] ? ' ' : '') + item.text;
                break;
              }
            }
          });

          let [desc, valUnit, unit, ref] = cols.map(s => s.trim().replace(/\s+/g, ' '));

          // Normalize columns
          if (!ref && unit) {
            ref = unit;
            unit = '';
          }

          const vu = parseValueAndUnit(valUnit || unit || '');

          if (desc && desc.length > 3 && !desc.startsWith('*') && desc.match(/[A-Z]/)) {
            if (currentEntry) extracted.push(currentEntry);

            currentEntry = {
              test_section: globalTitle || currentSection || 'Unknown',
              parameter: cleanParameter(desc),
              value: vu.value,
              unit: vu.unit,
              reference_text: ref || '',
            };
            lastParameter = currentEntry;
          } else if (currentEntry && (ref || vu.value || desc)) {
            const append = ref || vu.value || desc;
            if (append && (append.includes(':') || append.includes('-') || append.match(/[<>\d]/))) {
              currentEntry.reference_text += (currentEntry.reference_text ? ' ' : '') + append.trim();
            }
          }
        }

        if (currentEntry) extracted.push(currentEntry);
      }
    }

    // Final filter
    const filtered = extracted.filter(e =>
      e.value && e.parameter &&
      !e.parameter.toLowerCase().includes('method') &&
      !e.parameter.toLowerCase().includes('reference')
    );

    return {
      success: true,
      extracted_parameters: filtered,
    };

  } catch (err) {
    console.error("PDF parsing error:", err);
    throw err;
  }
}

function cleanParameter(text) {
  return text
    .replace(/\*+$/, '')
    .replace(/^\*/, '')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\(.*?\)/g, '')
    .replace(/\*$/, '')
    .trim();
}

function parseValueAndUnit(str) {
  if (!str) return { value: '', unit: 'N/A' };

  // Qualitative values
  if (/^(Negative|Absent|Normal|Clear|Pale Yellow|Normocytic Normochromic|Mild Thrombocytosis)$/i.test(str.trim())) {
    return { value: str.trim(), unit: 'N/A' };
  }

  // Numeric + unit
  const numericMatch = str.match(/^([\d.]+(?:-\d+)?)\s*([a-zμ%\/^0-9* -]+)?$/i);
  if (numericMatch) {
    return {
      value: numericMatch[1],
      unit: normalizeUnit(numericMatch[2] || 'N/A')
    };
  }

  // Scientific notation (e.g. 5.68 * 10^9/L)
  const sciMatch = str.match(/^([\d.]+)\s*\*?\s*10\^(\d+)\s*\/([a-z]+)/i);
  if (sciMatch) {
    return {
      value: sciMatch[1],
      unit: `10^${sciMatch[2]}/${sciMatch[3].toUpperCase()}`
    };
  }

  // Fallback
  return { value: str.trim(), unit: 'N/A' };
}

function normalizeUnit(u) {
  if (!u) return 'N/A';
  u = u.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const map = {
    'mg/dl': 'mg/dL',
    'pg/ml': 'pg/mL',
    'ng/ml': 'ng/mL',
    'uiu/ml': 'μIU/mL',
    'μiu/ml': 'μIU/mL',
    'gm/dl': 'gm/dL',
    '10^3/ul': '10^3/μL',
    '10^9/l': '10^9/L',
    '/hpf': '/hpf',
    'mil/cu.mm': 'mil/cu.mm',
    'cell/cu.mm': 'cell/cu.mm',
    'fl': 'fL',
    'pg': 'pg',
    'ratio': 'ratio'
  };
  return map[u] || u.toUpperCase() || 'N/A';
}

module.exports = { parseLabPDF };
