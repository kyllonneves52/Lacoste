const { query } = require('./db');

async function exec(sql) {
  try { await query(sql); return true; }
  catch (e) { console.log('[migration skip]', e.message); return false; }
}

async function column(table, name, definition) {
  return exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

async function runMigrations() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS license_requests (id TEXT PRIMARY KEY)`,
    `CREATE TABLE IF NOT EXISTS devices (android_id TEXT PRIMARY KEY)`,
    `CREATE TABLE IF NOT EXISTS verification_devices (id TEXT PRIMARY KEY)`,
    `CREATE TABLE IF NOT EXISTS payment_verification_configs (id TEXT PRIMARY KEY)`,
    `CREATE TABLE IF NOT EXISTS payment_verifications (id TEXT PRIMARY KEY)`,
    `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY)`,
    `CREATE TABLE IF NOT EXISTS bot_group_devices (group_id TEXT PRIMARY KEY)`,
    `CREATE TABLE IF NOT EXISTS verification_inbox (id TEXT PRIMARY KEY)`,
    `CREATE TABLE IF NOT EXISTS authorized_users (id INTEGER PRIMARY KEY AUTOINCREMENT)`
  ];
  for (const q of tables) await exec(q);

  // Columns used by the current API. Existing columns are harmlessly skipped.
  const cols = [
    ['license_requests','license_key','TEXT'],['license_requests','android_id','TEXT'],['license_requests','model','TEXT'],
    ['license_requests','status',"TEXT DEFAULT 'pending'"],['license_requests','days','INTEGER'],['license_requests','requested_at','TEXT'],
    ['license_requests','approved_at','TEXT'],['license_requests','expires_at','TEXT'],['license_requests','device_token','TEXT'],
    ['license_requests','rejection_reason','TEXT'],['license_requests','device_role',"TEXT DEFAULT 'auto'"],['license_requests','group_id','TEXT'],
    ['license_requests','mode','TEXT'],['license_requests','verification_enabled','INTEGER DEFAULT 0'],['license_requests','lc_code','TEXT'],
    ['license_requests','package_name','TEXT'],['license_requests','version_code','TEXT'],['license_requests','version_name','TEXT'],
    ['license_requests','manufacturer','TEXT'],['license_requests','app_type','TEXT'],['license_requests','token','TEXT'],['license_requests','platform','TEXT'],
    ['devices','device_id','TEXT'],['devices','model','TEXT'],['devices','status',"TEXT DEFAULT 'pending'"],['devices','license_request_id','TEXT'],
    ['devices','license_key','TEXT'],['devices','token','TEXT'],['devices','device_token','TEXT'],['devices','license_expires_at','TEXT'],
    ['devices','last_seen','TEXT'],['devices','sim_active','INTEGER DEFAULT 1'],['devices','communication_active','INTEGER DEFAULT 1'],['devices','slot','INTEGER'],
    ['devices','fcm_token','TEXT'],['devices','fcm_updated_at','TEXT'],['devices','mode','TEXT'],['devices','verification_enabled','INTEGER DEFAULT 0'],['devices','device_role',"TEXT DEFAULT 'transfer'"],
    ['verification_devices','device_id','TEXT'],['verification_devices','android_id','TEXT'],['verification_devices','license_key','TEXT'],['verification_devices','token','TEXT'],
    ['verification_devices','device_token','TEXT'],['verification_devices','platform',"TEXT DEFAULT 'android'"],['verification_devices','app_version','TEXT'],['verification_devices','os_version','TEXT'],
    ['verification_devices','brand','TEXT'],['verification_devices','manufacturer','TEXT'],['verification_devices','package_name','TEXT'],['verification_devices','version_code','TEXT'],
    ['verification_devices','version_name','TEXT'],['verification_devices','model','TEXT'],['verification_devices','status',"TEXT DEFAULT 'pending'"],['verification_devices','fcm_token','TEXT'],
    ['verification_devices','apns_token','TEXT'],['verification_devices','last_seen','TEXT'],['verification_devices','created_at','TEXT'],['verification_devices','updated_at','TEXT'],
    ['verification_devices','mb_android_id','TEXT'],
    ['payment_verification_configs','group_id','TEXT'],['payment_verification_configs','mode',"TEXT DEFAULT 'todos'"],['payment_verification_configs','verification_enabled','INTEGER DEFAULT 0'],
    ['payment_verification_configs','verification_device_id','TEXT'],['payment_verification_configs','config','TEXT'],['payment_verification_configs','created_at','TEXT'],['payment_verification_configs','updated_at','TEXT'],
    ['payment_verification_configs','enabled','INTEGER DEFAULT 1'],['payment_verification_configs','reference_prefix','TEXT'],['payment_verification_configs','expected_amount','REAL'],
    ['payment_verifications','order_id','TEXT'],['payment_verifications','group_id','TEXT'],['payment_verifications','reference','TEXT DEFAULT \'\'' ],
    ['payment_verifications','expected_provider',"TEXT DEFAULT 'todos'"],['payment_verifications','provider','TEXT'],['payment_verifications','operator',"TEXT DEFAULT 'todos'"],
    ['payment_verifications','expected_payment_id','TEXT'],['payment_verifications','amount_mt','REAL DEFAULT 0'],['payment_verifications','expected_amount','REAL'],
    ['payment_verifications','expected_date','TEXT'],['payment_verifications','expected_time','TEXT'],['payment_verifications','status',"TEXT DEFAULT 'pending'"],['payment_verifications','expires_at','TEXT'],
    ['payment_verifications','verification_device_id','TEXT'],['payment_verifications','sms_text','TEXT'],['payment_verifications','sms_sender','TEXT'],['payment_verifications','received_at','TEXT'],
    ['payment_verifications','verified_at','TEXT'],['payment_verifications','created_at','TEXT'],['payment_verifications','updated_at','TEXT'],['payment_verifications','failure_reason','TEXT'],
    ['orders','type','TEXT'],['orders','number','TEXT'],['orders','quantity_mb','INTEGER'],['orders','value_mt','REAL'],['orders','payment_id','TEXT'],['orders','payment_date','TEXT'],['orders','payment_time','TEXT'],
    ['orders','test_mode','INTEGER DEFAULT 0'],['orders','status',"TEXT DEFAULT 'pending'"],['orders','device_android_id','TEXT'],['orders','device_id','TEXT'],['orders','bot_group_id','TEXT'],['orders','created_at','TEXT'],['orders','completed_at','TEXT'],
    ['orders','fail_reason','TEXT'],['orders','source','TEXT'],['orders','parent_order_id','TEXT'],['orders','part_number','INTEGER'],['orders','total_parts','INTEGER'],['orders','cancelled_at','TEXT'],['orders','mode','TEXT'],['orders','verification_enabled','INTEGER DEFAULT 0'],
    ['bot_group_devices','android_id','TEXT'],['bot_group_devices','device_id','TEXT'],['bot_group_devices','active','INTEGER DEFAULT 1'],['bot_group_devices','mode','TEXT'],['bot_group_devices','verification_enabled','INTEGER DEFAULT 0'],['bot_group_devices','created_at','TEXT'],['bot_group_devices','updated_at','TEXT'],
    ['authorized_users','whatsapp_number','TEXT'],['authorized_users','name','TEXT'],['authorized_users','active','INTEGER DEFAULT 1'],
    ['verification_inbox','payment_id','TEXT'],['verification_inbox','amount_mt','REAL'],['verification_inbox','provider','TEXT'],['verification_inbox','sms_text','TEXT'],['verification_inbox','sms_sender','TEXT'],['verification_inbox','verification_device_id','TEXT'],['verification_inbox','received_at','TEXT'],['verification_inbox','expires_at','TEXT'],['verification_inbox','matched_at','TEXT']
  ];
  for (const [t,c,d] of cols) await column(t,c,d);

  // Remove duplicate verification rows before creating the exact unique key
  // required by ON CONFLICT(platform,device_id).
  await exec(`DELETE FROM verification_devices
    WHERE rowid NOT IN (
      SELECT MAX(rowid) FROM verification_devices
      WHERE device_id IS NOT NULL
      GROUP BY platform, device_id
    ) AND device_id IS NOT NULL`);

  // Garante índice parcial (só quando slot IS NOT NULL) — evita conflito com vários devices pending (slot NULL)
  await exec(`DROP INDEX IF EXISTS idx_devices_license_slot`);
  await exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_license_slot ON devices(license_key, slot) WHERE slot IS NOT NULL`);

  const indexes = [
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_devices_platform_device ON verification_devices(platform,device_id)`,
    `CREATE INDEX IF NOT EXISTS idx_verification_devices_android_id ON verification_devices(android_id)`,
    `CREATE INDEX IF NOT EXISTS idx_verification_devices_mb_android_id ON verification_devices(mb_android_id)`,
    `CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id)`,
    `CREATE INDEX IF NOT EXISTS idx_devices_license ON devices(license_key)`,
    `CREATE INDEX IF NOT EXISTS idx_devices_fcm ON devices(fcm_token)`,
    `CREATE INDEX IF NOT EXISTS idx_license_requests_key ON license_requests(license_key)`,
    `CREATE INDEX IF NOT EXISTS idx_license_requests_android ON license_requests(android_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payment_configs_group ON payment_verification_configs(group_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_verifications_order ON payment_verifications(order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_payment_verifications_status ON payment_verifications(status,expires_at)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_device_status ON orders(device_android_id,status)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_group_status ON orders(bot_group_id,status)`,
    `CREATE INDEX IF NOT EXISTS idx_orders_parent ON orders(parent_order_id)`,
    `CREATE INDEX IF NOT EXISTS idx_bot_group_devices_android ON bot_group_devices(android_id)`,
    `CREATE INDEX IF NOT EXISTS idx_verification_inbox_lookup ON verification_inbox(payment_id,amount_mt,provider,received_at)`,
    `CREATE INDEX IF NOT EXISTS idx_verification_inbox_expiry ON verification_inbox(expires_at)`
  ];
  for (const q of indexes) await exec(q);

  return {ok:true};
}

module.exports={runMigrations};
