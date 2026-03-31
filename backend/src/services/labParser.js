function splitIntoBlocks(text) {
  return text
    .split(/Test Description\s+Value\(s\)\s+Reference Range/i)
    .slice(1); // remove header junk
}

function parseRows(block) {
  const lines = block
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const results = [];
  let current = null;

  for (let line of lines) {
    // stop at interpretation
    if (/^Interpretation/i.test(line)) break;

    const rowMatch = line.match(
      /^([A-Za-z0-9\-\(\)\/\* \+]+?)\s+(\d+\.?\d*)\s*(mg\/dL|ng\/mL|pg\/mL|µIU\/mL|gm\/dL|fL|%|ratio)/i
    );

    if (rowMatch) {
      if (current) results.push(current);

      current = {
        parameter: rowMatch[1].replace(/\*/g, "").trim(),
        value: parseFloat(rowMatch[2]),
        unit: rowMatch[3],
        reference_text: ""
      };

      const refPart = line.replace(rowMatch[0], "").trim();
      if (refPart) current.reference_text += refPart + " ";
      continue;
    }

    // continuation of reference
    if (current) {
      if (/^\d|Normal|High|Low|Optimal|Desirable|Deficiency/i.test(line)) {
        current.reference_text += line + " ";
      }
    }
  }

  if (current) results.push(current);

  return results;
}

function parseLabValues(text) {
  const blocks = splitIntoBlocks(text);
  let all = [];

  for (const block of blocks) {
    const parsed = parseRows(block);
    all = all.concat(parsed);
  }

  return all;
}

module.exports = { parseLabValues };
