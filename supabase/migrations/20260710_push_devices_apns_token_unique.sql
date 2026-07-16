-- Enforce one APNs token per physical iOS device across all users.
-- A partial index is used so that NULL apns_token values (web-push rows) are ignored.
CREATE UNIQUE INDEX push_devices_apns_token_key
  ON push_devices (apns_token)
  WHERE apns_token IS NOT NULL;
