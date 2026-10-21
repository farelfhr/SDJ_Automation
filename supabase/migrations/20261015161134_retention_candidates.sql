CREATE OR REPLACE FUNCTION sdj.maintenance_candidates()
RETURNS TABLE(user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
 SELECT u.id FROM sdj.users u WHERE u.status='deleting'
 UNION SELECT m.user_id FROM sdj.inbound_messages m WHERE (m.received_at<now()-interval '7 days' AND m.text_ciphertext IS NOT NULL) OR m.received_at<now()-interval '30 days'
 UNION SELECT s.user_id FROM sdj.onboarding_sessions s WHERE (s.expires_at<now() AND s.status NOT IN ('completed','expired','cancelled')) OR s.created_at<now()-interval '30 days'
 UNION SELECT c.user_id FROM sdj.commands c WHERE c.status='awaiting_input' AND c.expires_at<now()
 UNION SELECT g.user_id FROM sdj.write_groups g WHERE g.created_at<now()-interval '30 days'
 UNION SELECT d.user_id FROM sdj.deliveries d WHERE d.created_at<now()-interval '30 days'
$f$;
CREATE FUNCTION sdj.cleanup_expired_nonces()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
 DELETE FROM sdj.bridge_nonces WHERE expires_at<now()-interval '5 minutes';
$f$;
GRANT CREATE ON SCHEMA sdj TO sdj_internal;
ALTER FUNCTION sdj.cleanup_expired_nonces() OWNER TO sdj_internal;
REVOKE CREATE ON SCHEMA sdj FROM sdj_internal;
REVOKE ALL ON FUNCTION sdj.cleanup_expired_nonces() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sdj.cleanup_expired_nonces() TO sdj_maintenance;
REVOKE ALL ON FUNCTION sdj.maintenance_candidates() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sdj.maintenance_candidates() TO sdj_maintenance;
