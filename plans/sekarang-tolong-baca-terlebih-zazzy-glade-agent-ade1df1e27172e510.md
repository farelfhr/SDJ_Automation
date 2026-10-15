# SDJ Assistant - Detailed Implementation Plan

Versi: 1.0.0  
Tanggal: 15 Oktober 2026  
Status: Rencana implementasi untuk fase bootstrap dan M1

---

## Table of Contents

1. [Project Overview Summary](#1-project-overview-summary)
2. [Complete File Inventory](#2-complete-file-inventory)
3. [Dependency Analysis](#3-dependency-analysis)
4. [Implementation Order](#4-implementation-order)
5. [Milestone M1: Core Local - Detailed Steps](#5-milestone-m1-core-local---detailed-steps)
6. [Verification Strategies](#6-verification-strategies)
7. [Development Workflow](#7-development-workflow)
8. [Testing Strategy](#8-testing-strategy)
9. [Future Milestones Summary](#9-future-milestones-summary)

---

## 1. Project Overview Summary

**SDJ Assistant** adalah personal spiritual activity tracker yang beroperasi melalui WhatsApp.

### Key Technical Decisions

- **Modular Monolith** TypeScript dengan Node.js 24 LTS
- **PostgreSQL 17** untuk persistence, bukan Redis
- **OpenClaw** sebagai WhatsApp adapter (setelah G0 verification)
- **Parser deterministik** untuk command jelas, **AI fallback** (Gemini/Groq) untuk bahasa bebas
- **Domain-Driven Design** dengan strict layer separation

### MVP Command Set

| Command | Behavior |
|---------|----------|
| zuhur, 3 | Set Dhuhr score to 3 |
| subuh kemarin 2 | Set yesterday's Subuh to 2 |
| isya 2026-10-14 3 | Set explicit date |
| ekap hari ini | Summary of 5 prayers |
| atal | Undo last eligible mutation |
| antuan / status | Help or status |

---

## 2. Complete File Inventory

### 2.1 Root Configuration Files

\\\
sdj-assistant/
├── package.json                 # Workspace root, scripts, dependencies
├── pnpm-workspace.yaml          # Monorepo workspace config
├── tsconfig.json                # Base TypeScript config (strict mode)
├── tsconfig.base.json           # Shared TypeScript settings
├── vitest.config.ts            # Test configuration
├── .env.example                # Environment template (no real values)
├── docker-compose.yml           # PostgreSQL + API + Worker
├── Dockerfile                  # Multi-stage build
└── .gitignore
\\\

### 2.2 Package Structure (apps/)

### 2.2 Package Structure (apps/)

```
apps/
├── api/src/
│   ├── index.ts                # Fastify bootstrap, server start
│   ├── app.ts                  # Fastify instance configuration
│   ├── http/
│   │   ├── channel-events.ts   # POST /internal/v1/channel-events
│   │   ├── deliveries.ts       # Delivery claim/ack/nack endpoints
│   │   ├── health.ts           # /health/live, /health/ready
│   │   └── onboarding/
│   │       ├── connect.ts      # GET /connect?token=...
│   │       ├── google.ts       # OAuth start/callback
│   │       ├── tracker.ts      # POST /connect/tracker
│   │       └── status.ts       # GET /connect/status
│   ├── middleware/
│   │   ├── auth.ts             # HMAC signature verification
│   │   ├── error-handler.ts    # Global error handling
│   │   └── request-id.ts       # Request ID correlation
│   └── plugins/
│       ├── database.ts         # PostgreSQL connection plugin
│       └── serialization.ts    # JSON schema serialization
```

```
apps/
├── worker/src/
│   ├── index.ts                # Worker process entry point
│   ├── loop.ts                 # Job processing loop
│   ├── handlers/
│   │   ├── process-message.ts  # Job kind: process_message
│   │   ├── apply-command.ts    # Job kind: apply_command
│   │   └── reconcile-mutation.ts
│   └── services/
│       ├── job-claim.ts        # Job claiming with lease
│       └── outbox.ts           # Delivery outbox processing
```

### 2.3 Package Structure (packages/)

```
packages/
├── domain/src/
│   ├── activities.ts            # ActivityId, ActivityDefinition
│   ├── commands.ts              # CommandProposal, CommandStatus
│   ├── dates.ts                 # DateResolver, DateReference
│   ├── errors.ts                # DomainError, ErrorCode
│   ├── mutations.ts             # Mutation, MutationStatus, TypedCellValue
│   ├── parser/
│   │   ├── index.ts            # Parser exports
│   │   ├── tokenizer.ts        # Tokenizer for command parsing
│   │   ├── grammar.ts          # Grammar rules for commands
│   │   └── interpreter.ts      # Interpret tokens into CommandProposal
│   └── values/
│       ├── phone.ts             # E.164 phone normalization
│       └── hmac.ts             # HMAC utilities
├── contracts/src/
│   ├── schemas.ts               # Zod schemas for all entities
│   ├── envelope.ts             # Envelope versioning
│   ├── errors.ts               # Application-level errors
│   └── channel.ts             # Channel event contracts
├── application/src/
│   ├── use-cases/
│   │   ├── process-message.ts  # Handle inbound message
│   │   ├── apply-command.ts    # Execute command mutation
│   │   ├── undo-mutation.ts    # Undo last eligible mutation
│   │   ├── daily-summary.ts    # Generate daily summary
│   │   └── reconcile.ts        # Reconcile uncertain mutations
│   ├── services/
│   │   ├── command-processor.ts
│   │   └── mutation-journal.ts
│   └── ports/
│       ├── intent-interpreter.ts
│       ├── tracker-gateway.ts
│       └── channel-adapter.ts
├── infrastructure/src/
│   ├── db/
│   │   ├── index.ts
│   │   ├── pool.ts             # PostgreSQL connection pool
│   │   ├── transaction.ts      # Transaction context
│   │   ├── repositories/
│   │   │   ├── user.repository.ts
│   │   │   ├── identity.repository.ts
│   │   │   ├── command.repository.ts
│   │   │   ├── mutation.repository.ts
│   │   │   ├── job.repository.ts
│   │   │   ├── delivery.repository.ts
│   │   │   └── quota.repository.ts
│   │   └── migrations/
│   │       └── runner.ts
│   ├── google/
│   │   ├── oauth.ts            # Google OAuth implementation
│   │   ├── picker.ts           # Google Picker integration
│   │   ├── sheets.ts           # Sheets API adapter
│   │   └── token-cache.ts      # Token caching
│   ├── ai/
│   │   ├── router.ts           # AI target routing
│   │   ├── gemini.adapter.ts   # Gemini API adapter
│   │   └── groq.adapter.ts     # Groq API adapter
│   └── channel/
│       └── openclaw-bridge.ts  # OpenClaw SDK integration
├── openclaw-bridge/
│   ├── index.ts
│   ├── sdk.ts                  # OpenClaw SDK wrapper
│   └── types.ts               # OpenClaw type definitions
└── testing/
    ├── index.ts
    ├── fixtures/
    │   ├── actors.ts           # Synthetic actors
    │   ├── messages.ts         # Test message fixtures
    │   └── trackers.ts        # Synthetic tracker data
    ├── fakes/
    │   ├── fake-channel.ts     # Fake WhatsApp channel
    │   ├── fake-sheets.ts      # Fake Google Sheets
    │   ├── fake-ai.ts          # Fake AI interpreter
    │   └── fake-clock.ts      # Deterministic clock
    └── helpers/
        ├── db.ts              # Test database setup
        └── assert.ts          # Custom assertions
```

### 2.4 Database and Config Structure

```
db/
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_add_tenants.sql
│   ├── 003_add_jobs_queue.sql
│   ├── 004_add_mutations.sql
│   ├── 005_add_ai_providers.sql
│   └── README.md
└── seeds/
    ├── 001_template_seed.sql
    └── 002_activity_seed.sql

config/
├── templates/
│   └── sdj-v1.2-core.json     # Template definition
├── models/
│   ├── gemini-gemini-2-flash.json
│   └── groq-llama-3-8b.json
└── .gitkeep                    # Prevent empty directory

tests/
├── integration/
│   ├── db/
│   │   ├── rls.test.ts        # Row-level security tests
│   │   ├── repository.test.ts # Repository isolation tests
│   │   └── queue.test.ts      # Job queue tests
│   └── recovery/
│       ├── crash.test.ts       # Crash recovery tests
│       └── reconcile.test.ts   # Mutation reconciliation
├── e2e/
│   ├── two-participant.test.ts # Multi-user scenarios
│   ├── command-flow.test.ts   # Full command lifecycle
│   └── delivery.test.ts       # Delivery outbox tests
└── evaluation/
    ├── parser.test.ts          # Parser accuracy tests
    └── ai-eval.test.ts         # AI interpretation tests
```

---

## 3. Dependency Analysis

### 3.1 Layer Dependencies (Architecture Rules)

```
┌─────────────────────────────────────────────────────────────┐
│                     APPLICATION LAYER                        │
│  - Use cases orchestrate domain logic                      │
│  - Depends on domain interfaces and ports                  │
│  - Does NOT depend on infrastructure                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       DOMAIN LAYER                          │
│  - Pure TypeScript, no external dependencies               │
│  - Defines interfaces (ports) for external dependencies     │
│  - Contains business rules, validation, date resolution      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE LAYER                      │
│  - Implements domain interfaces (ports)                    │
│  - Depends on external libraries (pg, googleapis, etc.)   │
│  - Contains adapters for PostgreSQL, Sheets, AI providers  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Package Dependencies

```
packages/domain          ← No dependencies (pure TypeScript)
packages/contracts      ← No dependencies (Zod schemas only)
packages/application    ← domain, contracts
packages/infrastructure ← application, domain, contracts, pg, googleapis, etc.
apps/api               ← application, infrastructure, contracts
apps/worker            ← application, infrastructure, contracts
packages/testing       ← All packages (test utilities)
packages/openclaw-bridge ← infrastructure, openclaw-sdk
```

### 3.3 File-Level Dependency Order

| Phase | Files | Dependencies |
|-------|-------|-------------|
| 1 | `packages/domain/src/*` | None |
| 2 | `packages/contracts/src/*` | domain |
| 3 | `packages/application/src/ports/*` | domain, contracts |
| 4 | `packages/application/src/services/*` | domain, contracts, ports |
| 5 | `packages/application/src/use-cases/*` | domain, contracts, ports, services |
| 6 | `packages/infrastructure/src/db/*` | domain, contracts, application/ports |
| 7 | `packages/infrastructure/src/google/*` | domain, contracts |
| 8 | `packages/infrastructure/src/ai/*` | domain, contracts, application/ports |
| 9 | `packages/testing/fakes/*` | All packages |
| 10 | `apps/worker/src/*` | application, infrastructure |
| 11 | `apps/api/src/*` | application, infrastructure |
| 12 | Integration tests | All packages, testing |

### 3.4 External Service Dependencies

| Service | Usage | When Available |
|---------|-------|----------------|
| PostgreSQL 17 | All persistence | M1 (local Docker) |
| OpenClaw SDK | WhatsApp channel | G0 spike |
| Google OAuth | User authentication | M2 |
| Google Sheets API | Tracker read/write | M2 |
| Gemini API | AI interpretation | M4 |
| Groq API | AI interpretation fallback | M4 |

---

## 4. Implementation Order

### 4.1 Phase 0: Bootstrap

| Order | Task | Files Created | Verification |
|-------|------|---------------|--------------|
| 0.1 | Initialize monorepo workspace | package.json, pnpm-workspace.yaml, tsconfig*.json | pnpm install succeeds |
| 0.2 | Setup Vitest config | vitest.config.ts | pnpm test runs |
| 0.3 | Create directory structure | All directories per ARCHITECTURE | Directory tree matches spec |
| 0.4 | Setup Docker Compose | docker-compose.yml, Dockerfile | docker compose up starts PostgreSQL |

### 4.2 Phase G0: OpenClaw Spike

| Order | Task | Files Created | Verification |
|-------|------|---------------|--------------|
| G0.1 | Study OpenClaw docs | - | Document version, API, limitations |
| G0.2 | Create spike documentation | docs/spikes/openclaw-channel.md | All G0 requirements addressed |
| G0.3 | Test ingress with fake | Fake channel in M1 | Metadata routing works |
| G0.4 | Verify blocking auto-reply | - | No model auto-response |

**G0 Gate Criteria:**
- [ ] Ingress with event_id, sender, conversation metadata
- [ ] DM separation per sender
- [ ] Outbound reply capability
- [ ] Auto-reply disabled
- [ ] Echo/history handling

### 4.3 Phase M1: Core Local

See Section 5 for detailed steps.

### 4.4 Phase M2: Google Integration

| Order | Task | Dependencies |
|-------|------|--------------|
| M2.1 | Implement Google OAuth flow | M1 complete |
| M2.2 | Implement Google Picker | M1 complete |
| M2.3 | Create Sheets adapter | M1 complete |
| M2.4 | Implement tracker validation | M1, M2.1-2.3 |
| M2.5 | Test with real Google account | M2.1-2.4 |
| M2.6 | Implement write/readback/undo with real Sheets | M2.4 |

### 4.5 Phase M3: Multi-User WhatsApp

| Order | Task | Dependencies |
|-------|------|--------------|
| M3.1 | Authenticated bridge endpoints | G0, M1 |
| M3.2 | Two-participant isolation test | M1, M2 |
| M3.3 | Pairing workflow | M2, M3.1 |
| M3.4 | E2E multi-user test | M3.2-3.3 |

### 4.6 Phase M4: AI Fallback

| Order | Task | Dependencies |
|-------|------|--------------|
| M4.1 | Implement AI router | M1 complete |
| M4.2 | Create Gemini adapter | M4.1 |
| M4.3 | Create Groq adapter | M4.1 |
| M4.4 | Implement quota bucket tracking | M1, M4.1-4.3 |
| M4.5 | AI evaluation dataset | M4.4 |
| M4.6 | Circuit breaker implementation | M4.1-4.5 |

### 4.7 Phase M5: Pilot

| Order | Task | Dependencies |
|-------|------|--------------|
| M5.1 | 5-10 volunteer participants | M1-M4 complete |
| M5.2 | Monitoring setup | All above |
| M5.3 | Backup/restore drill | M1 |
| M5.4 | Privacy compliance check | All above |

---

## 5. Milestone M1: Core Local - Detailed Steps

### 5.1 Bootstrap Workspace (M1.1)

#### Step M1.1.1: Create Root Package Files

**package.json:**
```json
{
  "name": "sdj-assistant",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "pnpm --parallel -r run dev",
    "build": "pnpm -r run build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "db:migrate": "node scripts/migrate.js"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0",
    "eslint": "^9.0.0"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "pg": "^8.13.0",
    "zod": "^3.23.0",
    "uuid": "^11.0.0"
  }
}
```

**pnpm-workspace.yaml:**
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**tsconfig.base.json:**
```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true
  }
}
```

#### Step M1.1.2: Create Docker Compose

**docker-compose.yml:**
```yaml
version: '3.9'
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: sdj
      POSTGRES_PASSWORD: sdj_dev_password
      POSTGRES_DB: sdj_dev
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sdj"]
```

#### Verification M1.1:
- [ ] pnpm install completes without errors
- [ ] pnpm typecheck passes
- [ ] docker compose up -d postgres starts PostgreSQL
- [ ] pg_isready -h localhost -U sdj returns ready

### 5.2 Domain Package (M1.2)

#### Step M1.2.1: Create Domain Types

**packages/domain/src/activities.ts:**
```typescript
// Activity IDs for MVP five daily prayers
export const ACTIVITY_IDS = [
  'subuh',
  'dzuhur', 
  'ashar',
  'maghrib',
  'isya'
] as const;

export type ActivityId = typeof ACTIVITY_IDS[number];

// Activity definition
export interface ActivityDefinition {
  id: ActivityId;
  displayLabel: string;
  aliases: readonly string[];
  valueKind: 'number' | 'boolean';
  minValue: number;
  maxValue: number;
  integerOnly: boolean;
}

// MVP activity definitions
export const MVP_ACTIVITIES: Record<ActivityId, ActivityDefinition> = {
  subuh: {
    id: 'subuh',
    displayLabel: 'Subuh',
    aliases: ['subuh', 'shubuh', 'fajr'],
    valueKind: 'number',
    minValue: 0,
    maxValue: 3,
    integerOnly: true
  },
  dzuhur: {
    id: 'dzuhur',
    displayLabel: 'Dzuhur',
    aliases: ['dzuhur', 'dhuhr', 'zuhur'],
    valueKind: 'number',
    minValue: 0,
    maxValue: 3,
    integerOnly: true
  },
  ashar: {
    id: 'ashar',
    displayLabel: 'Ashar',
    aliases: ['ashar', 'asr'],
    valueKind: 'number',
    minValue: 0,
    maxValue: 3,
    integerOnly: true
  },
  maghrib: {
    id: 'maghrib',
    displayLabel: 'Maghrib',
    aliases: ['maghrib', 'magrib'],
    valueKind: 'number',
    minValue: 0,
    maxValue: 3,
    integerOnly: true
  },
  isya: {
    id: 'isya',
    displayLabel: 'Isya',
    aliases: ['isya', 'isha'],
    valueKind: 'number',
    minValue: 0,
    maxValue: 3,
    integerOnly: true
  }
};

// Validate score range
export function isValidScore(activityId: ActivityId, value: number): boolean {
  const activity = MVP_ACTIVITIES[activityId];
  if (!activity) return false;
  if (!Number.isInteger(value)) return false;
  return value >= activity.minValue && value <= activity.maxValue;
}

// Find activity by alias
export function findActivityByAlias(alias: string): ActivityId | null {
  const normalized = alias.toLowerCase().trim();
  for (const [id, activity] of Object.entries(MVP_ACTIVITIES)) {
    if (activity.aliases.includes(normalized)) {
      return id as ActivityId;
    }
  }
  return null;
}
```

#### Step M1.2.2: Create Date Resolution

packages/domain/src/dates.ts:
  - DateReferenceSchema (Zod discriminated union)
  - DateResolver class with timezone handling
  - Static validators for date policies

#### Step M1.2.3: Create Command Types

packages/domain/src/commands.ts:
  - CommandProposalSchema (Zod discriminated union)
  - CommandStatusEnum
  - ParserSourceSchema

#### Step M1.2.4: Create TypedCellValue and Mutations

packages/domain/src/mutations.ts:
  - TypedCellValueSchema (blank/number/boolean union)
  - MutationStatusEnum
  - Mutation interface
  - MutationResult interface

#### Step M1.2.5: Create Error Codes

packages/domain/src/errors.ts:
  - ErrorCode constants
  - DomainError class
  - DomainErrors factory functions

packages/domain/src/index.ts:
  - Re-export all domain types

### 5.3 Contracts Package (M1.3)

#### Step M1.3.1: Create Channel Contracts

packages/contracts/src/channel.ts:
  - ChannelEventEnvelope schema (version 1)
  - Channel types: whatsapp
  - Event validation

packages/contracts/src/schemas.ts:
  - InboundMessage schema
  - Command schema
  - Mutation schema
  - Delivery schema

packages/contracts/src/index.ts:
  - Re-export all contracts

### 5.4 Parser Implementation (M1.4)

#### Step M1.4.1: Create Tokenizer

packages/domain/src/parser/tokenizer.ts:
  - Token types: ACTIVITY, NUMBER, DATE, COMMAND, COMMA
  - Tokenizer class with nextToken() method
  - Support for Indonesian prayer names and aliases

#### Step M1.4.2: Create Grammar Rules

packages/domain/src/parser/grammar.ts:
  - Command grammar definitions
  - Activity + value pattern: zuhur, 3
  - Activity + relative date + value: subuh kemarin 2
  - Explicit date pattern: isya 2026-10-14 3
  - System commands: bantuan, status, batal, rekap

#### Step M1.4.3: Create Interpreter

packages/domain/src/parser/interpreter.ts:
  - Interpret tokens into CommandProposal
  - Handle grammar matching
  - Generate clarify proposals for incomplete input
  - Return unsupported for unparseable input

packages/domain/src/parser/index.ts:
  - ParseMessage function
  - Export parser types

### 5.5 Database Layer (M1.5)

#### Step M1.5.1: Create Initial Migration

db/migrations/001_initial_schema.sql:
  - Create sdj schema
  - Create roles: sdj_migrator, sdj_app, sdj_ingress, sdj_scheduler
  - Create tables: users, channel_identities, template_versions
  - Create tables: activity_definitions, tracker_connections
  - Create tables: inbound_messages, commands, mutations, deliveries, jobs
  - Create indexes and constraints
  - Create RLS policies

#### Step M1.5.2: Create Repository Pattern

packages/infrastructure/src/db/index.ts:
  - Repository exports

packages/infrastructure/src/db/pool.ts:
  - createPool function
  - Health check

packages/infrastructure/src/db/transaction.ts:
  - TransactionContext class
  - Tenant context management
  - withTransaction helper

packages/infrastructure/src/db/repositories/user.repository.ts:
  - IUserRepository interface
  - PostgreSQL implementation
  - Tenant-scoped queries

packages/infrastructure/src/db/repositories/identity.repository.ts:
  - IIdentityRepository interface
  - PostgreSQL implementation

packages/infrastructure/src/db/repositories/command.repository.ts:
  - ICommandRepository interface
  - PostgreSQL implementation
  - Status transitions

packages/infrastructure/src/db/repositories/mutation.repository.ts:
  - IMutationRepository interface
  - PostgreSQL implementation
  - Barrier management (one unresolved per tracker)

packages/infrastructure/src/db/repositories/job.repository.ts:
  - IJobRepository interface
  - PostgreSQL implementation
  - FOR UPDATE SKIP LOCKED for claiming

packages/infrastructure/src/db/repositories/delivery.repository.ts:
  - IDeliveryRepository interface
  - PostgreSQL implementation
  - Outbox pattern

packages/infrastructure/src/db/migrations/runner.ts:
  - Migration runner class
  - Apply pending migrations

### 5.6 Application Layer (M1.6)

#### Step M1.6.1: Create Ports (Interfaces)

packages/application/src/ports/intent-interpreter.ts:
  - IntentInterpreter interface
  - interpret(input: string): Promise<CommandProposal>

packages/application/src/ports/tracker-gateway.ts:
  - TrackerGateway interface
  - writeAbsolute(mutation): Promise<WriteReceipt>
  - readBack(mutation): Promise<TargetSnapshot>

packages/application/src/ports/channel-adapter.ts:
  - ChannelAdapter interface
  - sendMessage(identityId, body): Promise<void>

#### Step M1.6.2: Create Services

packages/application/src/services/command-processor.ts:
  - CommandProcessor service
  - processCommand(proposal, actor): Promise<Command>
  - Handle clarification logic

packages/application/src/services/mutation-journal.ts:
  - MutationJournal service
  - createMutation(command, tracker, values): Promise<Mutation>
  - updateMutationStatus(mutationId, status): Promise<void>

#### Step M1.6.3: Create Use Cases

packages/application/src/use-cases/process-message.ts:
  - ProcessMessageUseCase
  - Handle inbound message
  - Create command from proposal
  - Return command ID

packages/application/src/use-cases/apply-command.ts:
  - ApplyCommandUseCase
  - Execute command mutation
  - Handle write flow

packages/application/src/use-cases/undo-mutation.ts:
  - UndoMutationUseCase
  - Check eligibility criteria (TTL, ownership, current value)
  - Create restore mutation

packages/application/src/use-cases/daily-summary.ts:
  - DailySummaryUseCase
  - Read all five prayer values
  - Format response

packages/application/src/use-cases/reconcile.ts:
  - ReconcileMutationUseCase
  - Check readback value
  - Update mutation status

### 5.7 Testing Infrastructure (M1.7)

#### Step M1.7.1: Create Test Fakes

packages/testing/src/fakes/fake-clock.ts:
  - DeterministicClock implementation
  -可控时间前进
  - Freeze time capability

packages/testing/src/fakes/fake-channel.ts:
  - FakeChannelAdapter implementation
  - Capture sent messages
  - Inject timeout behavior

packages/testing/src/fakes/fake-sheets.ts:
  - FakeTrackerGateway implementation
  - In-memory spreadsheet data
  - Inject write behaviors (success, timeout, crash)

packages/testing/src/fakes/fake-ai.ts:
  - FakeIntentInterpreter implementation
  - Return configured proposals
  - Track call count

#### Step M1.7.2: Create Test Fixtures

packages/testing/src/fixtures/actors.ts:
  - createTestActor helper
  - Synthetic user and identity

packages/testing/src/fixtures/messages.ts:
  - createTestMessage helper
  - Various command patterns

packages/testing/src/fixtures/trackers.ts:
  - createTestTracker helper
  - Synthetic tracker data

#### Step M1.7.3: Create Test Helpers

packages/testing/src/helpers/db.ts:
  - createTestPool function
  - Disposable database for integration tests

packages/testing/src/index.ts:
  - Re-export all testing utilities

### 5.8 Worker Implementation (M1.8)

#### Step M1.8.1: Create Job System

apps/worker/src/services/job-claim.ts:
  - JobClaimService
  - claimNextJob(): Promise<Job | null>
  - withLease(jobId, handler): Promise<void>
  - Lease renewal mechanism

apps/worker/src/services/outbox.ts:
  - OutboxService
  - processPendingDeliveries(): Promise<void>
  - claimDelivery(deliveryId): Promise<Delivery>
  - ackDelivery(deliveryId): Promise<void>

#### Step M1.8.2: Create Job Handlers

apps/worker/src/handlers/process-message.ts:
  - ProcessMessageHandler
  - Call ProcessMessageUseCase
  - Create follow-up jobs

apps/worker/src/handlers/apply-command.ts:
  - ApplyCommandHandler
  - Call ApplyCommandUseCase
  - Handle mutation flow

apps/worker/src/handlers/reconcile-mutation.ts:
  - ReconcileMutationHandler
  - Call ReconcileMutationUseCase
  - Schedule retry if needed

#### Step M1.8.3: Create Worker Loop

apps/worker/src/loop.ts:
  - WorkerLoop class
  - pollInterval configuration
  - Graceful shutdown
  - Error handling

apps/worker/src/index.ts:
  - Worker entry point
  - Initialize services
  - Start loop

### 5.9 API Implementation (M1.9)

#### Step M1.9.1: Create API Plugins

apps/api/src/plugins/database.ts:
  - Fastify plugin for PostgreSQL pool
  - Decorate with pool instance

apps/api/src/plugins/serialization.ts:
  - JSON schema serialization
  - Error serialization

#### Step M1.9.2: Create HTTP Handlers

apps/api/src/http/channel-events.ts:
  - POST /internal/v1/channel-events
  - HMAC signature verification
  - Validate envelope schema
  - Deduplicate by event_id
  - Create inbound_message and job

apps/api/src/http/deliveries.ts:
  - POST /internal/v1/deliveries/claim
  - POST /internal/v1/deliveries/:id/ack
  - POST /internal/v1/deliveries/:id/nack
  - Lease management

apps/api/src/http/health.ts:
  - GET /health/live
  - GET /health/ready

#### Step M1.9.3: Create Middleware

apps/api/src/middleware/auth.ts:
  - HMAC signature verification
  - Nonce validation for replay protection
  - Key allowlist checking

apps/api/src/middleware/error-handler.ts:
  - Global error handler
  - Error code mapping
  - Structured error responses

#### Step M1.9.4: Create API Entry Point

apps/api/src/app.ts:
  - Fastify instance configuration
  - Register plugins and routes

apps/api/src/index.ts:
  - API entry point
  - Start server
  - Graceful shutdown

### 5.10 End-to-End Test (M1.10)

#### Step M1.10.1: Create Two-Participant E2E Test

tests/e2e/two-participant.test.ts:
  - Setup: Two synthetic participants with fake trackers
  - Test: Participant A sends command
  - Test: Participant B cannot access As tracker
  - Test: Commands update correct tracker
  - Test: Undo only affects sender

#### Step M1.10.2: Create Command Flow E2E Test

tests/e2e/command-flow.test.ts:
  - Test complete flow: message -> command -> mutation -> delivery
  - Test rekap hari ini
  - Test batal
  - Test duplicate message handling

#### Step M1.10.3: Create Recovery E2E Test

tests/e2e/recovery.test.ts:
  - Test worker restart preserves jobs
  - Test mutation uncertain after fake timeout
  - Test reconciliation updates correct status


---

## 6. Verification Strategies

### 6.1 Unit Test Verification

Each domain module requires unit tests covering:

| Module | Test Coverage Requirements |
|--------|---------------------------|
| `activities.ts` | isValidScore for all activities, findActivityByAlias with valid/invalid aliases |
| `dates.ts` | resolve() for all reference types, isValidExplicitDate edge cases, isWithinAllowedRange |
| `commands.ts` | CommandProposalSchema parsing valid/invalid proposals |
| `mutations.ts` | TypedCellValueSchema parsing, BlankCell vs NumberCell distinction |
| `errors.ts` | All DomainErrors create correct code and retryable flag |
| `parser/` | All grammar patterns, clarification flow, unsupported handling |

**Test Pattern:**
```typescript
describe('isValidScore', () => {
  it('accepts valid score 0 for subuh', () => {
    expect(isValidScore('subuh', 0)).toBe(true);
  });
  it('accepts valid score 3 for subuh', () => {
    expect(isValidScore('subuh', 3)).toBe(true);
  });
  it('rejects score 4 for subuh', () => {
    expect(isValidScore('subuh', 4)).toBe(false);
  });
  it('rejects decimal 2.5', () => {
    expect(isValidScore('subuh', 2.5)).toBe(false);
  });
});
```

### 6.2 Integration Test Verification

PostgreSQL integration tests must pass:

| Test | What It Verifies |
|------|-----------------|
| `rls.test.ts` | User A cannot SELECT User B data |
| `repository.test.ts` | Composite FK enforces user_id |
| `queue.test.ts` | Two workers cannot claim same job |
| `dedup.test.ts` | Duplicate event_id creates one message |
| `mutation-barrier.test.ts` | Cannot create second mutation while one is unresolved |

**Test Pattern:**
```typescript
describe('RLS Isolation', () => {
  it('rejects SELECT with wrong user_id', async () => {
    await using pool = createTestPool('user_a');
    // Query as user_a
    const result = await pool.query(
      'SELECT * FROM sdj.commands WHERE user_id = $1',
      ['user_b_id']
    );
    // RLS should return zero rows
    expect(result.rows.length).toBe(0);
  });
});
```

### 6.3 E2E Test Verification

Two-participant E2E tests verify:

| Scenario | Verification |
|----------|--------------|
| Participant A records `zuhur, 3` | Tracker A has value 3, Tracker B unchanged |
| Participant A requests `rekap` | Response contains Tracker A values only |
| Participant A sends `batal` | Last mutation on Tracker A undone |
| Participant B cannot see A | All responses scoped to B |

**Run E2E tests:**
```bash
pnpm test:e2e
```

### 6.4 Manual Verification Checklist

Before claiming M1 complete, verify manually:

- [ ] `pnpm install` succeeds
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (unit tests)
- [ ] `pnpm test:integration` passes (with PostgreSQL)
- [ ] `docker compose up -d postgres` starts database
- [ ] `pnpm db:migrate` applies migrations
- [ ] API starts: `pnpm dev:api`
- [ ] Worker starts: `pnpm dev:worker`
- [ ] Send test message via fake channel
- [ ] Verify response received

---

## 7. Development Workflow

### 7.1 Local Development Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd sdj-assistant

# 2. Install dependencies
pnpm install --frozen-lockfile

# 3. Start PostgreSQL
docker compose up -d postgres

# 4. Run migrations
DATABASE_URL=postgresql://sdj:sdj_dev_password@localhost:5432/sdj_dev \
  pnpm db:migrate

# 5. Start API (development mode)
pnpm dev:api

# 6. Start Worker (separate terminal)
pnpm dev:worker
```

### 7.2 Development Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start all apps in dev mode |
| `pnpm test` | Run unit tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm test:integration` | Run integration tests (requires PostgreSQL) |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm build` | Build all packages |

### 7.3 Adding New Commands

To add a new command (e.g., `hapus <activity>` for clearing):

1. **Update domain parser:**
   ```typescript
   // packages/domain/src/parser/grammar.ts
   const CLEAR_GRAMMAR = {
     type: 'clear_activity',
     pattern: /^hapus\s+(\w+)$/i,
     extract: (match) => ({ activity: match[1] })
   };
   ```

2. **Add command proposal type:**
   ```typescript
   // packages/domain/src/commands.ts
   z.object({
     schema_version: z.literal(1),
     action: z.literal('clear_activity'),
     activity_id: ActivityIdSchema
   })
   ```

3. **Add use case:**
   ```typescript
   // packages/application/src/use-cases/clear-activity.ts
   export class ClearActivityUseCase { ... }
   ```

4. **Add unit tests:**
   ```typescript
   // tests/unit/parser.test.ts
   it('parses hapus subuh -> clear_activity', () => { ... })
   ```

5. **Run verification:**
   ```bash
   pnpm test
   pnpm typecheck
   ```

### 7.4 Git Workflow

1. Create feature branch: `git checkout -b feature/new-command`
2. Implement changes with tests
3. Run full test suite
4. Commit with clear message
5. Push and create PR

---

## 8. Testing Strategy

### 8.1 Test Pyramid

```
        /\
       /  \      E2E Tests (few)
      /----\     - Two-participant scenarios
     /      \    - Full command flows
    /--------\   - Recovery scenarios
   /          \  Integration Tests (some)
  /------------\ - Database operations
 /              \- RLS enforcement
/----------------\ Unit Tests (many)
- Domain logic
- Parser grammar
- Validation
```

### 8.2 Test File Organization

```
tests/
├── unit/                    # Fast unit tests
│   ├── domain/
│   │   ├── activities.test.ts
│   │   ├── dates.test.ts
│   │   └── parser.test.ts
│   └── application/
│       └── use-cases.test.ts
├── integration/             # Slower, needs database
│   ├── db/
│   │   ├── rls.test.ts
│   │   └── repository.test.ts
│   └── queue.test.ts
└── e2e/                     # Full system tests
    ├── two-participant.test.ts
    └── command-flow.test.ts
```

### 8.3 Fake Adapter Usage

Fakes replace real external services in tests:

| Fake | Replaces | Used In |
|------|----------|---------|
| `FakeChannelAdapter` | OpenClaw/WhatsApp | E2E tests |
| `FakeTrackerGateway` | Google Sheets API | E2E tests |
| `FakeIntentInterpreter` | Gemini/Groq | Unit, E2E tests |
| `FakeClock` | System time | Unit tests |

**Example fake injection:**
```typescript
const fakeSheets = new FakeTrackerGateway()
  .withData('2026-10-15', { subuh: 2, dzuhur: 3 })
  .withBehavior('timeout');

const useCase = new ApplyCommandUseCase({
  trackerGateway: fakeSheets,
  channelAdapter: new FakeChannelAdapter(),
  // ... other dependencies
});
```

### 8.4 Test Data Guidelines

- All test data must be synthetic
- Use fake names, IDs, phone numbers
- Do not copy from real tracker files
- Activity IDs use real values (subuh, dzuhur, etc.)
- Dates use realistic format (YYYY-MM-DD)

---

## 9. Future Milestones Summary

### M2: Google Integration

**Goal:** Connect real Google Sheets through OAuth

**Key files to create:**
- `packages/infrastructure/src/google/oauth.ts`
- `packages/infrastructure/src/google/picker.ts`
- `packages/infrastructure/src/google/sheets.ts`
- `apps/api/src/http/onboarding/*.ts`

**Verification:**
- [ ] OAuth flow completes
- [ ] Google Picker allows file selection
- [ ] Write to real Sheets works
- [ ] Readback verifies write
- [ ] Undo restores previous value

### M3: Multi-User WhatsApp

**Goal:** Real WhatsApp integration with authenticated bridge

**Key files to create:**
- `packages/openclaw-bridge/src/*.ts`
- `apps/api/src/http/channel-events.ts` (final version)

**Verification:**
- [ ] Two real participants can register
- [ ] Each sees only their tracker
- [ ] Commands work via WhatsApp

### M4: AI Fallback

**Goal:** Interpret free-form language with AI providers

**Key files to create:**
- `packages/infrastructure/src/ai/router.ts`
- `packages/infrastructure/src/ai/gemini.adapter.ts`
- `packages/infrastructure/src/ai/groq.adapter.ts`

**Verification:**
- [ ] Free-form text interpreted correctly
- [ ] Provider fallback works
- [ ] Quota tracking accurate
- [ ] Circuit breaker prevents cascade failures

### M5: Pilot

**Goal:** Deploy with 5-10 volunteer participants

**Key deliverables:**
- Monitoring setup
- Backup/restore procedures
- Privacy compliance
- Documentation

---

## Appendix A: File Count Summary

| Phase | Files | Type |
|-------|-------|------|
| Bootstrap | 10 | Config |
| Domain | 12 | TypeScript |
| Contracts | 5 | TypeScript |
| Application | 10 | TypeScript |
| Infrastructure | 20 | TypeScript |
| Testing | 10 | TypeScript |
| Worker | 8 | TypeScript |
| API | 10 | TypeScript |
| Database | 6 | SQL |
| Tests | 10 | TypeScript |
| **Total** | **~101** | |

---

## Appendix B: Dependency Injection Pattern

Use constructor injection throughout:

```typescript
export class ApplyCommandUseCase {
  constructor(
    private readonly commandRepo: ICommandRepository,
    private readonly mutationRepo: IMutationRepository,
    private readonly trackerGateway: ITrackerGateway,
    private readonly mutationJournal: MutationJournal,
    private readonly clock: IClock
  ) {}

  async execute(command: Command): Promise<MutationResult> {
    // Implementation
  }
}
```

This enables:
- Easy unit testing with mocks/fakes
- Clear dependency boundaries
- No global state

---

## Appendix C: Error Handling Pattern

```typescript
export async function handleCommand(command: Command): Promise<void> {
  try {
    const result = await applyCommandUseCase.execute(command);
    
    if (result.status === 'verified') {
      await outbox.scheduleSuccess(command, result);
    } else if (result.status === 'uncertain') {
      await outbox.schedulePending(command, result);
      await mutationJournal.markUncertain(command.id);
    }
  } catch (error) {
    if (error instanceof DomainError) {
      await outbox.scheduleError(command, error);
    } else {
      // Log unexpected error
      await mutationJournal.markFailed(command.id);
      throw error;
    }
  }
}
```

---

*Plan created: 15 Oktober 2026*
*Status: Initial implementation plan*

---

## M1 Complete Summary

### M1 Deliverables Checklist

| Deliverable | Status | Verification |
|-------------|--------|--------------|
| Workspace bootstrap | [ ] | pnpm install, typecheck pass |
| Domain types | [ ] | Unit tests pass |
| Parser implementation | [ ] | Grammar tests pass |
| Database migrations | [ ] | Apply cleanly |
| Repositories with RLS | [ ] | Isolation tests pass |
| Application use cases | [ ] | Unit tests pass |
| Worker job processing | [ ] | E2E tests pass |
| API HTTP handlers | [ ] | Manual verification |
| Fake adapters | [ ] | Tests use fakes |
| E2E tests | [ ] | Two-participant pass |

### M1 Gate Criteria

Before moving to M2, verify:

1. **Unit tests:** All domain logic tested
2. **Integration tests:** RLS and repository isolation verified
3. **E2E tests:** Two participants fully isolated
4. **No external dependencies:** All tests run locally
5. **Commands work:**
   - `zuhur, 3` -> Updates tracker
   - `subuh kemarin 2` -> Updates yesterday
   - `isya 2026-10-14 3` -> Updates explicit date
   - `rekap hari ini` -> Returns all five prayers
   - `batal` -> Undoes last mutation
   - `bantuan` -> Shows help
   - `status` -> Shows connection status

### Next Steps After M1

1. **Verify M1 complete**
2. **Begin M2: Google Integration**
   - Implement OAuth flow
   - Create Sheets adapter
   - Test with real Google account
3. **Begin G0: OpenClaw spike**
   - Verify WhatsApp integration
   - Document findings

---

## Summary

This implementation plan provides:

1. **Complete file inventory** for all ~100 files to create
2. **Dependency analysis** showing build order
3. **Detailed M1 steps** with code patterns and verification criteria
4. **Verification strategies** for unit, integration, and E2E tests
5. **Development workflow** for local setup and adding features
6. **Testing strategy** with fake adapters and test organization

The plan follows the architecture decisions in ARCHITECTURE.md:
- Modular monolith with clear layer separation
- Domain has no external dependencies
- Infrastructure implements domain interfaces
- Tenant isolation via RLS and composite FKs
- Journal-before-write pattern

Execute M1 in phases:
1. Bootstrap (1 day)
2. Domain + Contracts (2 days)
3. Parser (1 day)
4. Database + Repositories (2 days)
5. Application use cases (2 days)
6. Worker + API (2 days)
7. Testing + E2E (2 days)

**Total estimated: ~12 days for M1 core local**

Remember: No real credentials, no real WhatsApp, no real Google Sheets in M1. All verified with fakes and synthetic data.
