const { query } = require('./db');

async function all(sqlText, params = []) {
  const r = await query(sqlText, params);
  return r.rows || [];
}
async function get(sqlText, params = []) {
  const rows = await all(sqlText, params);
  return rows[0] || null;
}
async function run(sqlText, params = []) {
  return query(sqlText, params);
}

module.exports = { all, get, run, query };
