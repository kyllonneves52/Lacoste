const url = process.env.TURSO_DATABASE_URL.replace('libsql://', 'https://');
const token = process.env.TURSO_AUTH_TOKEN;
const baseHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
async function query(text, params = []) {
  let sqlText = text
   .replace(/\$[0-9]+/g, '?')
   .replace(/NOW\(\)\s*\+\s*INTERVAL\s*'30 seconds'/gi, "datetime('now','+30 seconds')")
   .replace(/NOW\(\)\s*\+\s*INTERVAL\s*'([^']+)'/gi, "datetime('now','+$1')")
   .replace(/NOW\(\)/gi, "datetime('now')")
   .replace(/NULLS LAST/gi, "")
   .replace(/::\w+/g, "");
  const args = params.map(v => {
    if (v === null || v === undefined) return { type: "null" };
    if (typeof v === 'number') return Number.isInteger(v)? { type: "integer", value: String(v) } : { type: "float", value: v };
    if (typeof v === 'boolean') return { type: "integer", value: v? "1" : "0" };
    return { type: "text", value: String(v) };
  });
  const resp = await fetch(`${url}/v2/pipeline`, {
    method: 'POST', headers: baseHeaders,
    body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql: sqlText, args } }, { type: "close" }] })
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(JSON.stringify(data));
  const res = data.results?.[0];
  if (res?.type === 'error') throw new Error(res.error.message);
  const rows = [];
  const result = res?.response?.result;
  if (result?.rows) {
    const cols = result.cols.map(c => c.name);
    for (const r of result.rows) {
      const obj = {};
      r.forEach((cell, i) => { obj[cols[i]] = cell?.value; });
      rows.push(obj);
    }
  }
  return { rows, rowCount: rows.length };
}
function sql(strings,...values){ let t=''; for(let i=0;i<strings.length;i++){ t+=strings[i]; if(i<values.length) t+=`$${i+1}`; } return query(t, values); }
sql.query=query;
module.exports={sql, query, db:{query}};
