function parseLabTables(tables) {
  const results = [];

  tables.forEach(page => {
    page.tables.forEach(table => {
      table.forEach(row => {
        if (row.length < 3) return;

        const [test, valueCell, reference] = row;

        const valueMatch = valueCell.match(/(\d+\.?\d*)/);
        const unitMatch = valueCell.match(/[a-zA-Z\/]+/);

        if (!valueMatch) return;

        results.push({
          parameter: test.trim(),
          value: parseFloat(valueMatch[1]),
          unit: unitMatch ? unitMatch[0] : null,
          reference_text: reference ? reference.trim() : null,
          range_source: "table"
        });
      });
    });
  });

  return results;
}

module.exports = { parseLabTables };
