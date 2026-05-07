# monitor-kvm

- **Runtime**: Bun + TypeScript. Use `bun install` and `bunx tsc --noEmit` for type-checking. Run tests with `bun test`.
- **Source layout**:
  - `src/modules/webos/` — WebOS TV/Monitor client library
  - `src/modules/http/` — Hono HTTP server with React SSR and API routes
  - `src/index.ts` — server entrypoint; `src/scan-apis.ts` — SSAP endpoint probe
  - `scripts/` — CLI utilities
- **Scripts**:
  - `bun dev` — start server with hot reload (`--hot`)
  - `bun start` — start server
  - `bun run scripts/test-monitor.ts <host> [--pin]` — test connection, input, volume, brightness
  - `bun run src/scan-apis.ts <host>` — probe all known SSAP endpoints (read-only)
- **HTTP server**: Hono (`src/modules/http/`) with React SSR at `/` and `/api` routes.
  - **Env vars**: `API_KEY` (required for `/api` access), `PORT` (default 3000). Copy `.env.example` to `.env`.
  - **Middleware**: `x-api-key` header validated against `API_KEY` env var on all `/api/*` routes.
  - **Routes**: `GET /` → React SSR (hello world), `GET /api` → `{ status: "ok" }` (protected).
- **Public library API** (`src/modules/webos/index.ts`): `pair()`, `connect()`, `forgetCredentials()`, plus the `WebOSClient` handle returned by `connect()`. Import via `import { ... } from "monitor-kvm/webos"`.
- **Dependencies**: `hono`, `@hono/react-renderer`, `react`, `react-dom`, `ws`. Dev: `@types/bun`, `@types/react`, `@types/react-dom`, `@types/ws`, `typescript`.
- **Credential storage**: JSON file defaulting to `./.monitor-kvm/credentials.json` (relative to `process.cwd()`). Override via `credentialsPath` option or `MONITOR_KVM_CREDENTIALS` env var. Supports multiple hosts. **Credentials directory is git-ignored.**
- **TLS**: Bun's native `ws` requires TLS options nested under `tls` key (`{ tls: { rejectUnauthorized: false } }`). Older WebOS devices may need `minVersion: "TLSv1"`.
- **Registration protocol**: Uses `client-key` (kebab-case) matching the TV's response convention. Includes a `manifest` with `permissions` for API access. `pairingType: "PROMPT"` is only sent on first pair; reconnects send only `client-key` to skip the prompt.
- **Pairing flow**:
  - **PROMPT** (default): `pair({ host })` opens a temporary WebSocket, sends `register` with `forcePairing: false, pairingType: "PROMPT"`, prompts user to click "Allow", stores `client-key`. Lower trust — no `config`/`settings` access.
  - **PIN** (higher trust): `pair({ host, pairingType: "PIN", pin: <code or callback> })` prompts TV to display a PIN code. Client sends `ssap://pairing/setPin` with the code. Grants full permissions including `config`/`settings`/`externalpq`.
  - `connect({ host })` loads stored key, sends `register` with `client-key` + manifest, establishes persistent connection without re-prompting.
- **Manifest permissions** (`src/modules/webos/protocol.ts` `DEFAULT_PERMISSIONS`): 23 permissions covering audio, display, power, input, apps, notifications, settings. Missing permissions cause 401 errors. PIN pairing may be required for settings-adjacent permissions.
- **Connection behavior**: Persistent WebSocket with lazy connect, auto-reconnect up to 3 retries, and explicit `disconnect()`. Uses `wss://<host>:3001`.
- **Monitor vs TV API differences**:
  | Feature | TV URI | Monitor URI |
  |---|---|---|
  | Picture/brightness | `com.webos.settingsservice/*` (404 on monitors) | `config/getConfigs` (requires PIN trust) |
  | Picture quality | `settingsservice` | `externalpq/getExternalPqData` |
  | Current input | `tv/getCurrentExternalInput` (404 on monitors) | `applicationManager/getForegroundAppInfo` |
  | Switch input | `tv/switchInput` | `system.launcher/launch` with app ID (more reliable) |
  | Settings | `settings/getSystemSettings` | `config/getConfigs` or `settings/getSystemSettings` (both may 401) |
  - Input switching maps app IDs (`com.webos.app.hdmi1` → `HDMI_1`, `com.webos.app.dp1` → `DISPLAYPORT_1`, etc.).
  - On locked monitor models, `config`/`settings`/`externalpq` return 401 even with manifest. PIN pairing may resolve this. Fallback: button emulation via `com.webos.service.networkinput/getPointerInputSocket`.
- **Input validation**: `setInput()` lazily fetches `modelName` via `getSystemInfo()` on first use, then validates against `src/modules/webos/models.ts`. Unknown models warn and skip validation.
- **Typed methods**: `setInput`, `getInput`, `setBrightness`, `getBrightness`, `setVolume`, `getVolume`, `mute`, `unmute`, `powerOff`, `turnOffScreen`, `turnOnScreen`, `getSystemInfo`, `getServiceList`, `launchApp`. Plus generic `call(uri, payload)` for any WebOS API.
- **Protocol quirks**: `parseMessage` accepts both string and numeric `id` fields. Pairing handler accepts both `"registered"` and `"response"` types, and both `clientKey` (camelCase) and `"client-key"` (kebab-case) key names. `getVolume` handles both `volume` and `volumeStatus.volume` wrappers.
