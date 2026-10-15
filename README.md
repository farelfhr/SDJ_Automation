# SDJ Assistant

Personal spiritual activity tracker via WhatsApp.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start database
docker compose up -d postgres

# Run migrations
pnpm db:migrate

# Start API server
pnpm dev:api

# Start worker (in another terminal)
pnpm dev:worker
```

## Project Structure

```
sdj-assistant/
├── apps/
│   ├── api/          # Fastify HTTP server
│   └── worker/       # Background job worker
├── packages/
│   ├── domain/       # Core business logic
│   ├── contracts/    # Zod schemas
│   ├── application/  # Use cases and ports
│   ├── infrastructure/ # Adapters (DB, AI, Google, Channel)
│   ├── config/      # Configuration management
│   ├── db/          # Database migrations
│   └── testing/     # Testing utilities
└── tests/           # Test setup
```

## Commands

| Command | Action |
|---------|--------|
| `subuh 3` | Record Subuh prayer with score 3 |
| `zuhur kemarin 2` | Record yesterday's Zuhur |
| `rekap hari ini` | Get daily recap |
| `batal` | Undo last change |
| `bantuan` | Show help |

## Score Values

- 0 = Tidak dilaksanakan
- 1 = Berjamaah
- 2 = Sendiri
- 3 = Tepat waktu + berjamaah

## Development

```bash
# Type check
pnpm typecheck

# Run tests
pnpm test

# Run integration tests
pnpm test:integration

# Format code
pnpm format
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

- `DATABASE_URL` - PostgreSQL connection string
- `GROQ_API_KEY` - Groq API key
- `GEMINI_API_KEY` - Google Gemini API key
- `GLM_API_KEY` - Zhipu GLM API key

## License

MIT
