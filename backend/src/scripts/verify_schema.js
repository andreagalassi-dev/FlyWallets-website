const { pool } = require("../config/db");

async function checkSchema() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'audit_logs';
    `);
    console.log("Columns in audit_logs:", res.rows);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    client.release();
  }
}

checkSchema();
