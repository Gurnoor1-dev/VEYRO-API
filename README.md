# VEYRO API

VEYRO API is an aviation developer platform with a REST API, Live API foundations, per-developer credentials, a sandbox, and a developer portal.

## Phase 1

- Airport lookup and runway data endpoints
- IFATC briefing calculations
- Live API status and snapshot contracts
- Developer authentication and per-key quotas
- Separate live and sandbox credentials
- A private Authorised Verification Token (AVT) paired with every API key
- Usage analytics, API explorer, docs, terms and sandbox fixtures

## Architecture

- **Portal:** React + Vite, deployed on Vercel
- **API gateway:** Supabase Edge Function `veyro-api`
- **Database/Auth:** Supabase project `xebyurthwokbahwjzacf`
- **Secrets:** Raw API keys and AVTs are shown once; only SHA-256 hashes are stored.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set the Supabase URL and publishable key.
3. Run `npm install` and `npm run dev`.

## Important data status

The sandbox uses clearly labelled synthetic fixtures. Live aircraft and real-world weather/ATIS providers are not enabled in Phase 1 until their data sources, permissions, and credentials are configured. Never use sandbox data or unverified API output for real-world flight operations.

## API base URL

`https://xebyurthwokbahwjzacf.supabase.co/functions/v1/veyro-api`

All API requests require both `x-veyro-api-key` and `x-veyro-verification-token`.

See [Usage Guide](docs/USAGE.md) and [Terms](docs/TERMS.md).
