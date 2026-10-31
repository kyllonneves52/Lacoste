CREATE TABLE IF NOT EXISTS license_requests (
  id TEXT PRIMARY KEY, license_key TEXT NOT NULL, android_id TEXT NOT NULL, model TEXT, status TEXT NOT NULL DEFAULT 'pending', days INTEGER, requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), approved_at TIMESTAMPTZ, expires_at TIMESTAMPTZ, device_token TEXT, rejection_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_license_requests_key ON license_requests(license_key);
CREATE INDEX IF NOT EXISTS idx_license_requests_android ON license_requests(android_id);
CREATE TABLE IF NOT EXISTS devices (
  android_id TEXT PRIMARY KEY, model TEXT, status TEXT NOT NULL DEFAULT 'pending', license_request_id TEXT, license_key TEXT, token TEXT UNIQUE, license_expires_at TIMESTAMPTZ, last_seen TIMESTAMPTZ, sim_active INTEGER DEFAULT 1, communication_active BOOLEAN DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, type TEXT NOT NULL DEFAULT 'megas', number TEXT NOT NULL, quantity_mb INTEGER, value_mt NUMERIC, payment_id TEXT, payment_date TEXT, payment_time TEXT, test_mode BOOLEAN DEFAULT FALSE, status TEXT NOT NULL DEFAULT 'pending', device_android_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ, fail_reason TEXT, source TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_device_status ON orders(device_android_id,status);
CREATE TABLE IF NOT EXISTS authorized_users (id SERIAL PRIMARY KEY, whatsapp_number TEXT UNIQUE NOT NULL, name TEXT, active BOOLEAN DEFAULT TRUE);
