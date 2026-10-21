-- The candidate scanner can read metadata only, never command payloads or mutation values.
GRANT SELECT(user_id,status,expires_at) ON sdj.commands TO sdj_internal;
GRANT SELECT(user_id,created_at) ON sdj.write_groups TO sdj_internal;
CREATE POLICY maintenance_candidate_scan ON sdj.commands FOR SELECT TO sdj_internal USING(true);
CREATE POLICY maintenance_candidate_scan ON sdj.write_groups FOR SELECT TO sdj_internal USING(true);
