# Testing WireGuard upstream (MVP, no UI yet)

This is the Phase-1 verification path for the WireGuard proxy mode that
lets WebRTC STUN actually succeed (so CreepJS no longer shows "blocked"
for host/stun/foundation candidates).

The UI doesn't expose WG yet — you edit the profile row directly in
Supabase to test.

## 1. Get the sing-box binary

```
npm run download-sing-box
```

Should produce `resources/sing-box/win32-x64/sing-box.exe` (~15 MB).
This also runs automatically on `npm install` (via `postinstall`).

## 2. Get a WireGuard config

Any working `wg-quick` config works. Easiest source: Mullvad
(https://mullvad.net/account/wireguard-config), IVPN, or your own
WireGuard server. The file looks like:

```ini
[Interface]
PrivateKey = AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
Address = 10.66.230.42/32
DNS = 10.64.0.1

[Peer]
PublicKey = BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = de1-wireguard.mullvad.net:51820
```

Save the full text — every line.

## 3. Patch the profile row

In Supabase SQL editor (or psql), update the `profiles` table for the
profile you want to test:

```sql
update public.profiles
set
  proxy_type = 'wireguard',
  proxy_host = 'de1-wireguard.mullvad.net',   -- nominal, for display only
  proxy_port = 51820,                          -- nominal, for display only
  proxy_user = null,
  proxy_pass = null,
  wireguard_config = $$
[Interface]
PrivateKey = ...your private key...
Address = 10.66.230.42/32
DNS = 10.64.0.1

[Peer]
PublicKey = ...peer public key...
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = de1-wireguard.mullvad.net:51820
$$
where id = 'YOUR-PROFILE-UUID';
```

If your `profiles` table doesn't have a `wireguard_config` column yet
(no migration created — this is MVP), add it:

```sql
alter table public.profiles
  add column if not exists wireguard_config text;
```

Then re-run the update above.

## 4. Make sure the renderer threads `wireguard_config` into `LaunchProxy`

The launcher accepts a `wireguard_config` field on `LaunchProxy` (see
`src/main/sessions/session-manager.ts`). If the renderer's profile-to-
launch-payload mapper doesn't include it yet, add it to wherever the
proxy is assembled before `window.electron.ipcRenderer.invoke('profiles:launch', …)`
is called. Grep for `expected_egress_ip:` — the field that's mapped
right before is usually next to it.

## 5. Launch the profile

Open the profile via TubeProxies UI as normal. The launcher will:
1. Detect `proxy_type === 'wireguard'`
2. Spawn `sing-box run -c <tmp>/tubeproxies-singbox-<profileId>.json`
3. Skip the HTTP precheck (no `runProxyTest` for WG)
4. Pass `--proxy-server=http://127.0.0.1:<port>` to chrome.exe
5. chrome.exe routes everything (TCP **and** UDP) through sing-box → WG

## 6. Verify

Visit https://abrahamjuliot.github.io/creepjs/ and scroll to the
**WebRTC** section. You should see:

- **host connection**: a `*.local` mDNS candidate
- **stun connection**: a real srflx candidate, IP = the WG server's
  public IP (e.g. Mullvad de1's exit IP)
- **foundation/ip**: actual values

If WebRTC still shows "blocked":

1. Check the launcher log (`<userData>/sessions/<profileId>/engine.log`)
   for the `# args:` line — confirm `--proxy-server=http://127.0.0.1:<port>`
   is present.
2. From a terminal, try `curl --proxy http://127.0.0.1:<port> https://api.ipify.org`
   — should return the WG server's IP. If this fails, sing-box isn't
   tunneling correctly.
3. Check the sing-box stderr from gost-pool's start error message. The
   most common WG handshake failure is wrong PrivateKey/PublicKey
   (sing-box reports "handshake failed").

## 7. Notes / limitations

- The HTTP precheck (`runProxyTest`) is skipped for WG profiles. The
  expected-egress-IP mismatch check therefore doesn't apply — you'll
  always be on whatever IP the WG server exits from.
- DNS leaks: sing-box does NOT yet forward DNS through the WG tunnel
  in this MVP. Browser DNS still goes via the system resolver. Phase 2
  will add DNS-over-WG.
- One sing-box process per profile. ~30-50 MB RAM each. Scale-tested
  to ~50 concurrent profiles.
- Phase 2 will:
  - Add structured WG form fields in the profile editor
  - Persist `wireguard_config` in a migration
  - Add a WG-aware egress-IP precheck (curl through sing-box before
    spawning chrome)
  - DNS-over-WG routing
