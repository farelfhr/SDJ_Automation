-- Tenant-scoped retention role. It is never used by HTTP/worker business queries.
DO $p$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','channel_identities','google_connections','tracker_connections','activity_bindings','inbound_messages','commands','write_groups','command_items','mutations','deliveries','jobs','onboarding_sessions','provider_attempts'] LOOP
  EXECUTE format('CREATE POLICY maintenance_tenant ON sdj.%I FOR ALL TO sdj_maintenance USING (%I=nullif(current_setting(''app.user_id'',true),'''')::uuid) WITH CHECK (%I=nullif(current_setting(''app.user_id'',true),'''')::uuid)',t,CASE WHEN t='users' THEN 'id' ELSE 'user_id' END,CASE WHEN t='users' THEN 'id' ELSE 'user_id' END);
  EXECUTE format('GRANT SELECT,UPDATE,DELETE ON sdj.%I TO sdj_maintenance',t);
 END LOOP;
END $p$;
CREATE POLICY tombstone_maintenance ON sdj.deletion_tombstones FOR ALL TO sdj_maintenance
 USING(user_id=nullif(current_setting('app.user_id',true),'')::uuid)
 WITH CHECK(user_id=nullif(current_setting('app.user_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON sdj.deletion_tombstones TO sdj_maintenance;
CREATE FUNCTION sdj.maintenance_candidates()
RETURNS TABLE(user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
 SELECT u.id FROM sdj.users u WHERE u.status='deleting' OR EXISTS(SELECT FROM sdj.inbound_messages m WHERE m.user_id=u.id AND m.received_at<now()-interval '7 days' AND m.text_ciphertext IS NOT NULL)
 UNION SELECT s.user_id FROM sdj.onboarding_sessions s WHERE s.expires_at<now() AND s.status NOT IN ('completed','expired','cancelled');
$f$;
GRANT CREATE ON SCHEMA sdj TO sdj_internal;
ALTER FUNCTION sdj.maintenance_candidates() OWNER TO sdj_internal;
REVOKE CREATE ON SCHEMA sdj FROM sdj_internal;
REVOKE ALL ON FUNCTION sdj.maintenance_candidates() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sdj.maintenance_candidates() TO sdj_maintenance;
