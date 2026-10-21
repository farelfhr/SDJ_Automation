-- Additive rollout. Reminder scheduling stays disabled until REMINDERS_ENABLED=true.
ALTER TABLE sdj.users ADD COLUMN reminders_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE sdj.users ADD COLUMN reminders_started_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sdj.users ADD COLUMN profile_name_ciphertext bytea;
ALTER TABLE sdj.onboarding_sessions ADD COLUMN purpose text NOT NULL DEFAULT 'connect' CHECK(purpose IN ('connect','profile'));
ALTER TABLE sdj.onboarding_sessions ADD COLUMN profile_name_ciphertext bytea;
ALTER TABLE sdj.onboarding_sessions ADD COLUMN provider_policy_version text NOT NULL DEFAULT 'free-providers-v1';
ALTER TABLE sdj.commands ADD COLUMN interpretation_route text CHECK(interpretation_route IN ('parser','pending','ai'));
ALTER TABLE sdj.provider_attempts ADD COLUMN duration_ms integer CHECK(duration_ms>=0);

CREATE TABLE sdj.reminder_occurrences (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),identity_id uuid NOT NULL,
 local_date date NOT NULL,slot text NOT NULL CHECK(slot IN ('morning','afternoon','evening')),
 scheduled_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','leased','queued','cancelled')),
 lease_expires_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id),UNIQUE(id,user_id,identity_id),UNIQUE(user_id,local_date,slot),
 FOREIGN KEY(identity_id,user_id) REFERENCES sdj.channel_identities(id,user_id),
 CHECK(expires_at=scheduled_at+interval '30 minutes')
);
CREATE INDEX reminder_queue ON sdj.reminder_occurrences(scheduled_at) WHERE status IN ('ready','leased');
ALTER TABLE sdj.reminder_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdj.reminder_occurrences FORCE ROW LEVEL SECURITY;
CREATE POLICY reminder_tenant ON sdj.reminder_occurrences FOR ALL TO sdj_app,sdj_maintenance
 USING(user_id=nullif(current_setting('app.user_id',true),'')::uuid)
 WITH CHECK(user_id=nullif(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY reminder_internal ON sdj.reminder_occurrences FOR ALL TO sdj_internal USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE ON sdj.reminder_occurrences TO sdj_app,sdj_internal;
GRANT SELECT,UPDATE,DELETE ON sdj.reminder_occurrences TO sdj_maintenance;
-- Only scheduling functions need cross-tenant eligibility reads.
CREATE POLICY reminder_tracker_read ON sdj.tracker_connections FOR SELECT TO sdj_internal USING(true);
CREATE POLICY reminder_google_read ON sdj.google_connections FOR SELECT TO sdj_internal USING(true);
GRANT SELECT ON sdj.tracker_connections,sdj.google_connections TO sdj_internal;

ALTER TABLE sdj.deliveries ALTER COLUMN command_id DROP NOT NULL;
ALTER TABLE sdj.deliveries ALTER COLUMN source_message_id DROP NOT NULL;
ALTER TABLE sdj.deliveries ADD COLUMN reminder_id uuid;
ALTER TABLE sdj.deliveries ADD CONSTRAINT delivery_reminder_fk FOREIGN KEY(reminder_id,user_id,identity_id) REFERENCES sdj.reminder_occurrences(id,user_id,identity_id);
ALTER TABLE sdj.deliveries DROP CONSTRAINT deliveries_kind_check;
ALTER TABLE sdj.deliveries ADD CONSTRAINT deliveries_kind_check CHECK(kind IN ('onboarding','clarification','pending','terminal','status','reminder'));
ALTER TABLE sdj.deliveries ADD CONSTRAINT delivery_origin CHECK(
 (kind='reminder' AND reminder_id IS NOT NULL AND command_id IS NULL AND source_message_id IS NULL) OR
 (kind<>'reminder' AND reminder_id IS NULL AND command_id IS NOT NULL AND source_message_id IS NOT NULL));
CREATE UNIQUE INDEX delivery_one_reminder ON sdj.deliveries(reminder_id) WHERE reminder_id IS NOT NULL;

CREATE FUNCTION sdj.reminder_eligible(p_user uuid,p_identity uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
 SELECT EXISTS(SELECT FROM sdj.users u JOIN sdj.channel_identities i ON i.user_id=u.id
 JOIN sdj.tracker_connections t ON t.user_id=u.id JOIN sdj.google_connections g ON g.id=t.google_connection_id AND g.user_id=u.id
 WHERE u.id=p_user AND i.id=p_identity AND u.status='active' AND u.reminders_enabled AND i.status='active'
 AND t.status='active' AND g.status='active');
$f$;
CREATE FUNCTION sdj.claim_reminders(p_account text,p_now timestamptz,p_limit integer)
RETURNS TABLE(id uuid,user_id uuid,local_date date,slot text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
BEGIN
 IF p_limit<1 OR p_limit>20 OR abs(extract(epoch FROM now()-p_now))>60 THEN RAISE EXCEPTION 'INVALID_REMINDER_SCAN'; END IF;
 INSERT INTO sdj.reminder_occurrences(id,user_id,identity_id,local_date,slot,scheduled_at,expires_at)
 SELECT gen_random_uuid(),u.id,i.id,(p_now AT TIME ZONE 'Asia/Jakarta')::date,s.slot,
 ((p_now AT TIME ZONE 'Asia/Jakarta')::date+s.at_time) AT TIME ZONE 'Asia/Jakarta',
 (((p_now AT TIME ZONE 'Asia/Jakarta')::date+s.at_time) AT TIME ZONE 'Asia/Jakarta')+interval '30 minutes'
 FROM sdj.users u JOIN sdj.channel_identities i ON i.user_id=u.id
 CROSS JOIN (VALUES('morning',time '07:00'),('afternoon',time '13:00'),('evening',time '20:00')) s(slot,at_time)
 WHERE i.channel_account_id=p_account AND sdj.reminder_eligible(u.id,i.id)
 AND ((p_now AT TIME ZONE 'Asia/Jakarta')::date+s.at_time) AT TIME ZONE 'Asia/Jakarta' BETWEEN u.reminders_started_at AND p_now
 AND p_now<(((p_now AT TIME ZONE 'Asia/Jakarta')::date+s.at_time) AT TIME ZONE 'Asia/Jakarta')+interval '30 minutes'
 ON CONFLICT ON CONSTRAINT reminder_occurrences_user_id_local_date_slot_key DO NOTHING;
 UPDATE sdj.reminder_occurrences r SET status='cancelled',lease_expires_at=NULL
 WHERE r.status IN ('ready','leased') AND (r.expires_at<=p_now OR NOT sdj.reminder_eligible(r.user_id,r.identity_id));
 RETURN QUERY WITH q AS (
 SELECT r.id FROM sdj.reminder_occurrences r JOIN sdj.channel_identities i ON i.id=r.identity_id AND i.user_id=r.user_id
 WHERE i.channel_account_id=p_account AND r.expires_at>p_now
 AND (r.status='ready' OR r.status='leased' AND r.lease_expires_at<=p_now)
 ORDER BY r.scheduled_at,r.id FOR UPDATE OF r SKIP LOCKED LIMIT p_limit
 ) UPDATE sdj.reminder_occurrences r SET status='leased',lease_expires_at=p_now+interval '60 seconds'
 FROM q WHERE r.id=q.id RETURNING r.id,r.user_id,r.local_date,r.slot;
END $f$;

CREATE FUNCTION sdj.claim_delivery(p_account text,p_token bytea,p_reminders boolean)
RETURNS TABLE(id uuid,user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
BEGIN
 UPDATE sdj.deliveries SET status='delivery_unknown' WHERE channel_account_id=p_account AND status='leased' AND lease_expires_at<now();
 UPDATE sdj.deliveries d SET status='cancelled' FROM sdj.reminder_occurrences r
 WHERE d.reminder_id=r.id AND d.channel_account_id=p_account AND d.status='pending'
 AND (NOT p_reminders OR d.attempts>=3 OR r.expires_at<=now() OR NOT sdj.reminder_eligible(d.user_id,d.identity_id));
 RETURN QUERY UPDATE sdj.deliveries d SET status='leased',attempts=d.attempts+1,lease_token_hash=p_token,lease_expires_at=now()+interval '60 seconds'
 WHERE d.id=(SELECT q.id FROM sdj.deliveries q WHERE q.channel_account_id=p_account AND q.status='pending' AND q.available_at<=now()
 ORDER BY (q.kind='reminder'),q.available_at,q.id FOR UPDATE SKIP LOCKED LIMIT 1)
 RETURNING d.id,d.user_id;
END $f$;
-- Older deployments safely ignore reminders on rollback.
CREATE OR REPLACE FUNCTION sdj.claim_delivery(p_account text,p_token bytea)
RETURNS TABLE(id uuid,user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
 SELECT * FROM sdj.claim_delivery(p_account,p_token,false);
$f$;

CREATE OR REPLACE FUNCTION sdj.reserve_ai(p_targets text[],p_attempt uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
DECLARE uid uuid:=nullif(current_setting('app.user_id',true),'')::uuid;cur bigint;i integer;t sdj.ai_targets%ROWTYPE;b sdj.quota_buckets%ROWTYPE;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT FROM sdj.users WHERE id=uid AND status='active' AND ai_processing_allowed) THEN RETURN NULL; END IF;
 SELECT cursor INTO cur FROM sdj.ai_routing_state WHERE id=true FOR UPDATE;
 IF (SELECT count(*) FROM sdj.provider_attempts WHERE user_id=uid AND created_at>now()-interval '1 minute')>=5 OR
    (SELECT count(*) FROM sdj.provider_attempts WHERE user_id=uid AND created_at>date_trunc('day',now()))>=50 THEN RETURN NULL; END IF;
 IF cardinality(p_targets)=0 THEN RETURN NULL; END IF;
 FOR i IN 0..cardinality(p_targets)-1 LOOP
  SELECT * INTO t FROM sdj.ai_targets WHERE id=p_targets[i+1] AND enabled
   AND (provider<>'openrouter' OR EXISTS(SELECT FROM sdj.users WHERE id=uid AND provider_policy_version='free-providers-v2'));
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO b FROM sdj.quota_buckets WHERE owner_ref=t.quota_owner FOR UPDATE;
  IF NOT FOUND OR b.disabled OR b.blocked_until>now() THEN CONTINUE; END IF;
  IF (SELECT count(*) FROM sdj.provider_attempts WHERE owner_ref=t.quota_owner AND created_at>now()-interval '1 minute')>=t.requests_per_minute OR
     (SELECT count(*) FROM sdj.provider_attempts WHERE owner_ref=t.quota_owner AND created_at>date_trunc('day',now()))>=t.requests_per_day THEN CONTINUE; END IF;
  INSERT INTO sdj.provider_attempts(id,user_id,target_id,owner_ref,status) VALUES(p_attempt,uid,t.id,t.quota_owner,'reserved');
  UPDATE sdj.ai_routing_state SET cursor=cur+i+1 WHERE id=true;
  RETURN t.id;
 END LOOP;
 RETURN NULL;
END $f$;

GRANT CREATE ON SCHEMA sdj TO sdj_internal;
ALTER FUNCTION sdj.reminder_eligible(uuid,uuid) OWNER TO sdj_internal;
ALTER FUNCTION sdj.claim_reminders(text,timestamptz,integer) OWNER TO sdj_internal;
ALTER FUNCTION sdj.claim_delivery(text,bytea,boolean) OWNER TO sdj_internal;
REVOKE CREATE ON SCHEMA sdj FROM sdj_internal;
REVOKE ALL ON FUNCTION sdj.reminder_eligible(uuid,uuid),sdj.claim_reminders(text,timestamptz,integer),sdj.claim_delivery(text,bytea,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION sdj.claim_reminders(text,timestamptz,integer),sdj.claim_delivery(text,bytea,boolean) TO sdj_scheduler;

CREATE OR REPLACE FUNCTION sdj.maintenance_candidates()
RETURNS TABLE(user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
 SELECT u.id FROM sdj.users u WHERE u.status='deleting'
 UNION SELECT m.user_id FROM sdj.inbound_messages m WHERE (m.received_at<now()-interval '7 days' AND m.text_ciphertext IS NOT NULL) OR m.received_at<now()-interval '30 days'
 UNION SELECT s.user_id FROM sdj.onboarding_sessions s WHERE (s.expires_at<now() AND s.status NOT IN ('completed','expired','cancelled')) OR s.created_at<now()-interval '30 days'
 UNION SELECT c.user_id FROM sdj.commands c WHERE c.status='awaiting_input' AND c.expires_at<now()
 UNION SELECT g.user_id FROM sdj.write_groups g WHERE g.created_at<now()-interval '30 days'
 UNION SELECT d.user_id FROM sdj.deliveries d WHERE d.created_at<now()-interval '30 days'
 UNION SELECT r.user_id FROM sdj.reminder_occurrences r WHERE r.created_at<now()-interval '30 days'
$f$;
