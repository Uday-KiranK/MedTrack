require('dotenv').config();
const pool = require('./src/utils/db');

async function checkConstraint() {
  try {
    const res = await pool.query(`
      SELECT pg_get_constraintdef(oid) 
      FROM pg_constraint 
      WHERE conname = 'medicines_food_instruction_check';
    `);
    console.log(res.rows[0]);
  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}
checkConstraint();
