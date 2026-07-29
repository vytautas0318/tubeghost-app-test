# Testing the MCP relay locally

## Unit + integration (vitest)

```bash
npm test                       # full suite (117 tests)
npx vitest run api/_lib/__tests__ lib/mcp/__tests__   # just the relay
```

What's covered:

- **Contract** (`lib/mcp/__tests__/contract.test.ts`) — 16-tool registry integrity,
  annotations, async/destructive flags, `device_id` optionality, schema validation,
  and that profile summaries never expose credential fields.
- **Token hashing/rotation** (`device-token.test.ts`) — prefixes, sha256 hashing,
  revoked-device rejection, refresh-column isolation.
- **JWT** (`jwt.test.ts`) — sign/verify round-trip, tampered signature, expiry, and
  the **audience-confusion** rejection (apex `aud` ≠ `/api/mcp` → rejected).
- **Redaction** (`redact.test.ts`) — secret keys stripped, recursion, truncation,
  circular-safe.
- **Executor integration** (`executor.test.ts`, fake Redis) — device resolution
  (0/1/many online), enqueue → simulated agent result → tool returns, plus the
  security cases below.
- **OAuth flow** (`oauth-flow.test.ts`, fake Redis) — PKCE required, code single-use,
  refresh rotation, and reuse-revokes-chain.

### Security tests that must stay green

| Guarantee | Test |
|---|---|
| User A cannot enqueue to user B's device | `executor.test.ts › cross-user isolation` |
| `get_command_status` can't read another user's command | same block |
| Revoked device token → rejected | `device-token.test.ts › rejects a revoked device` |
| Consumed/expired code → 400 | `oauth-flow.test.ts › a consumed code cannot be replayed` |
| Missing PKCE → error | `oauth-flow.test.ts › MISSING PKCE` |
| Replayed refresh token → revokes chain | `oauth-flow.test.ts › REPLAY … revokes the whole chain` |

## Against a live local server

The relay needs real env vars (Supabase + Upstash + JWT secret). Put them in
`.env` (none `VITE_`-prefixed except `VITE_PUBLIC_BASE_URL`):

```
PUBLIC_BASE_URL=http://localhost:3000
VITE_PUBLIC_BASE_URL=http://localhost:3000
SUPABASE_URL=...           SUPABASE_SERVICE_ROLE_KEY=...   SUPABASE_ANON_KEY=...
UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=...
OAUTH_JWT_SECRET=<any long random string>
```

Run the functions with the Vercel CLI (it serves `/api/*` + applies `vercel.json`
rewrites, so `/.well-known/*` resolve):

```bash
npx vercel dev            # http://localhost:3000
```

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector
# Transport: Streamable HTTP
# URL:       http://localhost:3000/api/mcp
```

The Inspector will hit the 401 → discover the OAuth metadata → run the PKCE flow
(you'll sign in via the SPA consent screen at `/oauth/consent`). After auth,
`tools/list` should return the 16 tools. Calling a device tool with **no paired
device** returns a structured `NO_DEVICE` error — expected.

### Public URL (Claude connector / ngrok)

Claude's infra must reach the server over https. Either deploy to a Vercel
preview, or tunnel:

```bash
ngrok http 3000
# set PUBLIC_BASE_URL + VITE_PUBLIC_BASE_URL to the https ngrok URL, restart vercel dev
```

Then add `https://<host>/api/mcp` as a custom connector in Claude. Verify the
well-known routes return **JSON, not HTML** first (see `docs/mcp-server.md`) —
silent HTML there is the #1 cause of a connector showing "Disconnected".

### End-to-end without the desktop app

You don't need the Electron app to exercise the relay — simulate the agent with
curl:

```bash
# 1. In the dashboard (Settings → Claude) generate a pairing code, then:
curl -sX POST $BASE/api/agent/pair -H 'content-type: application/json' \
  -d '{"code":"ABCD1234","name":"laptop","platform":"macOS","appVersion":"1.0.0"}'
# → { deviceId, token, refreshToken }

# 2. Long-poll for commands (issue an MCP tool call from Inspector meanwhile):
curl -sX POST $BASE/api/agent/poll -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"waitMs":25000}'
# → { commands: [{ command_id, tool, args, deadline }] }

# 3. Return a result:
curl -sX POST $BASE/api/agent/result -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"commandId":"<id>","status":"succeeded","result":{"profiles":[],"total":0}}'
```

The Inspector's pending `list_profiles` call then resolves with that result.
