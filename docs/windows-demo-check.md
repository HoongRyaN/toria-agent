# Windows demo connection checklist

## Prepare the local project

1. Use a local folder in Windows desktop VS Code. GitHub sign-in does not configure OrcaRouter.
2. Install Node.js 22 or newer. Check `node --version` in a new terminal.
3. Pull the latest repository changes. If you have local edits, preserve them before resolving conflicts; do not use a forced reset. A ZIP download into a separate folder is another option.
4. The `.env` file is intentionally absent from GitHub. In the same folder as `server.mjs`, copy `.env.example` to `.env` **only if `.env` does not already exist**. Fill the key locally. Check that Windows has not named it `.env.txt`. Never send or commit this file.
5. Stop the old TORIA terminal with Ctrl+C and start `node server.mjs` from this folder in a normal Windows terminal. A code update requires a server restart; a saved `.env` change is reread on the next request. Keep the terminal open.
6. Open http://127.0.0.1:4317/ and press Ctrl+F5. If startup reports `EADDRINUSE`, another process owns the port. Identify the old TORIA terminal and stop it; do not terminate unrelated Node processes.

## Run the free connection check

Double-click `diagnose-toria.cmd`, or run `node scripts/doctor.mjs` in a second terminal. Share only `data/connection-check.json` or the printed JSON when requesting help. The tool never prints the key or raw upstream errors and does not make a model inference call.

| Field | Interpretation |
| --- | --- |
| `runtime.nodeSupported` | Must be `true` (Node.js 22+). |
| `files.envExists` | Normally `true`. An environment variable is also supported, so absence alone does not prove missing credentials. |
| `files.envTxtExists` | If `true`, check for an incorrectly named file. |
| `config.keyPresent` | Must be `true`; this does not validate the key. |
| `config.keyHasWhitespace` / `keyIsAscii` | Normally `false` / `true`. Fix accidental pasted spaces or full-width characters. |
| `localServer.recognized` | Must be `true` for the expected status endpoint. |
| `localServer.keyConfigured` | The running server has a key. If it disagrees with `config.keyPresent`, check the folder and startup environment. |
| `localServer.diagnosticUiPresent` | Must be `true` for the API-result UI. |
| `localServer.pageMatchesThisFolder` | A mismatch suggests a different checkout is serving the page. A match only checks HTML, not all backend code; restart after pulling. |
| `orcaNetwork.httpStatus` | `200` confirms the public models endpoint is reachable. Other statuses mean an HTTP response arrived; this unauthenticated test does not assess your key or balance. |
| `orcaNetwork.failureCode` | Inspect transport errors below. |
| `modelCall` | Always `NOT_TESTED`; run the actual UI test next. |

## Verify a real text call and a separate image call

These steps use API credit. Use fictional demo data.

1. Start a new consultation and send `自宅で仕事をしていますが、会社のサイトにアクセスできません。`.
2. Open the developer connection panel. After the request finishes, look for `AIの応答を取得・検証済み`, a returned model, and token metadata. `キー設定済み` alone is not success. Cost metadata can be missing even for a successful call.
3. Answer the eligible questions: working remotely, public websites accessible, work blocked. The model can vary the order.
4. At the VPN question, select `デモ：VPN画面` and explicitly click `画像を確認する`. Selecting the preview alone makes no image call. Confirm that an AI image observation appears; the employee must still confirm the actual display.
5. Check the corresponding requests in the OrcaRouter console. Usage reporting can arrive later. Never interpret unknown cost as zero.
6. Continue through handoff, a simulated ticket, and employee acceptance. These local actions do not need additional model calls.

## Interpret a failed actual model call

| Code | Next step |
| --- | --- |
| `network_denied` | Start from an ordinary Windows terminal. Check device/network policy with its administrator if still blocked. |
| `dns_failed` | Check internet access and the DNS/network path to `api.orcarouter.ai`. |
| `tls_failed` | Check Windows date/time and any organization-managed certificate requirements. Do not disable certificate verification. |
| `timeout` / `request_failed` | Retry once, then compare an approved alternate network. A failed response does not prove no charge occurred. |
| `authentication_failed` | Check the key locally in OrcaRouter and `.env`; do not paste it into a help request. |
| `budget_exceeded` | Check the account credit and key/model budget settings. |
| `provider_forbidden` | Check access restrictions and model availability; a network gateway may also block a request. |
| `rate_limited` | Wait before retrying. |
| `invalid_response` | Connectivity may have succeeded but the returned tool response was unusable. Inspect model settings and retry once. |

If the browser can open a website but Node.js cannot connect, they may use different proxy or certificate settings. Consult the network administrator rather than disabling TLS, VPN requirements, or security software.

## Before the event

Rehearse both text and image calls on the actual laptop. Recheck on the venue network before presenting. Keep an approved alternate network available if possible. Preserve a tested code version, export a synthetic handoff report, and record a short successful demo as backup. Offline fallback demonstrates evidence/ticket workflow only; label it as fallback or recorded footage, not a live AI success.
