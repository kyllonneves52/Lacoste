ALTER TABLE verification_devices ADD COLUMN IF NOT EXISTS mb_android_id TEXT;
CREATE INDEX IF NOT EXISTS idx_verification_devices_mb ON verification_devices(mb_android_id);
