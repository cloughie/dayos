-- Add AI data sharing consent flag to user_profiles.
-- NULL = not yet asked, FALSE = declined, TRUE = granted.
-- Existing rows default to NULL so they are prompted on next AI interaction.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS ai_data_sharing_consent boolean DEFAULT NULL;
