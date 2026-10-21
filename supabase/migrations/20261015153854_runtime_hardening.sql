DROP FUNCTION sdj.claim_job(text,bytea);
CREATE FUNCTION sdj.claim_job(p_worker text,p_token bytea,p_user uuid DEFAULT NULL)
RETURNS TABLE(id uuid,user_id uuid,message_id uuid,group_id uuid,kind text,attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
BEGIN
 UPDATE sdj.jobs SET status='failed',last_error_code='LEASE_ATTEMPTS_EXHAUSTED' WHERE status='leased' AND lease_expires_at<now() AND attempts>=max_attempts AND (p_user IS NULL OR jobs.user_id=p_user);
 RETURN QUERY UPDATE sdj.jobs j SET status='leased',attempts=j.attempts+1,lease_owner=p_worker,lease_token_hash=p_token,lease_expires_at=now()+interval '60 seconds'
 WHERE j.id=(
  SELECT q.id FROM sdj.jobs q WHERE (q.status='queued' OR q.status='leased' AND q.lease_expires_at<now())
  AND (p_user IS NULL OR q.user_id=p_user) AND q.available_at<=now() AND q.attempts<q.max_attempts
  AND (q.kind='reconcile_mutation' OR NOT EXISTS(
   SELECT FROM sdj.jobs older WHERE older.user_id=q.user_id AND older.kind='process_message' AND older.status IN ('queued','leased')
   AND (older.created_at,older.id)<(q.created_at,q.id)))
  ORDER BY (q.kind='reconcile_mutation') DESC,q.available_at,q.created_at,q.id FOR UPDATE SKIP LOCKED LIMIT 1)
 RETURNING j.id,j.user_id,j.message_id,j.group_id,j.kind,j.attempts;
END $f$;
GRANT CREATE ON SCHEMA sdj TO sdj_internal;
ALTER FUNCTION sdj.claim_job(text,bytea,uuid) OWNER TO sdj_internal;
REVOKE CREATE ON SCHEMA sdj FROM sdj_internal;
REVOKE ALL ON FUNCTION sdj.claim_job(text,bytea,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sdj.claim_job(text,bytea,uuid) TO sdj_scheduler;
-- Synthetic probes share the primary DB while remaining identifiable and unable to overwrite real provider configuration.
CREATE POLICY synthetic_target_maintenance ON sdj.ai_targets FOR ALL TO sdj_maintenance
 USING(id LIKE 'synthetic-%') WITH CHECK(id LIKE 'synthetic-%');
CREATE POLICY synthetic_bucket_maintenance ON sdj.quota_buckets FOR ALL TO sdj_maintenance
 USING(owner_ref LIKE 'synthetic-%') WITH CHECK(owner_ref LIKE 'synthetic-%');
GRANT SELECT,INSERT,UPDATE,DELETE ON sdj.ai_targets,sdj.quota_buckets TO sdj_maintenance;
