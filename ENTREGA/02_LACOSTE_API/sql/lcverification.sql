-- LC Verification
CREATE TABLE IF NOT EXISTS payment_verification_configs (
  group_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'off',
  verification_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  verification_device_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_verification_configs_device ON payment_verification_configs(verification_device_id);

CREATE TABLE IF NOT EXISTS verification_devices (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'android',
  device_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  fcm_token TEXT,
  apns_token TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  license_key TEXT,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_verification_devices_device ON verification_devices(platform,device_id);

CREATE TABLE IF NOT EXISTS payment_verifications (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  group_id TEXT,
  reference TEXT,
  amount_mt NUMERIC,
  expected_provider TEXT NOT NULL DEFAULT 'todos',
  provider TEXT,
  expected_payment_id TEXT,
  expected_amount NUMERIC,
  expected_date TEXT,
  expected_time TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sms_text TEXT,
  sms_sender TEXT,
  received_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  verification_device_id TEXT,
  failure_reason TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_verifications_order ON payment_verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_verifications_status_expiry ON payment_verifications(status,expires_at);
ALTER TABLE payment_verifications DROP CONSTRAINT IF EXISTS payment_verifications_operator_check;
UPDATE payment_verifications SET operator = CASE
  WHEN LOWER(REPLACE(COALESCE(operator,''),' ','')) IN ('mpesa','vodacom','voda') THEN 'voda'
  WHEN LOWER(REPLACE(COALESCE(operator,''),' ','')) IN ('emola','movitel','e-mola') THEN 'emola'
  WHEN LOWER(REPLACE(COALESCE(operator,''),' ','')) IN ('todos','all','sms','') THEN 'todos'
  ELSE 'todos' END;
ALTER TABLE payment_verifications ADD CONSTRAINT payment_verifications_operator_check CHECK (operator IN ('voda','emola','todos'));
DROP INDEX IF EXISTS idx_payment_verifications_payment_id;
CREATE INDEX IF NOT EXISTS idx_payment_verifications_payment_id ON payment_verifications(provider,expected_payment_id) WHERE expected_payment_id IS NOT NULL AND expected_payment_id<>'';
ALTER TABLE license_requests ADD COLUMN IF NOT EXISTS device_role TEXT DEFAULT 'auto';

ALTER TABLE verification_devices ADD COLUMN IF NOT EXISTS mb_android_id TEXT;
CREATE INDEX IF NOT EXISTS idx_verification_devices_mb ON verification_devices(mb_android_id);


ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE payment_verifications ADD COLUMN IF NOT EXISTS amount_mt NUMERIC;
UPDATE payment_verifications SET reference=COALESCE(NULLIF(reference,''),expected_payment_id) WHERE reference IS NULL OR reference='';
UPDATE payment_verifications SET amount_mt=COALESCE(amount_mt,expected_amount) WHERE amount_mt IS NULL;
