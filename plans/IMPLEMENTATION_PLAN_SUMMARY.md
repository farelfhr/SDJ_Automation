# SDJ Assistant - Implementation Plan Summary

Versi: 1.0.0  
Tanggal: 15 Oktober 2026

---

## Quick Reference

### Milestone Overview

| Milestone | Description | Estimated Time |
|-----------|-------------|-----------------|
| M1 | Core Local - Parser, Domain, PostgreSQL, Fake Channel | ~12 days |
| G0 | OpenClaw Spike - WhatsApp integration verification | ~3 days |
| M2 | Google Integration - OAuth, Sheets adapter | ~5 days |
| M3 | Multi-User WhatsApp - Real channel integration | ~3 days |
| M4 | AI Fallback - Gemini/Groq interpretation | ~5 days |
| M5 | Pilot - 5-10 participants | ~5 days |

### M1 File Count: ~101 files

| Layer | Files |
|-------|-------|
| Configuration | 10 |
| Domain | 12 |
| Contracts | 5 |
| Application | 10 |
| Infrastructure | 20 |
| Testing | 10 |
| Worker | 8 |
| API | 10 |
| Database | 6 |
| Tests | 10 |

### Build Order

```
Domain → Contracts → Application Ports → Application Use Cases
    ↓
Infrastructure (DB, Google, AI, Channel)
    ↓
Worker + API
    ↓
Testing
```

---

## MVP Commands to Implement

| Command | Action |
|---------|--------|
| `zuhur, 3` | Set Dhuhr score |
| `subuh kemarin 2` | Set yesterday |
| `isya 2026-10-14 3` | Set explicit date |
| `rekap hari ini` | Daily summary |
| `batal` | Undo last |
| `bantuan` | Help |
| `status` | Connection status |

---

## Key Files for M1

### Domain (No External Dependencies)

- `packages/domain/src/activities.ts` - Activity IDs, validation
- `packages/domain/src/dates.ts` - DateResolver
- `packages/domain/src/commands.ts` - CommandProposal schema
- `packages/domain/src/mutations.ts` - TypedCellValue
- `packages/domain/src/parser/` - Grammar interpreter

### Application (Ports/Interfaces)

- `packages/application/src/ports/intent-interpreter.ts`
- `packages/application/src/ports/tracker-gateway.ts`
- `packages/application/src/use-cases/process-message.ts`
- `packages/application/src/use-cases/apply-command.ts`

### Infrastructure (Implementations)

- `packages/infrastructure/src/db/pool.ts`
- `packages/infrastructure/src/db/repositories/*.ts`
- `packages/testing/src/fakes/*.ts`

### API/Worker (Entry Points)

- `apps/api/src/http/channel-events.ts`
- `apps/worker/src/loop.ts`

---

## Verification Commands

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Type check
pnpm typecheck

# Run tests
pnpm test

# Integration tests (requires PostgreSQL)
pnpm test:integration

# E2E tests
pnpm test:e2e

# Start services
docker compose up -d postgres
pnpm db:migrate
pnpm dev:api &
pnpm dev:worker
```

---

## Important Rules

1. **No external services in M1** - Use fakes only
2. **No real credentials** - All synthetic data
3. **Domain has no imports** - Pure TypeScript
4. **Tenant isolation** - RLS + composite FKs
5. **Journal before write** - Mutations logged first
6. **No `any` types** - Strict TypeScript

---

## Next Action

Begin M1.1: Bootstrap workspace
- Create `package.json`, `pnpm-workspace.yaml`
- Create `tsconfig*.json`
- Create `docker-compose.yml`
- Create directory structure

See `plans/sekarang-tolong-baca-terlebih-zazzy-glade-agent-ade1df1e27172e510.md` for detailed steps.
