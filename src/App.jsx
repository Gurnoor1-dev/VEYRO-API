import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, ArrowUpRight as External,
  ArrowLeft, ArrowUp, BadgeCheck, BookOpen, Braces, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleHelp, Code2, Copy, Database, Eye, EyeOff, Gauge, Globe2,
  KeyRound, Layers3, LockKeyhole, Menu, Moon, Plane, Radio, RefreshCw, Search,
  Shield, ShieldCheck, Sparkles, Terminal, X, Zap, Sun, Server, ChartNoAxesCombined
} from "lucide-react";
import { supabase, API_BASE } from "./lib/supabase";

const navItems = [
  ["Overview", "home"], ["Documentation", "docs"], ["Sandbox", "sandbox"],
  ["Pricing", "pricing"], ["Terms", "terms"]
];

const endpointGroups = [
  { label: "REST API", tag: "STABLE CONTRACT", items: [
    ["GET", "/v1/airports", "Search airports by ICAO, IATA or name"],
    ["GET", "/v1/airports/{icao}", "Airport profile and available runway data"],
    ["GET", "/v1/briefings/{icao}", "Calculated IFATC briefing data"],
    ["GET", "/v1/health", "API gateway health and version"]
  ]},
  { label: "LIVE API", tag: "PROVIDER-DEPENDENT", items: [
    ["GET", "/v1/live/status", "Live source connectivity and freshness"],
    ["GET", "/v1/live/snapshot", "Latest aircraft snapshot when a provider is connected"],
    ["GET", "/v1/live/stream", "Server-sent event stream contract"]
  ]}
];

const sampleResponse = {
  data: {
    icao: "DEMO", name: "VEYRO Test Aerodrome", city: "Sandbox City",
    country: "Test Region", elevation_ft: 420,
    runways: [{ identifier: "09", reciprocal_identifier: "27", length_ft: 3000, width_ft: 60, surface: "Synthetic" }],
    is_synthetic: true, operational_use: false
  },
  meta: { source: "VEYRO_SANDBOX_FIXTURE", environment: "sandbox", notice: "Synthetic sample data. Not for navigation or operational use." }
};

function Logo({ small = false }) {
  return <div className={"brand " + (small ? "brand-small" : "")}>
    <img className="brand-logo" src="https://veyro-analytics.vercel.app/logo.png" alt="VEYRO" />
    <span className="brand-light">API</span>
  </div>;
}

function Code({ children }) { return <code className="inline-code">{children}</code>; }

