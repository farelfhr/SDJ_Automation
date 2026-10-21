-- Preserve account deletion when rolling back to the pre-reminder maintenance code.
ALTER TABLE sdj.reminder_occurrences DROP CONSTRAINT reminder_occurrences_user_id_fkey;
ALTER TABLE sdj.reminder_occurrences ADD CONSTRAINT reminder_occurrences_user_id_fkey FOREIGN KEY(user_id) REFERENCES sdj.users(id) ON DELETE CASCADE;
ALTER TABLE sdj.reminder_occurrences DROP CONSTRAINT reminder_occurrences_identity_id_user_id_fkey;
ALTER TABLE sdj.reminder_occurrences ADD CONSTRAINT reminder_occurrences_identity_id_user_id_fkey FOREIGN KEY(identity_id,user_id) REFERENCES sdj.channel_identities(id,user_id) ON DELETE CASCADE;
