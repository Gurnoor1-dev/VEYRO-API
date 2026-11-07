# VEYRO API — Usage Guide

## Base URL

`https://xebyurthwokbahwjzacf.supabase.co/functions/v1/veyro-api`

## Credentials

Generate a credential pair in the VEYRO API developer console. Every key has a matching **Authorised Verification Token (AVT)**. Send both with every request:

- `x-veyro-api-key: vyr_test_...` for sandbox or `vyr_live_...` for live.
- `x-veyro-verification-token: <private token>`

Raw values are shown once. Store them in a backend secret manager. Do not put them in browser JavaScript, mobile bundles, source control, screenshots or logs.

## REST endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/v1/health` | Gateway health |
| GET | `/v1/airports?query=...` | Search airport records |
| GET | `/v1/airports/{icao}` | Airport profile and runway list |
| GET | `/v1/briefings/{icao}` | Airport briefing and altitude calculations |

Pattern altitude is calculated as airport elevation + 1,500 ft, rounded up to the next 100 ft. Transition altitude is pattern altitude + 1,000 ft, rounded up to the next 500 ft. These are VEYRO briefing helper calculations, not published procedures or authoritative operational values.

## Live API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/v1/live/status` | Provider connection state and freshness |
| GET | `/v1/live/snapshot` | Latest provider snapshot |
| GET | `/v1/live/stream` | Server-sent event stream contract |

Production Live API endpoints return a clear `503 provider_not_configured` response until an authorised provider is connected. Sandbox Live API responses are simulated and labelled. A gateway response is not proof of a live data feed.

## Sandbox

Create a sandbox credential pair in the developer console and use the Sandbox page to test `GET /v1/airports/DEMO`. The DEMO airport and runway are synthetic fixtures. They are not real-world aeronautical data.

## Response envelope

Successful responses use:

```json
{
  "data": {},
  "meta": {
    "environment": "sandbox",
    "source": "VEYRO_SANDBOX_FIXTURE",
    "request_id": "uuid"
  }
}
```

Errors use:

```json
{
  "error": {
    "code": "invalid_credentials",
    "message": "The API key or verification token is invalid."
  },
  "meta": { "request_id": "uuid" }
}
```

## Quotas

Phase 1 free keys start with 500 requests per calendar month. Quotas are applied per credential. Excess requests return HTTP 429. Paid plans are not active in Phase 1.

## Example

```bash
curl "https://xebyurthwokbahwjzacf.supabase.co/functions/v1/veyro-api/v1/airports/DEMO" \
  -H "x-veyro-api-key: YOUR_SANDBOX_KEY" \
  -H "x-veyro-verification-token: YOUR_PRIVATE_AVT"
```
