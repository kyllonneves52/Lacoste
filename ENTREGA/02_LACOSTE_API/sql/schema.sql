CREATE TABLE IF NOT EXISTS license_requests (
  id TEXT PRIMARY KEY, 
  license_key TEXT NOT NULL, 
  android_id TEXT NOT NULL, 
  model TEXT, 
  status TEXT NOT NULL DEFAULT 'pending', 
  days INTEGER, 
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), 
  approved_at TIMESTAMPTZ, 
  expires_at TIMESTAMPTZ, 
  device_token TEXT, 
  rejection_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_license_requests_key ON license_requests(license_key);
CREATE INDEX IF NOT EXISTS idx_license_requests_android ON license_requests(android_id);

-- TABELA ORIGINAL
CREATE TABLE IF NOT EXISTS devices (
  android_id TEXT PRIMARY KEY, 
  model TEXT, 
  status TEXT NOT NULL DEFAULT 'pending', 
  license_request_id TEXT, 
  license_key TEXT, 
  token TEXT UNIQUE, 
  license_expires_at TIMESTAMPTZ, 
  last_seen TIMESTAMPTZ, 
  sim_active INTEGER DEFAULT 1, 
  communication_active BOOLEAN DEFAULT TRUE,
  slot INTEGER,
  fcm_token TEXT,
  fcm_updated_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_license_slot ON devices(license_key,slot) WHERE slot IS NOT NULL;

-- TABELA QUE O CÓDIGO ESTÁ USANDO [TRADUZIDA]
CREATE TABLE IF NOT EXISTS dispositivos (
  android_id TEXT PRIMARY KEY, 
  model TEXT, 
  status TEXT NOT NULL DEFAULT 'pending', 
  license_request_id TEXT, 
  license_key TEXT, 
  token TEXT UNIQUE, 
  license_expires_at TIMESTAMPTZ, 
  last_seen TIMESTAMPTZ, 
  sim_active INTEGER DEFAULT 1, 
  communication_active BOOLEAN DEFAULT TRUE,
  slot INTEGER,
  fcm_token TEXT,
  fcm_updated_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispositivos_license_slot ON dispositivos(license_key,slot) WHERE slot IS NOT NULL;


CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, 
  type TEXT NOT NULL DEFAULT 'megas', 
  number TEXT NOT NULL, 
  quantity_mb INTEGER, 
  value_mt NUMERIC, 
  payment_id TEXT, 
  payment_date TEXT, 
  payment_time TEXT, 
  test_mode BOOLEAN DEFAULT FALSE, 
  status TEXT NOT NULL DEFAULT 'pending', 
  device_android_id TEXT, 
  bot_group_id TEXT, 
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), 
  completed_at TIMESTAMPTZ, 
  fail_reason TEXT, 
  source TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_device_status ON orders(device_android_id,status);

CREATE TABLE IF NOT EXISTS authorized_users (
  id SERIAL PRIMARY KEY, 
  whatsapp_number TEXT UNIQUE NOT NULL, 
  name TEXT, 
  active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS bot_group_devices (
  group_id TEXT PRIMARY KEY,
  android_id TEXT NOT NULL REFERENCES devices(android_id) ON DELETE RESTRICT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bot_group_devices_android ON bot_group_devices(android_id);
CREATE INDEX IF NOT EXISTS idx_orders_group_status ON orders(bot_group_id,status);

-- Migração para instalações existentes
ALTER TABLE devices ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS fcm_updated_at TIMESTAMPTZ;
ALTER TABLE dispositivos ADD COLUMN IF NOT EXISTS fcm_token TEXT;
ALTER TABLE dispositivos ADD COLUMN IF NOT EXISTS fcm_updated_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS bot_group_id TEXT;
-- Migração LACOSTE AUTO: pedidos compostos e cancelamento
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS part_number INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_parts INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_orders_parent ON orders(parent_order_id);


-- Verificação de pagamentos por SMS
CREATE TABLE IF NOT EXISTS payment_verifications (
  id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE, group_id TEXT,
  reference TEXT, amount_mt NUMERIC, expected_provider TEXT NOT NULL DEFAULT 'todos', provider TEXT, operator TEXT DEFAULT 'todos',
  expected_payment_id TEXT, expected_amount NUMERIC, expected_date TEXT, expected_time TEXT, status TEXT NOT NULL DEFAULT 'pending',
  sms_text TEXT, sms_sender TEXT, received_at TIMESTAMPTZ, expires_at TIMESTAMPTZ NOT NULL, verification_device_id TEXT,
  failure_reason TEXT, verified_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ===== Comandos remotos bot → app (FCM DEVICE_COMMAND) =====
CREATE TABLE IF NOT EXISTS device_commands (
  id TEXT PRIMARY KEY,
  android_id TEXT NOT NULL,
  command TEXT NOT NULL,
  sim INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  group_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_device_commands_android ON device_commands(android_id, status);

-- ===== Lucros (LC Verification + conclusão de pedido) =====
CREATE TABLE IF NOT EXISTS profit_packages (
  mb INTEGER PRIMARY KEY,
  profit_mt NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS profit_entries (
  id TEXT PRIMARY KEY,
  order_id TEXT UNIQUE,
  mb INTEGER,
  profit_mt NUMERIC NOT NULL DEFAULT 0,
  day TEXT NOT NULL,
  android_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profit_entries_day ON profit_entries(day);
