# TubeGhost MCP server + device relay

Lets Claude drive the local TubeGhost desktop app. Anthropic's infra calls the
MCP server; the desktop app connects OUT and long-polls for commands. The MCP
server is a **thin relay** — every tool enqueues a command and waits for the
device to return a result. No TubeGhost business logic is reimplemented here.

## Connector URL

```
https://app.tubeghost.com/api/mcp
```

(Derived from `PUBLIC_BASE_URL`; never hardcoded.) Custom connectors require a
Claude plan that supports them (Pro/Team/Enterprise "custom connectors").

## Architecture

```
Claude  ──Streamable HTTP──►  /api/mcp (stateless Vercel fn)
                                   │  enqueue q:{deviceId}, await res:{commandId}
                                   ▼
                               Upstash Redis  ◄── long-poll ──  Desktop agent
                                                                 (/api/agent/*)
```

- **Auth:** OAuth 2.1 + PKCE + Dynamic Client Registration, backed by the
  existing Supabase login session (see `api/oauth/*`). Access tokens are JWTs
  (1h, `aud=https://app.tubeghost.com/api/mcp`).
- **Transport:** Streamable HTTP, **stateless** — a fresh `McpServer` +
  `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` per request.
  POST only; GET/DELETE return 405 (no sessions to stream/tear down).
- **Command bus:** Redis. `q:{deviceId}` queue, `res:{commandId}` result (120s),
  `claim:{commandId}` (tool timeout), `presence:{deviceId}` (45s).
- **Tools:** registered from `lib/mcp/contract.ts` (single source of truth,
  copy-synced to the desktop repo) through one generic executor
  (`api/_lib/executor.ts`).

## Required environment variables (Vercel project + local .env)

All server-side, none `VITE_`-prefixed:

| Var | Purpose |
|---|---|
| `PUBLIC_BASE_URL` | Canonical origin, no trailing slash. Every absolute URL derives from this. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Relay DB writes (devices, command_log). |
| `SUPABASE_ANON_KEY` | Verify the SPA's Supabase session server-side. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Command bus + OAuth state. |
| `OAUTH_JWT_SECRET` | HS256 signing secret for MCP access tokens. |

## Vercel settings that are NOT in vercel.json

- **Fluid Compute** must be enabled in **Project → Settings → Functions**
  (it is a dashboard toggle, not a `vercel.json` field). Required so
  `/api/mcp` and `/api/agent/poll` can hold requests open. `maxDuration` is
  set to 60 in `vercel.json`; on Vercel Pro with Fluid Compute you may raise it
  to 800.
- **Bot protection / firewall:** if Vercel's Attack Challenge / bot management
  is enabled it may challenge `/api/mcp` (Anthropic's infra, not a browser) and
  break the connector. Add a firewall **bypass rule** for path `/api/mcp` and
  `/api/agent/*` (and the `/.well-known/oauth-*` paths), or disable managed
  challenges for those paths. Symptom: Claude shows "Disconnected" and a curl of
  `/api/mcp` returns an HTML challenge page instead of JSON-RPC.

## Verifying the well-known routes (the #1 failure mode)

The SPA catch-all must NOT swallow `/api/*` or `/.well-known/*`. Confirm each
returns JSON, not HTML:

```bash
curl -s https://app.tubeghost.com/.well-known/oauth-authorization-server | jq .
curl -s https://app.tubeghost.com/.well-known/oauth-protected-resource | jq .
curl -s https://app.tubeghost.com/.well-known/oauth-protected-resource/api/mcp | jq .
# Unauthenticated MCP request → 401 with WWW-Authenticate: Bearer resource_metadata=...
curl -si -X POST https://app.tubeghost.com/api/mcp -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -i www-authenticate
```

Local testing is documented in Phase 6 (`docs/mcp-testing.md`).
