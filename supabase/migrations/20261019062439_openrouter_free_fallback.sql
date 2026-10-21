-- Additive rollout: no participant credentials or consent are changed here.
ALTER TABLE sdj.ai_targets DROP CONSTRAINT ai_targets_provider_check;
ALTER TABLE sdj.ai_targets ADD CONSTRAINT ai_targets_provider_check
 CHECK(provider IN ('groq','gemini','nvidia','openrouter'));

INSERT INTO sdj.quota_buckets(owner_ref) VALUES('openrouter-default') ON CONFLICT DO NOTHING;
INSERT INTO sdj.ai_targets(id,provider,model_id,credential_ref,quota_owner,enabled,requests_per_minute,requests_per_day,provider_policy_version)
 VALUES('openrouter','openrouter','openrouter/free','OPENROUTER_API_KEY','openrouter-default',false,5,50,'free-providers-v2')
 ON CONFLICT(id) DO NOTHING;

-- Preserve the existing tenant checks, cursor, locks and shared quota accounting.
-- OpenRouter is never reserved using consent that named only the original providers.
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
  SELECT * INTO t FROM sdj.ai_targets WHERE id=p_targets[((cur+i)%cardinality(p_targets))::integer+1] AND enabled
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
