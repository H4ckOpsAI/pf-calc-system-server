const xlsx = require('xlsx');

const workbook = xlsx.readFile('d:\\se project\\reports\\seeding_data_js.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet);

console.log("Columns found in first row:", Object.keys(data[0]));
console.log("First row data:", data[0]);
