import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-veyro-api-key, x-veyro-verification-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const DEMO_AIRPORT = {
  icao: "DEMO", iata: null, name: "VEYRO Test Aerodrome", city: "Sandbox City",
  country: "Test Region", latitude: 19.076, longitude: 72.8777, elevation_ft: 420,
  source: "VEYRO_SANDBOX_FIXTURE", source_updated_at: null, is_synthetic: true,
  operational_use: false,
  runways: [{ identifier: "09", reciprocal_identifier: "27", length_ft: 3000, width_ft: 60, surface: "Synthetic", heading_true: 90 }]
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, ...extra } });
}
function randomSecret(bytes = 32) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
function monthStart() { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10); }
function getRoute(url: URL) {
  const prefix = "/functions/v1/veyro-api";
  return url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) || "/" : url.pathname;
}
async function getUser(req: Request) {
  const bearer = req.headers.get("authorization") || "";
  const token = bearer.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}
async function management(req: Request) {
  const user = await getUser(req);
  if (!user) return json({ error: { code: "unauthorized", message: "Sign in to manage developer credentials." } }, 401);
  const body = await req.json().catch(() => ({}));
  if (body.action === "create-key") {
    const environment = body.environment === "live" ? "live" : "sandbox";
    const apiKey = "vyr_" + (environment === "live" ? "live_" : "test_") + randomSecret(32);
    const verificationToken = "vvt_" + randomSecret(32);
    const prefix = apiKey.slice(0, 18);
    const { data, error } = await admin.from("veyro_api_keys").insert({
      owner_id: user.id, name: String(body.name || "My API key").slice(0, 60),
      environment, key_prefix: prefix, key_hash: await sha256(apiKey),
      verification_hash: await sha256(verificationToken), monthly_limit: 500,
      scopes: ["airports:read", "briefings:read", "live:read"]
    }).select("id,name,environment,key_prefix,status,plan,monthly_limit,requests_used,created_at").single();
    if (error) return json({ error: { code: "credential_create_failed", message: "Could not create credentials." } }, 500);
    return json({ success: true, credential: data, api_key: apiKey, verification_token: verificationToken, warning: "Copy both secrets now. They cannot be retrieved again." });
  }
  if (body.action === "list-keys") {
    const { data, error } = await admin.from("veyro_api_keys")
      .select("id,name,environment,key_prefix,status,plan,monthly_limit,requests_used,created_at,last_used_at")
      .eq("owner_id", user.id).order("created_at", { ascending: false });
    if (error) return json({ error: { code: "keys_unavailable", message: "Could not load credentials." } }, 500);
    return json({ keys: data || [] });
  }
  if (body.action === "revoke-key") {
    const { data, error } = await admin.from("veyro_api_keys").update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", body.id).eq("owner_id", user.id).eq("status", "active").select("id").maybeSingle();
    if (error || !data) return json({ error: { code: "revoke_failed", message: "Credential not found or already revoked." } }, 404);
    return json({ success: true, revoked: data.id });
  }
  return json({ error: { code: "unknown_action", message: "Unknown developer console action." } }, 400);
}

