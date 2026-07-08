-- Rename push_subscriptions → push_devices and extend for multi-platform support.
-- Existing web push rows are preserved; the new `platform` column defaults to 'web'.

-- 1. Rename the table
ALTER TABLE push_subscriptions RENAME TO push_devices;

-- 2. Add discriminator and APNs token columns
ALTER TABLE push_devices
  ADD COLUMN platform    text,
  ADD COLUMN apns_token  text;

-- 3. Back-fill platform for all existing rows (must be done before NOT NULL constraint)
UPDATE push_devices SET platform = 'web';

-- 4. Now enforce NOT NULL
ALTER TABLE push_devices ALTER COLUMN platform SET NOT NULL;
ALTER TABLE push_devices ALTER COLUMN platform SET DEFAULT 'web';

-- 5. Web-push credentials are only relevant for web rows; make nullable for iOS rows
ALTER TABLE push_devices
  ALTER COLUMN endpoint DROP NOT NULL,
  ALTER COLUMN p256dh   DROP NOT NULL,
  ALTER COLUMN auth     DROP NOT NULL;

-- 6. Replace UNIQUE(user_id) with UNIQUE(user_id, platform)
--    The inline UNIQUE on the column gets the name push_subscriptions_user_id_key.
ALTER TABLE push_devices DROP CONSTRAINT push_subscriptions_user_id_key;
ALTER TABLE push_devices ADD CONSTRAINT push_devices_user_platform_key UNIQUE (user_id, platform);

-- 7. Rename the index to match the new table name (cosmetic but keeps things tidy)
ALTER INDEX push_subscriptions_user_id_idx RENAME TO push_devices_user_id_idx;

-- 8. Update RLS policy
DROP POLICY "Users can manage own push subscription" ON push_devices;
CREATE POLICY "Users can manage own push device"
  ON push_devices FOR ALL TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
