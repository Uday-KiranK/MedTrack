const pdfTableExtractor = require("pdf-table-extractor");
const fs = require("fs");

function extractTables(filePath) {
  return new Promise((resolve, reject) => {
    pdfTableExtractor(filePath, (result) => {
      resolve(result.pageTables);
    }, (err) => {
      reject(err);
    });
  });
}

module.exports = { extractTables };
