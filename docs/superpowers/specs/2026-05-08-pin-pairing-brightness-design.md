# PIN Pairing For Brightness Control

## Problem

The dashboard brightness slider calls the local HTTP API correctly, and the WebOS client uses the monitor-specific `ssap://config/setConfigs` brightness path. A read-only scan of `192.168.1.17` showed that the monitor exposes `config`, `settings`, and `externalpq`, but returns `401 insufficient permissions` for brightness-adjacent read APIs. This points to insufficient pairing trust rather than a missing brightness route.

The current dashboard PIN pairing form asks for the PIN before the monitor has been asked to display one. The intended flow is reversed: start PIN pairing first, let the monitor display a PIN, then submit that PIN to the pending pairing request.

## Goals

- Make dashboard PIN pairing a two-step flow.
- Preserve current single-step PROMPT pairing behavior.
- Re-pair `192.168.1.17` with PIN trust, then verify whether `config/getConfigs` and brightness control work.
- Keep brightness implementation on `config/getConfigs` and `config/setConfigs` unless PIN pairing proves the service still rejects access.

## Non-Goals

- Do not add OSD button-emulation brightness fallback yet.
- Do not change credential storage format.
- Do not broaden monitor API probing beyond the existing read-only scanner during the pairing fix.

## Backend Design

Add a pending PIN pairing coordinator in the HTTP/device layer. PIN pairing will be represented as an in-memory pending session keyed by host.

The backend will expose two PIN-specific steps:

- `POST /api/devices/:host/pair/pin/start`: open the WebSocket registration flow with `pairingType: "PIN"`, send the initial register request, and wait until the monitor requests/provides the PIN prompt state. Return `{ pending: true, host }` so the UI asks the user for the PIN shown on the monitor.
- `POST /api/devices/:host/pair/pin/submit`: send `ssap://pairing/setPin` with the user-entered PIN to the pending WebSocket flow, wait for the client key, save credentials, connect, update the device pool, and return `{ paired: true, host }`.

The pending session must have a timeout and cleanup path so abandoned pairing attempts do not leave sockets open. Starting a new PIN session for the same host should replace and clean up the old one.

PROMPT pairing should continue using the current one-shot `pair()` path.

## Library Design

Refactor the WebOS pairing implementation just enough to support both flows:

- Keep `pair({ pairingType: "PROMPT" })` as a resolved-on-client-key helper.
- Keep CLI compatibility for `pair({ pairingType: "PIN", pin })` by internally starting PIN pairing and immediately submitting the supplied PIN when the monitor reaches the PIN prompt state.
- Export a `beginPinPairing()` primitive from the WebOS module so the HTTP layer can start the flow before it has the PIN.

`beginPinPairing()` returns an object with `submitPin(pin)` and `cancel()` methods. It is exported for in-repo HTTP use, but it should not be added to the documented package public API unless an external consumer needs it.

## Frontend Design

Update `PairModal` so PIN mode has two states:

- Host entry state: user enters host and starts PIN pairing.
- PIN entry state: UI tells the user to read the code from the monitor and enter it.

The current countdown remains useful, but it should apply to the pending PIN session. Errors should be surfaced through existing toasts.

PROMPT mode remains unchanged: user enters host, submits, clicks Allow on the monitor.

## Error Handling

- If no PIN session exists on submit, return a clear error telling the UI to restart pairing.
- If the monitor closes the socket, return a pairing failure and clear the pending session.
- If pairing times out, clean up the socket and pending session.
- If credentials already exist, keep existing behavior: require unpairing/forgetting before re-pairing.
- If PIN pairing succeeds but brightness APIs still return 401, report that brightness is unavailable even with PIN trust and consider OSD fallback separately.

## Verification

- Add unit tests for deferred PIN pairing behavior with the mocked WebSocket.
- Add HTTP route tests for starting PIN pairing, submitting PIN, and preserving PROMPT pairing.
- Run `bun test` and `bunx tsc --noEmit`.
- Re-pair `192.168.1.17` using the dashboard PIN flow.
- Run `bun run scripts/scan-apis.ts 192.168.1.17` after re-pairing.
- Test the brightness slider again.
