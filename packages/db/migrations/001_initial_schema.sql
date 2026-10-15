-- SDJ Assistant Database Schema
-- Version: 1.0.0

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Core Tables
-- ============================================

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED')),
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Jakarta',
    language VARCHAR(10) NOT NULL DEFAULT 'id',
    consent_given BOOLEAN NOT NULL DEFAULT FALSE,
    consent_timestamp TIMESTAMPTZ,
    display_name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    phone_number VARCHAR(50),

    CONSTRAINT users_email_check CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Channel identities table
CREATE TABLE channel_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_type VARCHAR(20) NOT NULL DEFAULT 'whatsapp' CHECK (channel_type IN ('whatsapp')),
    sender_id VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    phone_number VARCHAR(50),
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ,

    UNIQUE(sender_id, channel_type)
);

-- Google connections table (OAuth tokens)
CREATE TABLE google_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_token_encrypted TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    token_type VARCHAR(20) NOT NULL DEFAULT 'Bearer',
    expires_at TIMESTAMPTZ NOT NULL,
    scope TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracker connections table
CREATE TABLE tracker_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    google_connection_id UUID NOT NULL REFERENCES google_connections(id) ON DELETE CASCADE,
    spreadsheet_id VARCHAR(255) NOT NULL,
    spreadsheet_name VARCHAR(255) NOT NULL,
    sheet_name VARCHAR(255) NOT NULL DEFAULT 'Sheet1',
    date_column_start INTEGER NOT NULL DEFAULT 2,
    activity_row_start INTEGER NOT NULL DEFAULT 3,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Template versions table
CREATE TABLE template_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    version VARCHAR(20) NOT NULL,
    description TEXT,
    spreadsheet_url TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(name, version)
);

-- Activity definitions table
CREATE TABLE activity_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    scoring_min INTEGER,
    scoring_max INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activity bindings table
CREATE TABLE activity_bindings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracker_connection_id UUID NOT NULL REFERENCES tracker_connections(id) ON DELETE CASCADE,
    activity_definition_id UUID NOT NULL REFERENCES activity_definitions(id) ON DELETE CASCADE,
    row_offset INTEGER NOT NULL DEFAULT 0,
    column_offset INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(tracker_connection_id, activity_definition_id)
);

-- ============================================
-- Operations Tables
-- ============================================

-- Inbound messages table
CREATE TABLE inbound_messages (
    id VARCHAR(255) PRIMARY KEY,
    channel_type VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    sender_id VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    phone_number VARCHAR(50),
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB,

    INDEX idx_inbound_messages_sender (sender_id, channel_type),
    INDEX idx_inbound_messages_timestamp (timestamp)
);

-- Commands table
CREATE TABLE commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id VARCHAR(255) NOT NULL REFERENCES inbound_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    raw_text TEXT NOT NULL,
    parsed_data JSONB,
    confidence DECIMAL(3,2) NOT NULL DEFAULT 0,
    requires_ai BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    INDEX idx_commands_user (user_id),
    INDEX idx_commands_message (message_id)
);

-- Mutations table (write journal)
CREATE TABLE mutations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('SET_SCORE', 'UNDO', 'CORRECTION')),
    action VARCHAR(50) NOT NULL,
    activity_id VARCHAR(50) NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    activity_display_name VARCHAR(100) NOT NULL,
    target_date DATE NOT NULL,
    date_anchor VARCHAR(20) NOT NULL,
    date_precision VARCHAR(20) NOT NULL,
    date_description VARCHAR(255) NOT NULL,
    new_value INTEGER NOT NULL,
    previous_value INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPLIED', 'FAILED', 'ROLLED_BACK')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_at TIMESTAMPTZ,
    rollback_mutation_id UUID REFERENCES mutations(id),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    channel_message_id VARCHAR(255),

    INDEX idx_mutations_user_date (user_id, target_date),
    INDEX idx_mutations_status (status),
    INDEX idx_mutations_idempotency (idempotency_key)
);

-- Deliveries table (outbox)
CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id VARCHAR(255) NOT NULL,
    channel_type VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    content TEXT NOT NULL,
    priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    external_message_id VARCHAR(255),
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    INDEX idx_deliveries_status (status),
    INDEX idx_deliveries_recipient (recipient_id)
);

-- Jobs table (durable job queue)
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    priority INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    leased_until TIMESTAMPTZ,
    leased_by VARCHAR(255),

    INDEX idx_jobs_status_runat (status, run_at),
    INDEX idx_jobs_lease (leased_until)
);

-- ============================================
-- AI/Quota Tables
-- ============================================

-- AI targets table
CREATE TABLE ai_targets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INTEGER NOT NULL DEFAULT 0,
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    max_tokens INTEGER NOT NULL DEFAULT 1024,
    temperature DECIMAL(3,2) NOT NULL DEFAULT 0.1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(provider, model)
);

-- Quota buckets table
CREATE TABLE quota_buckets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    max_tokens INTEGER NOT NULL DEFAULT 1000,
    current_tokens INTEGER NOT NULL DEFAULT 1000,
    refill_rate INTEGER NOT NULL DEFAULT 100,
    last_refill_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Provider attempts table
CREATE TABLE provider_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    prompt_tokens INTEGER NOT NULL,
    completion_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'rate_limited', 'error', 'timeout')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    INDEX idx_provider_attempts_created (created_at),
    INDEX idx_provider_attempts_user (user_id)
);

-- Provider reservations table
CREATE TABLE provider_reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    tokens INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    INDEX idx_provider_reservations_expires (expires_at)
);

-- ============================================
-- Row Level Security
-- ============================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracker_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_messages ENABLE ROW LEVEL SECURITY;

-- User policies (users can only see/edit their own data)
CREATE POLICY users_own_data ON users
    FOR ALL
    USING (id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY channel_identities_own_data ON channel_identities
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY google_connections_own_data ON google_connections
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY tracker_connections_own_data ON tracker_connections
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::UUID);

CREATE POLICY mutations_own_data ON mutations
    FOR ALL
    USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- ============================================
-- Updated At Trigger
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_google_connections_updated_at
    BEFORE UPDATE ON google_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tracker_connections_updated_at
    BEFORE UPDATE ON tracker_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_activity_definitions_updated_at
    BEFORE UPDATE ON activity_definitions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_targets_updated_at
    BEFORE UPDATE ON ai_targets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