async function authenticateApi(req: Request) {
  const apiKey = req.headers.get("x-veyro-api-key") || "";
  const verification = req.headers.get("x-veyro-verification-token") || "";
  if (!apiKey || !verification) return { error: "invalid_credentials" as const };
  const prefix = apiKey.slice(0, 18);
  const { data: key } = await admin.from("veyro_api_keys").select("*").eq("key_prefix", prefix).maybeSingle();
  if (!key || key.status !== "active") return { error: "invalid_credentials" as const };
  const [keyHash, verificationHash] = await Promise.all([sha256(apiKey), sha256(verification)]);
  if (!safeEqual(keyHash, key.key_hash) || !safeEqual(verificationHash, key.verification_hash)) return { error: "invalid_credentials" as const };
  const expectedPrefix = key.environment === "live" ? "vyr_live_" : "vyr_test_";
  if (!apiKey.startsWith(expectedPrefix)) return { error: "environment_mismatch" as const };
  const start = monthStart();
  let used = key.requests_used || 0;
  if (key.period_started_at !== start) {
    used = 0;
    await admin.from("veyro_api_keys").update({ requests_used: 0, period_started_at: start }).eq("id", key.id);
  }
  if (used >= key.monthly_limit) return { error: "quota_exceeded" as const, key };
  await admin.from("veyro_api_keys").update({ requests_used: used + 1, last_used_at: new Date().toISOString() }).eq("id", key.id);
  return { key: { ...key, requests_used: used + 1 } };
}
async function getAirport(icao: string, environment: string) {
  // Sandbox keys are isolated from the production airport tables.
  if (environment === "sandbox") return icao === "DEMO" ? DEMO_AIRPORT : null;
  const { data: airport, error } = await admin.from("veyro_airports").select("*").eq("icao", icao).maybeSingle();
  if (error || !airport) return null;
  const { data: runways } = await admin.from("veyro_airport_runways").select("*").eq("airport_icao", icao);
  return { ...airport, runways: runways || [], is_synthetic: false, operational_use: false };
}
async function handleApi(req: Request, route: string, started: number) {
  const auth = await authenticateApi(req);
  if ("error" in auth) {
    const status = auth.error === "quota_exceeded" ? 429 : auth.error === "environment_mismatch" ? 403 : 401;
    return json({ error: { code: auth.error, message: auth.error === "quota_exceeded" ? "Monthly request quota exceeded." : "The API key or verification token is invalid." }, meta: { request_id: crypto.randomUUID() } }, status);
  }
  const key = auth.key;
  const url = new URL(req.url);
  const method = req.method.toUpperCase();
  let status = 200;
  let payload: Record<string, unknown>;
  if (method !== "GET") {
    status = 405; payload = { error: { code: "method_not_allowed", message: "This endpoint only supports GET." } };
  } else if (route === "/v1/health") {
    payload = { data: { status: "operational", service: "VEYRO API", version: "1.0.0", live_provider: "not_configured" } };
  } else if (route === "/v1/airports" || route.startsWith("/v1/airports?")) {
    const query = (url.searchParams.get("query") || "").trim().toUpperCase();
    if (key.environment === "sandbox") {
      const match = !query || "DEMO VEYRO TEST AERODROME".includes(query);
      payload = { data: match ? [DEMO_AIRPORT] : [], meta: { source: "VEYRO_SANDBOX_FIXTURE", environment: "sandbox", synthetic: true } };
    } else {
      let q = admin.from("veyro_airports").select("icao,iata,name,city,country,latitude,longitude,elevation_ft,source,source_updated_at,updated_at").limit(25);
      if (query) q = q.or("icao.ilike.%"+query+"%,iata.ilike.%"+query+"%,name.ilike.%"+query+"%,city.ilike.%"+query+"%");
      const { data, error } = await q;
      status = error ? 500 : 200;
      payload = error ? { error: { code: "data_query_failed", message: "Airport search is temporarily unavailable." } } : { data: data || [], meta: { environment: "live", source: "VEYRO_CURATED_DATA" } };
    }
  } else if (route.startsWith("/v1/airports/")) {
    const icao = decodeURIComponent(route.split("/").pop() || "").toUpperCase();
    const airport = await getAirport(icao, key.environment);
    if (!airport) { status = 404; payload = { error: { code: "airport_not_found", message: "No airport record was found for " + icao + "." } }; }
    else payload = { data: airport, meta: { environment: key.environment, source: airport.source, synthetic: airport.is_synthetic === true, notice: airport.is_synthetic ? "Synthetic sandbox fixture. Not for operational use." : "Verify all information against authoritative sources." } };
  } else if (route.startsWith("/v1/briefings/")) {
    const icao = decodeURIComponent(route.split("/").pop() || "").toUpperCase();
    const airport = await getAirport(icao, key.environment);
    if (!airport) { status = 404; payload = { error: { code: "airport_not_found", message: "No airport record was found for " + icao + "." } }; }
    else {
      const elevation = Number(airport.elevation_ft || 0);
      const pattern = Math.ceil((elevation + 1500) / 100) * 100;
      const transition = Math.ceil((pattern + 1000) / 500) * 500;
      payload = { data: { airport, calculations: { pattern_altitude_ft: pattern, transition_altitude_ft: transition, formula: "Pattern = field elevation + 1,500 ft rounded up to 100 ft; transition = pattern + 1,000 ft rounded up to 500 ft." }, generated_at: new Date().toISOString() }, meta: { environment: key.environment, synthetic: airport.is_synthetic === true, operational_use: false } };
    }
  } else if (route === "/v1/live/status" || route === "/v1/live/snapshot" || route === "/v1/live/stream") {
    if (key.environment === "sandbox") {
      payload = { data: { provider_state: "simulated", connected: false, is_live: false, source: "VEYRO_SANDBOX_FIXTURE", message: "This is a synthetic sandbox response. No live provider is connected.", aircraft: route.endsWith("snapshot") ? [{ callsign: "VEYRO-DEMO", latitude: 19.076, longitude: 72.8777, altitude_ft: 12000, groundspeed_kt: 210, simulated: true }] : undefined, stream: route.endsWith("stream") ? { protocol: "SSE", available: false, note: "Streaming provider integration is planned; this fixture is not a live feed." } : undefined }, meta: { environment: "sandbox", synthetic: true } };
    } else {
      status = 503;
      payload = { error: { code: "provider_not_configured", message: "No authorised live aviation data provider is connected yet." }, data: { provider_state: "not_configured", connected: false, is_live: false }, meta: { environment: "live", retryable: false } };
    }
  } else {
    status = 404; payload = { error: { code: "endpoint_not_found", message: "Unknown VEYRO API endpoint." } };
  }
  const requestId = crypto.randomUUID();
  const latency = Date.now() - started;
  const responseBody = { ...payload, meta: { ...(payload.meta as Record<string, unknown> || {}), request_id: requestId, environment: key.environment, latency_ms: latency } };
  await admin.from("veyro_api_usage").insert({ key_id: key.id, endpoint: route, method, environment: key.environment, status_code: status, latency_ms: latency });
  return json(responseBody, status, { "X-VEYRO-Request-ID": requestId, "X-RateLimit-Limit": String(key.monthly_limit), "X-RateLimit-Remaining": String(Math.max(0, key.monthly_limit - (key.requests_used || 0))) });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const started = Date.now();
  const url = new URL(req.url);
  const route = getRoute(url);
  if (route === "/console" && req.method === "POST") return management(req);
  if (route === "/" && req.method === "POST") return management(req);
  return handleApi(req, route, started);
});
