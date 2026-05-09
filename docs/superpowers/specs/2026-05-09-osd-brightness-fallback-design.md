# OSD Brightness Fallback Design

## Problem

The dashboard brightness slider calls the correct local API path, and direct probing reproduced the same device-level failure as the UI: `ssap://config/setConfigs` with `{ "com.palm.brightness": 50 }` returns `404 no such service or method` on `192.168.1.17`.

After successful PIN pairing, read-side brightness-adjacent APIs still return permission errors:

- `config/getConfigs`: `401 insufficient permissions`
- `config/getConfigs` for `com.palm.brightness`: `401 insufficient permissions`
- `settings/getSystemSettings`: `401 insufficient permissions`
- `externalpq/getExternalPqData`: `401 insufficient permissions`

The monitor does expose `ssap://com.webos.service.networkinput/getPointerInputSocket`, which returns a pointer input socket. That makes remote-button OSD control the viable fallback for this monitor model.

## Goals

- Keep the normal brightness slider for devices where direct brightness APIs work.
- Detect known unsupported brightness failures and reveal an OSD remote fallback in the Display tab.
- Add a typed backend remote-button API instead of exposing pointer socket details to the browser.
- Provide a compact OSD remote pad with `Settings/Menu` (`MENU` command), arrows, `Enter`, `Back`, and `Exit`.
- Disable the direct brightness `Set` button once this session has detected unsupported brightness APIs.

## Non-Goals

- Do not automate slider values into fixed OSD key sequences.
- Do not assume a model-specific OSD menu path.
- Do not persist unsupported-brightness state yet.
- Do not add full remote-control support beyond the small button set needed for OSD navigation.

## Backend Design

Add WebOS client support for sending one remote button through the pointer input socket:

1. Call `ssap://com.webos.service.networkinput/getPointerInputSocket`.
2. Open the returned `socketPath` as a WebSocket with the same TLS compatibility options used by the main WebOS socket.
3. Send one validated button command using the WebOS pointer input protocol.
4. Close the pointer socket after the command is sent.

Expose this through a typed client method, for example `sendRemoteButton(button)`, where `button` is restricted to the supported OSD button names.

Add an HTTP route such as `POST /api/devices/:host/remote/button` with body `{ "button": "UP" }`. The route validates the button name, gets the paired client from `devicePool`, calls the typed client method, and returns `{ button }` on success.

Known allowed button names for the initial fallback:

- `UP`
- `DOWN`
- `LEFT`
- `RIGHT`
- `ENTER`
- `BACK`
- `MENU`
- `EXIT`

## Frontend Design

`DisplayTab` keeps the brightness slider as the primary control. It tracks whether brightness is unsupported in the current session. Unsupported state is set when the brightness query or mutation fails with a known message containing either `401 insufficient permissions` or `404 no such service or method`.

When unsupported state is active:

- The direct brightness `Set` button is disabled.
- The tab shows an inline fallback card below the slider.
- The card explains that this monitor blocks direct brightness APIs and offers OSD controls instead.
- The card shows a compact remote pad: `Settings/Menu`, directional arrows, `Enter`, `Back`, and `Exit`.
- Each button sends one remote-button API call and reports failures through the existing toast system.

The fallback card is not shown for devices where direct brightness APIs are still working.

## Error Handling

- Invalid remote button names return `400`.
- Unpaired devices follow existing `Device not paired` behavior.
- Pointer socket lookup or send failures return a clear error message through the existing HTTP error shape.
- Brightness unsupported detection is based on known WebOS error text only; unrelated transient failures should still appear as normal errors without permanently disabling the direct button.

## Verification

- Add WebOS client tests for pointer socket lookup and button command sending.
- Add HTTP route tests for valid button, invalid button, and unpaired-device handling.
- Add hook/component-level coverage where practical for the remote button API or fallback state.
- Run `bun test` and `bunx tsc --noEmit`.
- Run `bun run build` so `public/client.js` includes the new Display tab UI.
- Live verify on `192.168.1.17`: brightness direct API failure reveals the fallback card, `Settings/Menu` sends `MENU` and opens the OSD, arrow/enter/back/exit buttons navigate the OSD.
