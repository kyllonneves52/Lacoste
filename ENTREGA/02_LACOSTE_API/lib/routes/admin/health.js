const { sql } = require('../../db');
const { json, adminOk } = require('../../common');

module.exports = async (req, res) => {
  if (!adminOk(req)) {
    return json(res, 403, {
      ok: false,
      message: 'Não autorizado.'
    });
  }

  if (req.method !== 'GET') {
    return json(res, 405, {
      ok: false,
      message: 'Método não permitido.'
    });
  }

  try {
    const tables = {};

    const names = [
      'license_requests',
      'devices',
      'orders',
      'authorized_users',
      'bot_group_devices',
      'verification_devices',
      'payment_verification_configs',
      'payment_verifications',
      'verification_inbox'
    ];

    for (const name of names) {
      try {
        const q = await sql`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
          AND name = ${name}
          LIMIT 1
        `;

        tables[name] = !!q.rows[0];
      } catch (e) {
        tables[name] = false;
      }
    }

    const counts = {};

    for (const name of Object.keys(tables)) {
      if (!tables[name]) continue;

      try {
        const q = await sql.query(
          `SELECT COUNT(*) AS n FROM ${name}`
        );

        counts[name] = Number(q.rows[0]?.n || 0);
      } catch (e) {
        counts[name] = null;
      }
    }

    return json(res, 200, {
      ok: true,
      database: 'turso',
      tables,
      counts,
      env: {
        adminPassword: !!process.env.ADMIN_PASSWORD,
        botToken: !!process.env.LACOSTE_BOT_TOKEN,
        apiToken: !!process.env.API_TOKEN,
        turso:
          !!process.env.TURSO_DATABASE_URL &&
          !!process.env.TURSO_AUTH_TOKEN,
        firebase:
          !!process.env.FIREBASE_PROJECT_ID &&
          !!process.env.FIREBASE_CLIENT_EMAIL &&
          !!process.env.FIREBASE_PRIVATE_KEY
      }
    });

  } catch (e) {
    console.error('ADMIN HEALTH ERROR:', e);

    return json(res, 500, {
      ok: false,
      message: e.message
    });
  }
};