function App() {
  const [page, setPage] = useState("home");
  const [theme, setTheme] = useState("dark");
  const [mobileNav, setMobileNav] = useState(false);
  const [session, setSession] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [keys, setKeys] = useState([]);
  const [keyName, setKeyName] = useState("My VEYRO integration");
  const [keyEnvironment, setKeyEnvironment] = useState("sandbox");
  const [keyBusy, setKeyBusy] = useState(false);
  const [newSecret, setNewSecret] = useState(null);
  const [showSecret, setShowSecret] = useState(false);
  const [testIcao, setTestIcao] = useState("DEMO");
  const [testKey, setTestKey] = useState("");
  const [testToken, setTestToken] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [testBusy, setTestBusy] = useState(false);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) loadKeys(); }, [session]);

  const loadKeys = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.functions.invoke("veyro-api", { body: { action: "list-keys" } });
    if (error) { setNotice(error.message); return; }
    setKeys(data?.keys || []);
  };

  const notify = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4200);
  };

  const go = (next) => { setPage(next); setMobileNav(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const copy = async (value, label) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(""), 1800); }
    catch { notify("Clipboard access was blocked by your browser."); }
  };

  const authenticate = async (event) => {
    event.preventDefault();
    if (!supabase) { notify("Add the Supabase publishable key to the Vercel environment first."); return; }
    setAuthBusy(true);
    const result = authMode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (result.error) { notify(result.error.message); return; }
    if (authMode === "signup" && !result.data.session) {
      notify("Check your inbox to confirm your email, then sign in.");
      setAuthMode("signin");
    } else {
      setSession(result.data.session);
      setAuthOpen(false);
      go("dashboard");
    }
  };

  const signOut = async () => {
    await supabase?.auth.signOut();
    setSession(null); setKeys([]); setNewSecret(null); go("home");
  };

  const createKey = async (event) => {
    event.preventDefault();
    if (!supabase || !session) { setAuthOpen(true); return; }
    setKeyBusy(true);
    const { data, error } = await supabase.functions.invoke("veyro-api", {
      body: { action: "create-key", name: keyName, environment: keyEnvironment }
    });
    setKeyBusy(false);
    if (error || data?.error) { notify(error?.message || data.error.message || "Could not create key."); return; }
    setNewSecret(data);
    setShowSecret(true);
    await loadKeys();
  };

  const revokeKey = async (id) => {
    const { data, error } = await supabase.functions.invoke("veyro-api", { body: { action: "revoke-key", id } });
    if (error || data?.error) { notify(error?.message || data.error.message || "Could not revoke key."); return; }
    notify("API credential revoked.");
    await loadKeys();
  };

  const runSandbox = async (event) => {
    event.preventDefault();
    setTestBusy(true); setTestResult(null);
    try {
      const response = await fetch(API_BASE + "/v1/airports/" + encodeURIComponent(testIcao.trim().toUpperCase()), {
        headers: { "x-veyro-api-key": testKey, "x-veyro-verification-token": testToken }
      });
      const body = await response.json();
      setTestResult({ status: response.status, body });
    } catch (error) {
      setTestResult({ status: "NETWORK ERROR", body: { error: error.message } });
    }
    setTestBusy(false);
  };

  const isLoggedIn = Boolean(session?.user);
  const activeKeys = useMemo(() => keys.filter((item) => item.status === "active"), [keys]);

  return <div className={"app theme-" + theme}>
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <motion.header className="topbar" initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: .65, ease: [0.22, 1, 0.36, 1] }}>
      <button className="logo-button" onClick={() => go("home")} aria-label="VEYRO API home"><Logo /></button>
      <motion.nav className={"nav-links " + (mobileNav ? "nav-open" : "")} initial={false} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}>
        {navItems.map(([label, id]) => <motion.button key={id} whileHover={{ y: -1 }} whileTap={{ scale: .97 }} className={"nav-link " + (page === id ? "active" : "")} onClick={() => go(id)}>{label}{page === id && <motion.span className="nav-active-indicator" layoutId="nav-active-indicator" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}</motion.button>)}
      </nav>
      <div className="top-actions">
        <button className="icon-button theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Toggle theme">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
        {isLoggedIn
          ? <button className="button button-primary button-small" onClick={() => go("dashboard")}>Console <ArrowUpRight size={15}/></button>
          : <button className="button button-primary button-small" onClick={() => { setAuthOpen(true); setAuthMode("signin"); }}>Developer sign in <ArrowRight size={15}/></button>}
        <button className="icon-button mobile-menu" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation">{mobileNav ? <X/> : <Menu/>}</button>
      </div>
    </motion.header>

    <main>
      <AnimatePresence mode="wait">
        {page === "home" && <motion.div key="home" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .25 }}>
          <section className="hero section-wrap">
            <div className="hero-copy">
              <div className="eyebrow"><span className="pulse-dot"/> AVIATION DATA, BUILT FOR DEVELOPERS</div>
              <h1>Build beyond<br/><span className="gradient-text">the flight deck.</span></h1>
              <p className="hero-lede">Aviation intelligence, clean APIs, and developer-first tools. One platform to power your next aviation product.</p>
              <div className="hero-actions">
                <button className="button button-primary" onClick={() => { if (isLoggedIn) go("dashboard"); else { setAuthOpen(true); setAuthMode("signup"); } }}>Get your API keys <ArrowRight size={17}/></button>
                <button className="button button-ghost" onClick={() => go("docs")}><BookOpen size={17}/> Explore documentation</button>
              </div>
              <div className="hero-proof"><div className="proof-avatars"><span>V</span><span>A</span><span>IF</span></div><span>Designed for aviation builders, VAs and simulation communities.</span></div>
            </div>
            <div className="hero-visual">
              <div className="radar-grid"><div className="radar-ring ring-a"/><div className="radar-ring ring-b"/><div className="radar-ring ring-c"/><div className="radar-sweep"/></div>
              <div className="flight-chip chip-top"><span className="chip-dot green"/> REST API <b>READY</b></div>
              <div className="flight-chip chip-bottom"><span className="chip-dot blue"/> LIVE API <b>PHASE 1</b></div>
              <div className="hero-plane"><Plane size={42} strokeWidth={1.3}/></div>
              <div className="coordinate coord-one">19°05' N · 72°52' E</div>
              <div className="coordinate coord-two">VEYRO / CORE</div>
              <div className="mini-data"><span>API GATEWAY</span><strong>Operational</strong><small>Supabase Edge Runtime</small></div>
            </div>
          </section>

          <section className="metrics section-wrap">
            <div className="metric"><span>01 / DATA</span><strong>Structured</strong><small>Consistent aviation responses</small></div>
            <div className="metric"><span>02 / ACCESS</span><strong>Private by design</strong><small>Two-part developer credentials</small></div>
            <div className="metric"><span>03 / TESTING</span><strong>Sandbox ready</strong><small>Isolated synthetic fixtures</small></div>
            <div className="metric"><span>04 / BUILD</span><strong>Developer-first</strong><small>Docs, examples and API explorer</small></div>
          </section>

          <section className="section-wrap feature-section">
            <div className="section-heading"><div><div className="eyebrow">THE PLATFORM</div><h2>Everything you need.<br/><span className="muted-heading">Nothing in your way.</span></h2></div><p>Start with dependable REST contracts. Expand into live data as trusted providers become available.</p></div>
            <div className="feature-grid">
              <Feature icon={<Database/>} number="01" title="Airport intelligence" text="Airport profiles, runway information, identifiers, coordinates and elevation in a predictable format."/>
              <Feature icon={<Gauge/>} number="02" title="Briefing calculations" text="Consistent pattern and transition altitude calculations for briefing workflows."/>
              <Feature icon={<Radio/>} number="03" title="Live API foundation" text="A clear contract for source status, snapshots and event streaming without pretending unavailable data is live."/>
              <Feature icon={<ShieldCheck/>} number="04" title="Private credentials" text="Every key has a separate verification token, independent revocation and usage limits."/>
              <Feature icon={<Terminal/>} number="05" title="Developer sandbox" text="Try endpoints against isolated synthetic data before connecting a real application."/>
              <Feature icon={<ChartNoAxesCombined/>} number="06" title="Usage insights" text="Monitor request volume, endpoint activity, quota consumption and response status."/>
            </div>
          </section>

          <section className="section-wrap api-preview">
            <div className="api-preview-copy"><div className="eyebrow">ONE API. CLEAR CONTRACTS.</div><h2>Simple to call.<br/><span className="gradient-text">Easy to build on.</span></h2><p>Use the same predictable response envelope across REST and Live endpoints. Authenticate with your API key and private verification token.</p><button className="text-button" onClick={() => go("docs")}>View all endpoints <ArrowRight size={16}/></button></div>
            <div className="terminal-card"><div className="terminal-top"><div className="window-dots"><i/><i/><i/></div><span>REQUEST / REST</span><span className="terminal-status">200 OK</span></div><div className="terminal-code"><span className="code-comment">// Your credentials stay server-side</span><br/><span className="code-purple">curl</span> -X GET \<br/>&nbsp; <span className="code-green">"{API_BASE}/v1/airports/DEMO"</span> \<br/>&nbsp; -H <span className="code-green">"x-veyro-api-key: vyr_test_..."</span> \<br/>&nbsp; -H <span className="code-green">"x-veyro-verification-token: ..."</span><br/><br/><span className="code-comment">// Consistent JSON response</span><br/><span className="code-purple">{"{"}</span><br/>&nbsp; <span className="code-blue">"data"</span>: {"{"} <span className="code-green">"icao"</span>: <span className="code-orange">"DEMO"</span> {"}"},<br/>&nbsp; <span className="code-blue">"meta"</span>: {"{"} <span className="code-green">"environment"</span>: <span className="code-orange">"sandbox"</span> {"}"}<br/><span className="code-purple">{"}"}</span></div></div>
          </section>

          <section className="section-wrap bottom-cta"><div className="cta-orb"><Sparkles size={24}/></div><div><div className="eyebrow">YOUR NEXT BUILD STARTS HERE</div><h2>Make aviation software<br/>feel effortless.</h2><p>Get a sandbox key, make your first request, and build with VEYRO.</p></div><button className="button button-primary" onClick={() => { if (isLoggedIn) go("dashboard"); else { setAuthOpen(true); setAuthMode("signup"); } }}>Start building <ArrowRight size={17}/></button></section>
        </motion.div>}

        {page === "docs" && <motion.div key="docs" className="section-wrap page-content" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
          <div className="eyebrow">DEVELOPER DOCUMENTATION</div><h1 className="page-title">The API, <span className="gradient-text">explained.</span></h1><p className="page-lede">Everything needed to authenticate, make requests, understand responses and handle errors.</p>
          <div className="docs-layout"><aside className="docs-toc"><a href="#quickstart">Quick start</a><a href="#auth">Authentication</a><a href="#rest">REST endpoints</a><a href="#live">Live endpoints</a><a href="#responses">Responses</a><a href="#limits">Rate limits</a><a href="#errors">Errors</a></aside><div className="docs-main">
            <article id="quickstart" className="doc-card"><div className="doc-kicker">01 / GET STARTED</div><h2>Make your first request</h2><p>Create a developer account, generate a sandbox credential pair, and call the airport fixture.</p><CodeBlock text={'curl "' + API_BASE + '/v1/airports/DEMO" \\\n  -H "x-veyro-api-key: YOUR_SANDBOX_KEY" \\\n  -H "x-veyro-verification-token: YOUR_PRIVATE_AVT"'} onCopy={copy} copied={copied}/><div className="callout"><ShieldCheck size={18}/><span>Keep both credentials on your server. Never commit them, embed them in a browser app, or share them in public logs.</span></div></article>
            <article id="auth" className="doc-card"><div className="doc-kicker">02 / AUTHENTICATION</div><h2>Two-part verification</h2><p>Each credential is issued as a pair. Send both headers on every API request.</p><div className="auth-pair"><div><KeyRound/><b>API key</b><span>Identifies your project and environment.</span><Code>x-veyro-api-key</Code></div><div><LockKeyhole/><b>Authorised Verification Token</b><span>Private second factor unique to that key.</span><Code>x-veyro-verification-token</Code></div></div><p>Raw credentials are displayed only once. VEYRO stores SHA-256 hashes, supports independent revocation, and never returns secret values from the key-list endpoint.</p></article>
            <article id="rest" className="doc-card"><div className="doc-kicker">03 / REST API</div><h2>REST endpoints</h2><p>Base URL: <Code>{API_BASE}</Code></p>{endpointGroups[0].items.map((item) => <EndpointRow key={item[1]} item={item}/>)}</article>
            <article id="live" className="doc-card"><div className="doc-kicker">04 / LIVE API</div><h2>Live data contracts</h2><p>Live endpoints expose provider status and snapshot contracts. In Phase 1, production live sources remain unconfigured until authorised provider credentials and commercial permissions are added. Sandbox responses are explicitly simulated.</p>{endpointGroups[1].items.map((item) => <EndpointRow key={item[1]} item={item}/>) }<div className="callout callout-warn"><Activity size={18}/><span>Do not treat a successful API gateway response as proof that a live data provider is connected. Check <Code>/v1/live/status</Code> and its source state.</span></div></article>
            <article id="responses" className="doc-card"><div className="doc-kicker">05 / RESPONSE FORMAT</div><h2>Predictable JSON</h2><CodeBlock text={JSON.stringify({data:{icao:"DEMO",name:"VEYRO Test Aerodrome"},meta:{environment:"sandbox",source:"VEYRO_SANDBOX_FIXTURE",request_id:"uuid",notice:"Synthetic data only"}},null,2)} onCopy={copy} copied={copied}/></article>
            <article id="limits" className="doc-card"><div className="doc-kicker">06 / QUOTAS</div><h2>Usage and rate limits</h2><p>Phase 1 sandbox keys start with 500 monthly requests. Limits are enforced per key. The response includes quota headers where available. Requests that exceed the monthly quota receive HTTP 429.</p></article>
            <article id="errors" className="doc-card"><div className="doc-kicker">07 / ERRORS</div><h2>Understand API errors</h2><div className="error-list"><div><b>401</b><span>Missing or invalid API key / verification token.</span></div><div><b>403</b><span>Credential revoked or environment mismatch.</span></div><div><b>404</b><span>Airport or endpoint not found.</span></div><div><b>429</b><span>Monthly request quota exceeded.</span></div><div><b>503</b><span>Live provider is not configured or unavailable.</span></div></div></article>
          </div></div>
        </motion.div>}

        {page === "sandbox" && <motion.div key="sandbox" className="section-wrap page-content" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
          <div className="eyebrow"><span className="pulse-dot"/> ISOLATED TEST ENVIRONMENT</div><h1 className="page-title">Build without <span className="gradient-text">breaking things.</span></h1><p className="page-lede">Explore the API with synthetic data. Sandbox credentials are separate from live credentials and cannot access production datasets.</p>
          <div className="sandbox-banner"><div className="sandbox-icon"><Terminal/></div><div><b>Sandbox environment active</b><span>Fixture responses are synthetic and clearly marked. No live aircraft or operational weather data is returned here.</span></div><span className="status-pill status-blue">SANDBOX</span></div>
          <div className="sandbox-grid"><div className="doc-card sandbox-form-card"><div className="doc-kicker">REQUEST BUILDER</div><h2>Try an endpoint</h2><form onSubmit={runSandbox} className="stack-form"><label>Endpoint<select defaultValue="airport" disabled><option value="airport">GET /v1/airports/{'{icao}'}</option></select></label><label>Airport code<input value={testIcao} onChange={(e)=>setTestIcao(e.target.value)} placeholder="DEMO" maxLength={4}/></label><label>Sandbox API key<input value={testKey} onChange={(e)=>setTestKey(e.target.value)} placeholder="vyr_test_..." autoComplete="off"/></label><label>Authorised Verification Token<input value={testToken} onChange={(e)=>setTestToken(e.target.value)} placeholder="Your private token" autoComplete="off"/></label><button className="button button-primary" disabled={testBusy || !testKey || !testToken}>{testBusy ? <RefreshCw className="spin"/> : <Terminal size={16}/>} Send request <ArrowRight size={16}/></button></form><p className="form-hint">Need credentials? <button className="inline-link" onClick={()=>{if(isLoggedIn)go("dashboard");else{setAuthOpen(true);setAuthMode("signup");}}}>Create a free sandbox key</button>.</p></div>
          <div className="doc-card response-card"><div className="response-head"><div><div className="doc-kicker">RESPONSE INSPECTOR</div><h2>JSON output</h2></div><span className="status-pill status-green">{testResult ? testResult.status : "READY"}</span></div><pre className="response-code">{JSON.stringify(testResult?.body || sampleResponse,null,2)}</pre><div className="response-foot"><span><span className="chip-dot green"/> Synthetic fixture preview</span><button className="text-button" onClick={()=>copy(JSON.stringify(testResult?.body || sampleResponse,null,2),"response")}>{copied==="response" ? <Check size={14}/> : <Copy size={14}/>} Copy JSON</button></div></div></div>
          <div className="sandbox-note"><ShieldCheck size={19}/><div><b>Sandbox isolation</b><p>Sandbox keys are marked as test credentials, receive a separate quota, and are restricted to synthetic fixtures. Do not use sandbox output for flight planning, dispatch, navigation or air traffic control.</p></div></div>
        </motion.div>}

        {page === "dashboard" && <motion.div key="dashboard" className="section-wrap page-content" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
          {!isLoggedIn ? <div className="login-panel"><div className="eyebrow">DEVELOPER CONSOLE</div><h1 className="page-title">Your build starts <span className="gradient-text">here.</span></h1><p className="page-lede">Sign in to create credentials, inspect usage and manage your integrations.</p><button className="button button-primary" onClick={()=>{setAuthOpen(true);setAuthMode("signin");}}>Sign in to console <ArrowRight size={16}/></button></div> :
          <><div className="dashboard-heading"><div><div className="eyebrow">DEVELOPER CONSOLE / OVERVIEW</div><h1 className="page-title">Welcome <span className="gradient-text">{session.user.email?.split("@")[0] || "developer"}.</span></h1><p className="page-lede">Manage credentials and monitor your VEYRO integrations.</p></div><button className="button button-ghost" onClick={signOut}>Sign out</button></div>
            <div className="dashboard-stats"><Stat icon={<KeyRound/>} label="Active credentials" value={String(activeKeys.length)}/><Stat icon={<Activity/>} label="Monthly requests" value={keys.reduce((sum,k)=>sum+(k.requests_used||0),0).toLocaleString()}/><Stat icon={<Gauge/>} label="Monthly quota" value={keys.reduce((sum,k)=>sum+(k.monthly_limit||0),0).toLocaleString()}/><Stat icon={<ShieldCheck/>} label="Account status" value="Verified session"/></div>
            <div className="dashboard-grid"><div className="doc-card"><div className="response-head"><div><div className="doc-kicker">CREDENTIAL MANAGEMENT</div><h2>Your API keys</h2></div><button className="icon-button" onClick={loadKeys}><RefreshCw size={16}/></button></div><p className="subtle-copy">Create separate credentials for sandbox testing and live integrations. Secret values are only shown once.</p>
              <form className="create-key-form" onSubmit={createKey}><label>Key name<input value={keyName} onChange={(e)=>setKeyName(e.target.value)} maxLength={60}/></label><label>Environment<select value={keyEnvironment} onChange={(e)=>setKeyEnvironment(e.target.value)}><option value="sandbox">Sandbox · test data</option><option value="live">Live · production data</option></select></label><button className="button button-primary" disabled={keyBusy}>{keyBusy ? <RefreshCw className="spin"/> : <KeyRound size={16}/>} Generate credentials</button></form>
              {newSecret && <div className="secret-reveal"><div className="secret-title"><BadgeCheck size={18}/> Your new credential pair</div><p>Copy both values now. They will not be shown again.</p><label>API key</label><div className="secret-value"><span>{showSecret ? newSecret.api_key : "••••••••••••••••••••••••••••••••"}</span><button onClick={()=>copy(newSecret.api_key,"key")}><Copy size={15}/></button></div><label>Authorised Verification Token</label><div className="secret-value"><span>{showSecret ? newSecret.verification_token : "••••••••••••••••••••••••••••••••"}</span><button onClick={()=>copy(newSecret.verification_token,"token")}><Copy size={15}/></button></div><div className="secret-actions"><button className="text-button" onClick={()=>setShowSecret(!showSecret)}>{showSecret ? <EyeOff size={15}/> : <Eye size={15}/>} {showSecret ? "Hide secrets" : "Reveal secrets"}</button><button className="text-button" onClick={()=>{copy("API key: "+newSecret.api_key+"\nVerification token: "+newSecret.verification_token,"pair");}}> <Copy size={15}/> Copy pair</button><button className="text-button" onClick={()=>setNewSecret(null)}>Dismiss</button></div></div>}
              <div className="key-list">{keys.length===0 ? <div className="empty-state"><KeyRound size={25}/><b>No API credentials yet</b><span>Create a sandbox key to make your first request.</span></div> : keys.map((key)=><div className="key-row" key={key.id}><div className="key-symbol"><KeyRound size={17}/></div><div className="key-info"><b>{key.name}</b><span>{key.key_prefix}•••• · {key.environment.toUpperCase()} · {key.requests_used || 0} / {key.monthly_limit} requests</span></div><span className={"status-pill "+(key.status==="active"?"status-green":"status-muted")}>{key.status}</span>{key.status==="active" && <button className="icon-button danger-icon" title="Revoke key" onClick={()=>revokeKey(key.id)}><X size={16}/></button>}</div>)}</div>
            </div><div className="doc-card quick-links"><div className="doc-kicker">BUILD TOOLS</div><h2>Keep moving</h2><button onClick={()=>go("docs")}><BookOpen/><span><b>API documentation</b><small>Endpoints, authentication and examples</small></span><ChevronRight/></button><button onClick={()=>go("sandbox")}><Terminal/><span><b>Sandbox explorer</b><small>Test calls with your sandbox credentials</small></span><ChevronRight/></button><button onClick={()=>go("terms")}><Shield/><span><b>Usage terms</b><small>Data use, limitations and responsibilities</small></span><ChevronRight/></button></div></div>
          </>}
        </motion.div>}

        {page === "pricing" && <motion.div key="pricing" className="section-wrap page-content" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
          <div className="eyebrow">SIMPLE, TRANSPARENT ACCESS</div><h1 className="page-title">Start free. <span className="gradient-text">Scale when ready.</span></h1><p className="page-lede">Phase 1 opens with free developer access. Paid plans are planned, not yet charged or activated.</p><div className="pricing-grid"><Price name="Sandbox" price="Free" detail="For learning and integration testing" items={["500 requests / month","Synthetic test fixtures","REST endpoint access","Separate test credentials"]} action="Create sandbox key" onClick={()=>{if(isLoggedIn)go("dashboard");else{setAuthOpen(true);setAuthMode("signup");}}}/><Price featured name="Developer" price="Coming soon" detail="For hobby projects and small apps" items={["Higher monthly quotas","Curated airport data","Briefing endpoints","Usage analytics"]} action="Join the waitlist" onClick={()=>notify("Paid subscriptions will be enabled after data-source and operating costs are validated.")}/><Price name="Business" price="Coming soon" detail="For VAs and production integrations" items={["Custom quotas","Multiple credentials","Live data integrations","Priority support"]} action="Contact VEYRO" onClick={()=>notify("Business enquiries will open with the paid launch.")}/></div><div className="callout"><CircleHelp size={18}/><span>Pricing and paid service levels are proposals. No payment is collected in Phase 1.</span></div>
        </motion.div>}

        {page === "terms" && <motion.div key="terms" className="section-wrap page-content terms-page" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
          <div className="eyebrow">POLICIES / PHASE 1</div><h1 className="page-title">Usage terms & <span className="gradient-text">conditions.</span></h1><p className="page-lede">Effective date: 7 November 2026 · Draft service terms for the Phase 1 preview.</p>
          <article className="doc-card"><h2>1. Acceptable use</h2><p>You may use VEYRO API to develop, test and operate aviation-related software within your plan limits. You must not abuse, overload, reverse engineer, resell raw data where prohibited, bypass authentication, or use the service to violate applicable law or third-party terms.</p><h2>2. Credentials and security</h2><p>Each API key is paired with a private Authorised Verification Token. Keep both confidential, store them server-side, rotate them after suspected exposure, and revoke unused credentials. You are responsible for activity performed using your credentials.</p><h2>3. Sandbox data</h2><p>Sandbox fixtures are synthetic examples for software testing only. They do not represent actual airports, aircraft, weather, traffic or operational conditions. Sandbox output must never be used for navigation, dispatch, air traffic control, flight planning or real-world safety decisions.</p><h2>4. Live and third-party data</h2><p>Live API availability depends on external data providers, licensing, network conditions and source permissions. Phase 1 does not promise live aircraft, ATIS, METAR or TAF availability. You must comply with all applicable provider terms and attribution requirements.</p><h2>5. No operational guarantee</h2><p>VEYRO API is a developer service, not an approved aeronautical information publication, certified navigation system, dispatch release or air traffic control tool. Data may be incomplete, delayed, inaccurate or unavailable. Always verify operational information against authoritative sources.</p><h2>6. Quotas and availability</h2><p>Requests are subject to per-key quotas, rate limits, maintenance and fair-use controls. We may suspend credentials that threaten service reliability or violate these terms. Phase 1 is a preview and may change without notice.</p><h2>7. Privacy and logging</h2><p>We store account details, credential hashes and request metadata such as endpoint, method, response code and timestamp for security, billing readiness and usage analytics. Raw API keys and verification tokens are not stored in readable form. Avoid placing personal or sensitive information in request paths or query parameters.</p><h2>8. Payments</h2><p>No paid subscription is activated in Phase 1. Any future paid plans will be governed by plan-specific pricing, billing and cancellation terms presented before purchase.</p><h2>9. Changes and contact</h2><p>These preview terms may be updated as the service evolves. Continued use after updated terms are published constitutes acceptance where permitted by law. For support, use the VEYRO project contact channels.</p><div className="callout callout-warn"><Shield size={18}/><span>This is a product-ready draft, not legal advice. Have the final terms and privacy notice reviewed for the jurisdictions and data sources where VEYRO operates before public paid launch.</span></div></article>
        </motion.div>}
      </AnimatePresence>
    </main>

    <footer className="footer section-wrap"><div><Logo small/><p>Precision data. Better aviation software.</p></div><div className="footer-links"><button onClick={()=>go("docs")}>Documentation</button><button onClick={()=>go("sandbox")}>Sandbox</button><button onClick={()=>go("terms")}>Terms</button><button onClick={()=>go("pricing")}>Pricing</button></div><div className="footer-bottom"><span>© 2026 VEYRO API. A VEYRO project.</span><span><span className="chip-dot green"/> API gateway online · live sources pending</span></div></footer>

    <AnimatePresence>{authOpen && <motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={(e)=>{if(e.target===e.currentTarget)setAuthOpen(false);}}><motion.div className="auth-modal" initial={{opacity:0,y:18,scale:.98}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:12}}><button className="modal-close" onClick={()=>setAuthOpen(false)}><X/></button><Logo/><div className="eyebrow">{authMode==="signup"?"CREATE DEVELOPER ACCOUNT":"WELCOME BACK"}</div><h2>{authMode==="signup"?"Start building with VEYRO.":"Sign in to your console."}</h2><p>One account for your API keys, sandbox and usage.</p><form className="stack-form" onSubmit={authenticate}><label>Email address<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required placeholder="you@example.com"/></label><label>Password<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters"/></label><button className="button button-primary" disabled={authBusy}>{authBusy?<RefreshCw className="spin"/>:null}{authMode==="signup"?"Create account":"Sign in"} <ArrowRight size={16}/></button></form><p className="auth-switch">{authMode==="signup"?"Already have an account?":"New to VEYRO?"} <button className="inline-link" onClick={()=>setAuthMode(authMode==="signup"?"signin":"signup")}>{authMode==="signup"?"Sign in":"Create an account"}</button></p><div className="auth-privacy"><LockKeyhole size={14}/> Credentials are protected by Supabase Auth.</div></motion.div></motion.div>}</AnimatePresence>
    <AnimatePresence>{notice && <motion.div className="toast" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}><CheckCircle2 size={17}/>{notice}<button onClick={()=>setNotice("")}><X size={14}/></button></motion.div>}</AnimatePresence>
  </div>;
}

function Feature({icon,number,title,text}) { return <div className="feature-card"><div className="feature-top"><span>{number} / VEYRO</span><div>{icon}</div></div><h3>{title}</h3><p>{text}</p></div>; }
function Stat({icon,label,value}) { return <div className="stat-card"><div>{icon}</div><span>{label}</span><b>{value}</b></div>; }
function EndpointRow({item}) { return <div className="endpoint-row"><span className="method">{item[0]}</span><code>{item[1]}</code><span>{item[2]}</span></div>; }
function CodeBlock({text,onCopy,copied}) { return <div className="code-block"><button className="copy-code" onClick={()=>onCopy(text,"code")}>{copied==="code"?<Check size={15}/>:<Copy size={15}/>}</button><pre>{text}</pre></div>; }
function Price({name,price,detail,items,action,onClick,featured}) { return <div className={"price-card "+(featured?"price-featured":"")}><div className="doc-kicker">{name.toUpperCase()} PLAN</div><h2>{price}</h2><p>{detail}</p><ul>{items.map((item)=><li key={item}><Check size={15}/>{item}</li>)}</ul><button className={"button "+(featured?"button-primary":"button-ghost")} onClick={onClick}>{action}<ArrowRight size={15}/></button></div>; }

export default App;
