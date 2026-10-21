
-- SDJ full MVP. Only migration tooling may run this file.
-- Runtime roles are NOLOGIN until provisioned by scripts/setup-runtime.ts.
CREATE SCHEMA IF NOT EXISTS sdj;
REVOKE ALL ON SCHEMA sdj FROM PUBLIC, anon, authenticated;
DO $roles$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='sdj_app') THEN CREATE ROLE sdj_app NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='sdj_ingress') THEN CREATE ROLE sdj_ingress NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='sdj_scheduler') THEN CREATE ROLE sdj_scheduler NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='sdj_maintenance') THEN CREATE ROLE sdj_maintenance NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='sdj_internal') THEN CREATE ROLE sdj_internal NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF;
END $roles$;
GRANT sdj_internal TO postgres;
GRANT USAGE ON SCHEMA sdj TO sdj_app,sdj_ingress,sdj_scheduler,sdj_maintenance,sdj_internal;
GRANT CREATE ON SCHEMA sdj TO sdj_internal;
ALTER DEFAULT PRIVILEGES IN SCHEMA sdj REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
CREATE TABLE sdj.users (
 id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 timezone text NOT NULL DEFAULT 'Asia/Jakarta',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','suspended','deleting','deleted')),
 ai_processing_allowed boolean NOT NULL DEFAULT false, privacy_notice_version text, provider_policy_version text,
 consented_at timestamptz,deletion_requested_at timestamptz,version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(status<>'active' OR privacy_notice_version IS NOT NULL AND consented_at IS NOT NULL)
);
CREATE TABLE sdj.channel_identities (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),channel text NOT NULL CHECK(channel='whatsapp'),
 channel_account_id text NOT NULL,sender_lookup bytea NOT NULL,sender_ciphertext bytea NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),verified_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,user_id),UNIQUE(channel,channel_account_id,sender_lookup)
);
CREATE UNIQUE INDEX identity_one_active ON sdj.channel_identities(user_id) WHERE status='active';
CREATE TABLE sdj.template_versions (
 id text PRIMARY KEY, config_sha256 text NOT NULL,schema_version integer NOT NULL CHECK(schema_version=2),
 expected_sheet_title text NOT NULL,header_row_index integer NOT NULL CHECK(header_row_index>=0),
 first_input_column_index integer NOT NULL CHECK(first_input_column_index>=0),created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO sdj.template_versions VALUES ('sdj-v1.2-full-v1','5a87bfe83d866f4cae91e71675deded1f42c0de3a3be6591af7ca4af14d2b1d9',2,'[NEW] SDJ v1.2',6,9,now());
CREATE TABLE sdj.activity_definitions (
 template_id text NOT NULL REFERENCES sdj.template_versions(id),activity_id text NOT NULL,
 config jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(template_id,activity_id)
);
CREATE TABLE sdj.google_connections (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),subject_lookup bytea NOT NULL,subject_ciphertext bytea NOT NULL,
 refresh_token_ciphertext bytea,granted_scopes text[] NOT NULL,version bigint NOT NULL DEFAULT 1,
 status text NOT NULL CHECK(status IN ('pending','active','reauth_required','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id),CHECK(status NOT IN ('active','reauth_required') OR refresh_token_ciphertext IS NOT NULL)
);
CREATE UNIQUE INDEX google_one_active ON sdj.google_connections(user_id) WHERE status IN ('active','reauth_required');
CREATE TABLE sdj.tracker_connections (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),google_connection_id uuid NOT NULL,
 spreadsheet_id text NOT NULL,sheet_id integer NOT NULL CHECK(sheet_id>=0),sheet_title text NOT NULL,
 template_id text NOT NULL REFERENCES sdj.template_versions(id),structure_fingerprint text NOT NULL,
 config_version bigint NOT NULL DEFAULT 1,version bigint NOT NULL DEFAULT 1,
 status text NOT NULL CHECK(status IN ('pending','active','needs_validation','reauth_required','disabled','archived')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id),UNIQUE(id,user_id,template_id),
 FOREIGN KEY(google_connection_id,user_id) REFERENCES sdj.google_connections(id,user_id)
);
CREATE UNIQUE INDEX tracker_one_operational ON sdj.tracker_connections(user_id) WHERE status IN ('active','needs_validation','reauth_required');
CREATE UNIQUE INDEX tracker_file_owner ON sdj.tracker_connections(spreadsheet_id) WHERE status IN ('active','needs_validation','reauth_required');
CREATE INDEX tracker_google_fk ON sdj.tracker_connections(user_id,google_connection_id);
CREATE TABLE sdj.activity_bindings (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),tracker_id uuid NOT NULL,template_id text NOT NULL,activity_id text NOT NULL,
 row_index integer NOT NULL CHECK(row_index>=0),normalized_label_hash text NOT NULL,binding_version bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,user_id,tracker_id,activity_id),UNIQUE(tracker_id,activity_id),UNIQUE(tracker_id,row_index),
 FOREIGN KEY(tracker_id,user_id,template_id) REFERENCES sdj.tracker_connections(id,user_id,template_id),
 FOREIGN KEY(template_id,activity_id) REFERENCES sdj.activity_definitions(template_id,activity_id)
);
CREATE INDEX binding_user_tracker ON sdj.activity_bindings(user_id,tracker_id);
CREATE TABLE sdj.inbound_messages (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),identity_id uuid NOT NULL,
 channel text NOT NULL CHECK(channel='whatsapp'),channel_account_id text NOT NULL,external_message_id text NOT NULL,
 conversation_ciphertext bytea NOT NULL,text_ciphertext bytea,body_digest bytea NOT NULL,
 sent_at timestamptz NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','routed','ignored','rejected','collision')),
 UNIQUE(id,user_id),UNIQUE(channel,channel_account_id,external_message_id),
 FOREIGN KEY(identity_id,user_id) REFERENCES sdj.channel_identities(id,user_id)
);
CREATE INDEX message_identity_fk ON sdj.inbound_messages(user_id,identity_id);
CREATE TABLE sdj.commands (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),identity_id uuid NOT NULL,origin_message_id uuid NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','interpreting','awaiting_input','ready','applying','completed','applied','partially_applied','no_op','rejected','uncertain','needs_review','conflict','cancelled','expired')),
 timezone_snapshot text NOT NULL,reference_received_at timestamptz NOT NULL,intent_ciphertext bytea,pending_ciphertext bytea,
 expires_at timestamptz,completed_at timestamptz,version bigint NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id),FOREIGN KEY(identity_id,user_id) REFERENCES sdj.channel_identities(id,user_id),
 FOREIGN KEY(origin_message_id,user_id) REFERENCES sdj.inbound_messages(id,user_id),
 CHECK(status<>'awaiting_input' OR expires_at IS NOT NULL AND pending_ciphertext IS NOT NULL)
);
CREATE UNIQUE INDEX one_pending_per_identity ON sdj.commands(identity_id) WHERE status='awaiting_input';
CREATE INDEX commands_user_recent ON sdj.commands(user_id,created_at DESC);
CREATE INDEX commands_identity_fk ON sdj.commands(user_id,identity_id);
CREATE TABLE sdj.write_groups (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),command_id uuid NOT NULL UNIQUE,tracker_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('prepared','sending','verified','uncertain','needs_review','conflict','failed')),
 undo_of_id uuid,send_attempts integer NOT NULL DEFAULT 0 CHECK(send_attempts BETWEEN 0 AND 3),version bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),verified_at timestamptz,reconcile_after timestamptz,
 UNIQUE(id,user_id),UNIQUE(id,user_id,tracker_id),
 FOREIGN KEY(command_id,user_id) REFERENCES sdj.commands(id,user_id),
 FOREIGN KEY(tracker_id,user_id) REFERENCES sdj.tracker_connections(id,user_id),
 FOREIGN KEY(undo_of_id,user_id,tracker_id) REFERENCES sdj.write_groups(id,user_id,tracker_id),
 CHECK(status<>'verified' OR verified_at IS NOT NULL)
);
CREATE UNIQUE INDEX one_unresolved_group ON sdj.write_groups(tracker_id) WHERE status IN ('prepared','sending','uncertain','needs_review');
CREATE UNIQUE INDEX one_group_undo ON sdj.write_groups(undo_of_id) WHERE undo_of_id IS NOT NULL AND status NOT IN ('failed','conflict');
CREATE INDEX groups_user_tracker ON sdj.write_groups(user_id,tracker_id,created_at DESC);
CREATE TABLE sdj.command_items (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),command_id uuid NOT NULL,tracker_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 4),activity_id text NOT NULL,activity_date date NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,user_id,tracker_id,activity_id),UNIQUE(command_id,ordinal),UNIQUE(command_id,activity_id,activity_date),
 FOREIGN KEY(command_id,user_id) REFERENCES sdj.commands(id,user_id),FOREIGN KEY(tracker_id,user_id) REFERENCES sdj.tracker_connections(id,user_id)
);
CREATE TABLE sdj.mutations (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),group_id uuid NOT NULL,tracker_id uuid NOT NULL,
 item_id uuid NOT NULL UNIQUE,binding_id uuid NOT NULL,activity_id text NOT NULL,
 snapshot_ciphertext bytea NOT NULL,before_value_ciphertext bytea NOT NULL,after_value_ciphertext bytea NOT NULL,
 status text NOT NULL CHECK(status IN ('prepared','sending','verified','uncertain','needs_review','conflict','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),verified_at timestamptz,
 FOREIGN KEY(group_id,user_id,tracker_id) REFERENCES sdj.write_groups(id,user_id,tracker_id),
 FOREIGN KEY(item_id,user_id,tracker_id,activity_id) REFERENCES sdj.command_items(id,user_id,tracker_id,activity_id),
 FOREIGN KEY(binding_id,user_id,tracker_id,activity_id) REFERENCES sdj.activity_bindings(id,user_id,tracker_id,activity_id),
 CHECK(status<>'verified' OR verified_at IS NOT NULL)
);
CREATE INDEX mutation_group_fk ON sdj.mutations(user_id,group_id);
CREATE INDEX mutation_binding_fk ON sdj.mutations(user_id,binding_id);
CREATE TABLE sdj.deliveries (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),command_id uuid NOT NULL,identity_id uuid NOT NULL,source_message_id uuid NOT NULL,
 channel_account_id text NOT NULL,dedupe_key text NOT NULL,body_ciphertext bytea NOT NULL,
 kind text NOT NULL CHECK(kind IN ('onboarding','clarification','pending','terminal','status')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','leased','sent','delivery_unknown','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),lease_token_hash bytea,lease_expires_at timestamptz,
 remote_message_id text,sent_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,dedupe_key),
 FOREIGN KEY(command_id,user_id) REFERENCES sdj.commands(id,user_id),
 FOREIGN KEY(identity_id,user_id) REFERENCES sdj.channel_identities(id,user_id),
 FOREIGN KEY(source_message_id,user_id) REFERENCES sdj.inbound_messages(id,user_id),
 CHECK(status<>'sent' OR sent_at IS NOT NULL)
);
CREATE INDEX delivery_queue ON sdj.deliveries(channel_account_id,available_at,id) WHERE status='pending';
CREATE INDEX delivery_source_fk ON sdj.deliveries(user_id,source_message_id);
CREATE INDEX delivery_identity_fk ON sdj.deliveries(user_id,identity_id);
CREATE INDEX delivery_command_fk ON sdj.deliveries(user_id,command_id);
CREATE TABLE sdj.jobs (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),kind text NOT NULL CHECK(kind IN ('process_message','reconcile_mutation')),
 message_id uuid,group_id uuid,dedupe_key text NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','leased','done','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),max_attempts integer NOT NULL DEFAULT 5 CHECK(max_attempts>0),
 available_at timestamptz NOT NULL DEFAULT now(),lease_token_hash bytea,lease_owner text,lease_expires_at timestamptz,last_error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,dedupe_key),
 FOREIGN KEY(message_id,user_id) REFERENCES sdj.inbound_messages(id,user_id),
 FOREIGN KEY(group_id,user_id) REFERENCES sdj.write_groups(id,user_id),
 CHECK((kind='process_message' AND message_id IS NOT NULL AND group_id IS NULL) OR (kind='reconcile_mutation' AND group_id IS NOT NULL AND message_id IS NULL))
);
CREATE INDEX job_queue ON sdj.jobs(available_at,id) WHERE status IN ('queued','leased');
CREATE INDEX job_fifo ON sdj.jobs(user_id,created_at,id) WHERE status IN ('queued','leased');
CREATE INDEX job_message_fk ON sdj.jobs(user_id,message_id);
CREATE INDEX job_group_fk ON sdj.jobs(user_id,group_id);
CREATE TABLE sdj.onboarding_sessions (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),identity_id uuid NOT NULL,source_message_id uuid NOT NULL,
 link_token_hash bytea UNIQUE NOT NULL,browser_session_hash bytea UNIQUE,csrf_hash bytea,oauth_state_hash bytea UNIQUE,
 pkce_ciphertext bytea,pending_google_connection_id uuid,pending_tracker_id uuid,
 channel_challenge_hash bytea,challenge_attempts integer NOT NULL DEFAULT 0 CHECK(challenge_attempts BETWEEN 0 AND 5),
 ai_allowed boolean NOT NULL DEFAULT false,
 status text NOT NULL CHECK(status IN ('created','browser_bound','oauth_pending','file_selection','channel_confirmation','completed','expired','cancelled')),
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id),FOREIGN KEY(identity_id,user_id) REFERENCES sdj.channel_identities(id,user_id),
 FOREIGN KEY(source_message_id,user_id) REFERENCES sdj.inbound_messages(id,user_id),
 FOREIGN KEY(pending_google_connection_id,user_id) REFERENCES sdj.google_connections(id,user_id),
 FOREIGN KEY(pending_tracker_id,user_id) REFERENCES sdj.tracker_connections(id,user_id)
);
CREATE UNIQUE INDEX one_onboarding ON sdj.onboarding_sessions(identity_id) WHERE status NOT IN ('completed','expired','cancelled');
CREATE INDEX onboarding_expiry ON sdj.onboarding_sessions(expires_at);
CREATE TABLE sdj.bridge_nonces (key_id text NOT NULL,nonce_hash bytea NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(key_id,nonce_hash));
CREATE INDEX nonce_expiry ON sdj.bridge_nonces(expires_at);
CREATE TABLE sdj.ai_targets (
 id text PRIMARY KEY,provider text NOT NULL CHECK(provider IN ('groq','gemini','nvidia')),model_id text NOT NULL,
 credential_ref text NOT NULL,quota_owner text NOT NULL,enabled boolean NOT NULL DEFAULT false,
 requests_per_minute integer NOT NULL CHECK(requests_per_minute>0),requests_per_day integer NOT NULL CHECK(requests_per_day>0),
 provider_policy_version text NOT NULL DEFAULT 'free-providers-v1',created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sdj.quota_buckets (
 owner_ref text PRIMARY KEY,blocked_until timestamptz,disabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sdj.ai_routing_state (id boolean PRIMARY KEY DEFAULT true CHECK(id),cursor bigint NOT NULL DEFAULT 0);
INSERT INTO sdj.ai_routing_state VALUES(true,0);
CREATE TABLE sdj.provider_attempts (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES sdj.users(id),target_id text NOT NULL REFERENCES sdj.ai_targets(id),
 owner_ref text NOT NULL REFERENCES sdj.quota_buckets(owner_ref),
 status text NOT NULL CHECK(status IN ('reserved','succeeded','failed','unknown')),normalized_error text,tokens integer,
 created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz
);
CREATE INDEX attempts_owner_window ON sdj.provider_attempts(owner_ref,created_at);
CREATE INDEX attempts_user_window ON sdj.provider_attempts(user_id,created_at);
CREATE INDEX attempts_target_fk ON sdj.provider_attempts(target_id);
CREATE TABLE sdj.deletion_tombstones (user_id uuid PRIMARY KEY,requested_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
-- Explicit policies for a non-login, non-member internal function owner. No API role gets its table grants.
DO $policies$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['users','channel_identities','google_connections','tracker_connections','activity_bindings','inbound_messages','commands','write_groups','command_items','mutations','deliveries','jobs','onboarding_sessions','provider_attempts'] LOOP
  EXECUTE format('ALTER TABLE sdj.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE sdj.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_policy ON sdj.%I FOR ALL TO sdj_app USING (%I=nullif(current_setting(''app.user_id'',true),'''')::uuid) WITH CHECK (%I=nullif(current_setting(''app.user_id'',true),'''')::uuid)',t,CASE WHEN t='users' THEN 'id' ELSE 'user_id' END,CASE WHEN t='users' THEN 'id' ELSE 'user_id' END);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['users','channel_identities','inbound_messages','jobs','deliveries','onboarding_sessions','provider_attempts'] LOOP
  EXECUTE format('CREATE POLICY internal_function_policy ON sdj.%I FOR ALL TO sdj_internal USING (true) WITH CHECK (true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['template_versions','activity_definitions','bridge_nonces','ai_targets','quota_buckets','ai_routing_state','deletion_tombstones'] LOOP
  EXECUTE format('ALTER TABLE sdj.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE sdj.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY internal_config_policy ON sdj.%I FOR ALL TO sdj_internal USING (true) WITH CHECK (true)',t);
 END LOOP;
END $policies$;
GRANT SELECT,INSERT,UPDATE ON sdj.users,sdj.channel_identities,sdj.google_connections,sdj.tracker_connections,sdj.activity_bindings,sdj.inbound_messages,sdj.commands,sdj.write_groups,sdj.command_items,sdj.mutations,sdj.deliveries,sdj.jobs,sdj.onboarding_sessions,sdj.provider_attempts TO sdj_app;
GRANT SELECT ON sdj.template_versions,sdj.activity_definitions TO sdj_app;
CREATE POLICY template_read ON sdj.template_versions FOR SELECT TO sdj_app USING(true);
CREATE POLICY activity_read ON sdj.activity_definitions FOR SELECT TO sdj_app USING(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON sdj.users,sdj.channel_identities,sdj.inbound_messages,sdj.jobs,sdj.deliveries,sdj.onboarding_sessions,sdj.provider_attempts,sdj.bridge_nonces,sdj.ai_targets,sdj.quota_buckets,sdj.ai_routing_state,sdj.deletion_tombstones TO sdj_internal;

CREATE FUNCTION sdj.resolve_identity(p_lookup bytea,p_user uuid,p_identity uuid,p_sender bytea,p_account text)
RETURNS TABLE(user_id uuid,identity_id uuid) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
DECLARE v_user uuid;v_identity uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(encode(p_lookup,'hex'),0));
 SELECT i.user_id,i.id INTO v_user,v_identity FROM sdj.channel_identities i WHERE i.channel='whatsapp' AND i.channel_account_id=p_account AND i.sender_lookup=p_lookup AND i.status='active';
 IF v_user IS NULL THEN
  IF EXISTS(SELECT FROM sdj.channel_identities WHERE channel_account_id=p_account AND sender_lookup=p_lookup) THEN RAISE EXCEPTION 'IDENTITY_REVOKED' USING ERRCODE='42501'; END IF;
  INSERT INTO sdj.users(id) VALUES(p_user);
  INSERT INTO sdj.channel_identities(id,user_id,channel,channel_account_id,sender_lookup,sender_ciphertext) VALUES(p_identity,p_user,'whatsapp',p_account,p_lookup,p_sender);
  v_user:=p_user;v_identity:=p_identity;
 END IF;
 RETURN QUERY SELECT v_user,v_identity;
END $f$;
CREATE FUNCTION sdj.accept_event(p_id uuid,p_user uuid,p_identity uuid,p_account text,p_external text,p_conversation bytea,p_text bytea,p_digest bytea,p_sent timestamptz)
RETURNS TABLE(id uuid,duplicate boolean,collision boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
DECLARE old sdj.inbound_messages%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT FROM sdj.channel_identities WHERE channel_identities.id=p_identity AND user_id=p_user AND channel_account_id=p_account AND status='active') THEN RAISE EXCEPTION 'IDENTITY_SCOPE_INVALID' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_account||':'||p_external,0));
 SELECT * INTO old FROM sdj.inbound_messages WHERE channel='whatsapp' AND channel_account_id=p_account AND external_message_id=p_external;
 IF FOUND THEN
  IF old.body_digest<>p_digest THEN UPDATE sdj.inbound_messages SET status='collision' WHERE inbound_messages.id=old.id; END IF;
  RETURN QUERY SELECT old.id,true,old.body_digest<>p_digest;RETURN;
 END IF;
 INSERT INTO sdj.inbound_messages(id,user_id,identity_id,channel,channel_account_id,external_message_id,conversation_ciphertext,text_ciphertext,body_digest,sent_at)
 VALUES(p_id,p_user,p_identity,'whatsapp',p_account,p_external,p_conversation,p_text,p_digest,p_sent);
 INSERT INTO sdj.jobs(id,user_id,kind,message_id,dedupe_key) VALUES(gen_random_uuid(),p_user,'process_message',p_id,'message:'||p_id);
 RETURN QUERY SELECT p_id,false,false;
END $f$;
CREATE FUNCTION sdj.reserve_nonce(p_key text,p_nonce bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
BEGIN
 DELETE FROM sdj.bridge_nonces WHERE expires_at<now();
 INSERT INTO sdj.bridge_nonces VALUES(p_key,p_nonce,now()+interval '5 minutes',now()) ON CONFLICT DO NOTHING;
 RETURN FOUND;
END $f$;
CREATE FUNCTION sdj.claim_job(p_worker text,p_token bytea)
RETURNS TABLE(id uuid,user_id uuid,message_id uuid,group_id uuid,kind text,attempts integer)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
 UPDATE sdj.jobs j SET status='leased',attempts=j.attempts+1,lease_owner=p_worker,lease_token_hash=p_token,lease_expires_at=now()+interval '60 seconds'
 WHERE j.id=(
  SELECT q.id FROM sdj.jobs q WHERE (q.status='queued' OR q.status='leased' AND q.lease_expires_at<now())
  AND q.available_at<=now() AND q.attempts<q.max_attempts
  AND (q.kind='reconcile_mutation' OR NOT EXISTS(
   SELECT FROM sdj.jobs older WHERE older.user_id=q.user_id AND older.kind='process_message' AND older.status IN ('queued','leased')
   AND (older.created_at,older.id)<(q.created_at,q.id)))
  ORDER BY (q.kind='reconcile_mutation') DESC,q.available_at,q.created_at,q.id FOR UPDATE SKIP LOCKED LIMIT 1)
 RETURNING j.id,j.user_id,j.message_id,j.group_id,j.kind,j.attempts;
$f$;
CREATE FUNCTION sdj.claim_delivery(p_account text,p_token bytea)
RETURNS TABLE(id uuid,user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
BEGIN
 UPDATE sdj.deliveries SET status='delivery_unknown' WHERE channel_account_id=p_account AND status='leased' AND lease_expires_at<now();
 RETURN QUERY UPDATE sdj.deliveries d SET status='leased',attempts=d.attempts+1,lease_token_hash=p_token,lease_expires_at=now()+interval '60 seconds'
 WHERE d.id=(SELECT q.id FROM sdj.deliveries q WHERE q.channel_account_id=p_account AND q.status='pending' AND q.available_at<=now() ORDER BY q.available_at,q.id FOR UPDATE SKIP LOCKED LIMIT 1)
 RETURNING d.id,d.user_id;
END $f$;
CREATE FUNCTION sdj.delivery_receipt(p_account text,p_id uuid,p_token bytea,p_remote text,p_outcome text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
BEGIN
 IF p_outcome NOT IN ('sent','pending','delivery_unknown') THEN RAISE EXCEPTION 'INVALID_OUTCOME'; END IF;
 UPDATE sdj.deliveries SET status=p_outcome,remote_message_id=p_remote,sent_at=CASE WHEN p_outcome='sent' THEN now() ELSE NULL END,
 available_at=now()+interval '5 seconds',lease_token_hash=NULL,lease_expires_at=NULL
 WHERE id=p_id AND channel_account_id=p_account AND status='leased' AND lease_token_hash=p_token AND lease_expires_at>=now();
 RETURN FOUND;
END $f$;
CREATE FUNCTION sdj.onboarding_lookup(p_hash bytea,p_kind text)
RETURNS TABLE(id uuid,user_id uuid,identity_id uuid,source_message_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
 SELECT s.id,s.user_id,s.identity_id,s.source_message_id FROM sdj.onboarding_sessions s
 WHERE s.expires_at>now() AND s.status NOT IN ('completed','expired','cancelled')
 AND ((p_kind='link' AND s.status='created' AND s.link_token_hash=p_hash) OR
      (p_kind='browser' AND s.browser_session_hash=p_hash));
$f$;
CREATE FUNCTION sdj.reserve_ai(p_targets text[],p_attempt uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
DECLARE uid uuid:=nullif(current_setting('app.user_id',true),'')::uuid;cur bigint;i integer;t sdj.ai_targets%ROWTYPE;b sdj.quota_buckets%ROWTYPE;
BEGIN
 IF uid IS NULL OR NOT EXISTS(SELECT FROM sdj.users WHERE id=uid AND status='active' AND ai_processing_allowed) THEN RETURN NULL; END IF;
 SELECT cursor INTO cur FROM sdj.ai_routing_state WHERE id=true FOR UPDATE;
 IF (SELECT count(*) FROM sdj.provider_attempts WHERE user_id=uid AND created_at>now()-interval '1 minute')>=5 OR
    (SELECT count(*) FROM sdj.provider_attempts WHERE user_id=uid AND created_at>date_trunc('day',now()))>=50 THEN RETURN NULL; END IF;
 IF cardinality(p_targets)=0 THEN RETURN NULL; END IF;
 FOR i IN 0..cardinality(p_targets)-1 LOOP
  SELECT * INTO t FROM sdj.ai_targets WHERE id=p_targets[((cur+i)%cardinality(p_targets))::integer+1] AND enabled;
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
CREATE FUNCTION sdj.settle_ai(p_attempt uuid,p_ok boolean,p_error text,p_block timestamptz,p_disable boolean,p_tokens integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,sdj AS $f$
DECLARE v_owner text;
BEGIN
 UPDATE sdj.provider_attempts SET status=CASE WHEN p_ok THEN 'succeeded' ELSE 'failed' END,normalized_error=p_error,tokens=p_tokens,finished_at=now()
 WHERE id=p_attempt AND user_id=nullif(current_setting('app.user_id',true),'')::uuid AND status='reserved' RETURNING owner_ref INTO v_owner;
 IF v_owner IS NOT NULL THEN
 UPDATE sdj.quota_buckets SET blocked_until=greatest(blocked_until,p_block),disabled=disabled OR p_disable WHERE owner_ref=v_owner;
 END IF;
END $f$;
-- Functions are the only cross-tenant entry points.
ALTER FUNCTION sdj.resolve_identity(bytea,uuid,uuid,bytea,text) OWNER TO sdj_internal;
ALTER FUNCTION sdj.accept_event(uuid,uuid,uuid,text,text,bytea,bytea,bytea,timestamptz) OWNER TO sdj_internal;
ALTER FUNCTION sdj.reserve_nonce(text,bytea) OWNER TO sdj_internal;
ALTER FUNCTION sdj.claim_job(text,bytea) OWNER TO sdj_internal;
ALTER FUNCTION sdj.claim_delivery(text,bytea) OWNER TO sdj_internal;
ALTER FUNCTION sdj.delivery_receipt(text,uuid,bytea,text,text) OWNER TO sdj_internal;
ALTER FUNCTION sdj.onboarding_lookup(bytea,text) OWNER TO sdj_internal;
ALTER FUNCTION sdj.reserve_ai(text[],uuid) OWNER TO sdj_internal;
ALTER FUNCTION sdj.settle_ai(uuid,boolean,text,timestamptz,boolean,integer) OWNER TO sdj_internal;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sdj FROM PUBLIC,anon,authenticated;
REVOKE CREATE ON SCHEMA sdj FROM sdj_internal;
GRANT EXECUTE ON FUNCTION sdj.resolve_identity(bytea,uuid,uuid,bytea,text),sdj.accept_event(uuid,uuid,uuid,text,text,bytea,bytea,bytea,timestamptz),sdj.reserve_nonce(text,bytea),sdj.onboarding_lookup(bytea,text) TO sdj_ingress;
GRANT EXECUTE ON FUNCTION sdj.claim_job(text,bytea),sdj.claim_delivery(text,bytea),sdj.delivery_receipt(text,uuid,bytea,text,text) TO sdj_scheduler;
GRANT EXECUTE ON FUNCTION sdj.reserve_ai(text[],uuid),sdj.settle_ai(uuid,boolean,text,timestamptz,boolean,integer) TO sdj_app;


-- Immutable approved full activity catalog. No participant data.
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','subuh','{"id":"subuh","label":"Subuh","aliases":["subuh","shubuh","fajr"],"sourceLabels":["Subuh Berjama''ah/Awal Waktu"],"kind":"number","integer":true,"min":0,"max":3,"unit":"skor"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','dzuhur','{"id":"dzuhur","label":"Zuhur","aliases":["dzuhur","zuhur","dhuhr","zhuhur"],"sourceLabels":["Dzuhur Berjama''ah/Awal Waktu","Zuhur Berjama''ah/Awal Waktu"],"kind":"number","integer":true,"min":0,"max":3,"unit":"skor"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','ashar','{"id":"ashar","label":"Ashar","aliases":["ashar","asar","asr"],"sourceLabels":["Ashar Berjama''ah/Awal Waktu"],"kind":"number","integer":true,"min":0,"max":3,"unit":"skor"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','maghrib','{"id":"maghrib","label":"Maghrib","aliases":["maghrib","magrib"],"sourceLabels":["Maghrib Berjama''ah/Awal Waktu"],"kind":"number","integer":true,"min":0,"max":3,"unit":"skor"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','isya','{"id":"isya","label":"Isya","aliases":["isya","isya''","isha"],"sourceLabels":["Isya Berjama''ah/Awal Waktu"],"kind":"number","integer":true,"min":0,"max":3,"unit":"skor"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','rawatib','{"id":"rawatib","label":"Rawatib","aliases":["rawatib","sholat sunnah rawatib","salat sunnah rawatib"],"sourceLabels":["Sholat sunnah rawatib"],"kind":"number","integer":true,"min":0,"max":null,"unit":"kali"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','tilawah','{"id":"tilawah","label":"Tilawah","aliases":["tilawah","baca quran"],"sourceLabels":["Tilawah Al Quran (halaman)"],"kind":"number","integer":false,"min":0,"max":100,"unit":"halaman"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','murojaah','{"id":"murojaah","label":"Murojaah","aliases":["murojaah","murajaah"],"sourceLabels":["Muroja''ah Al Quran (halaman)","Muroja''ah Al Quran","Murojaah"],"kind":"boolean","integer":false,"min":0,"max":null,"unit":"pelaksanaan"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','matsurat_pagi','{"id":"matsurat_pagi","label":"Al-Matsurat Pagi","aliases":["al-matsurat pagi","matsurat pagi","almatsurat pagi"],"sourceLabels":["Al-Matsurat Pagi"],"kind":"boolean","integer":false,"min":0,"max":null,"unit":"pelaksanaan"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','matsurat_petang','{"id":"matsurat_petang","label":"Al-Matsurat Petang","aliases":["al-matsurat petang","matsurat petang","matsurat sore","almatsurat petang"],"sourceLabels":["Al-Matsurat Petang"],"kind":"boolean","integer":false,"min":0,"max":null,"unit":"pelaksanaan"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','dhuha','{"id":"dhuha","label":"Dhuha","aliases":["dhuha","duha","sholat dhuha"],"sourceLabels":["Sholat Dhuha (pelaksanaan)"],"kind":"boolean","integer":false,"min":0,"max":null,"unit":"pelaksanaan"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','tahajjud','{"id":"tahajjud","label":"Tahajjud","aliases":["tahajjud","tahajud","sholat tahajjud"],"sourceLabels":["Sholat Tahajjud (pelaksanaan)"],"kind":"boolean","integer":false,"min":0,"max":null,"unit":"pelaksanaan"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','infaq','{"id":"infaq","label":"Infaq","aliases":["infaq","infak","sedekah"],"sourceLabels":["Infaq/Ajak Infaq (pelaksanaan)"],"kind":"boolean","integer":false,"min":0,"max":null,"unit":"pelaksanaan"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','puasa_sunnah','{"id":"puasa_sunnah","label":"Puasa Sunnah","aliases":["puasa sunnah","shaum sunnah","puasa sunah"],"sourceLabels":["Shaum/Puasa Sunnah"],"kind":"boolean","integer":false,"min":0,"max":null,"unit":"pelaksanaan"}'::jsonb);
INSERT INTO sdj.activity_definitions(template_id,activity_id,config) VALUES ('sdj-v1.2-full-v1','merapikan_kamar','{"id":"merapikan_kamar","label":"Merapikan Kamar","aliases":["merapikan kamar","rapikan kamar","kamar rapi"],"sourceLabels":["Merapikan Kamar (Setiap Hari)"],"kind":"boolean","integer":false,"min":0,"max":null,"unit":"pelaksanaan"}'::jsonb);
