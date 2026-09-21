# TORIA / トリア

TORIA is a demo internal IT helpdesk agent built for AI HACK 2026, using OrcaRouter for adaptive troubleshooting and evidence-based ticket handoff with fictional company data.

## Current milestone: adaptive checks, screenshot observations and evidence handoff

Implemented: Japanese triage page, five fictional company IT articles with source/version display, keyword-and-check-based retrieval, OrcaRouter tool calling to select the next approved check, explicit employee response buttons, evidence timeline, copy/download handoff report, employee-reported resolution confirmation and reopening, and per-case usage metadata. Chinese descriptions can be submitted; questions and options are currently Japanese.

Screenshot checks are available for the VPN display and inaccessible site screen. A separate vision call classifies the image through a constrained tool. It records an **AI image observation**, keeps the check unanswered, and asks the employee to confirm the actual display using the existing buttons. A login screen supplied for a VPN check produces guidance to find the VPN application. Images cannot prove live device state, the identity of the company-approved application, or successful recovery.

Not implemented yet: device telemetry, endpoint actions, persistent ticket creation, external escalation, tenant/user authentication, or a production knowledge connector. This is not a general IT repair agent. The supported scenario is an inaccessible company website.

## How the initial diagnosis works

1. The employee describes the issue. The application retrieves fictional company instructions from `knowledge/company-it.json` using keywords and the currently eligible check sources (no vector database).
2. The model receives the issue, employee-reported answers, retrieved passages, and only allowed check IDs. It calls `select_next_check`.
3. The server validates the chosen ID, then displays the corresponding approved question and response buttons. The model cannot fabricate evidence, emit arbitrary repair commands, or execute unlisted tools.
4. Button choices become employee-reported observations or explicit incomplete/unknown checks. A submitted note remains an unverified employee statement; it does not automatically complete a check.
5. Employee handoff requests and safety/stop rules can end triage immediately. The report is prepared locally, explicitly **not sent** to a real helpdesk.
6. The employee can confirm that the original task works, or reopen the same case when it does not. This is a self-report, not independent device verification.

The model chooses among server-eligible checks; mandatory stop rules and the actual check wording are deterministic. If the model is unavailable or returns an invalid tool choice, the app visibly falls back to the basic approved procedure and keeps evidence. This fallback is not claimed as AI selection. One model call is attempted per planned step, with a 25-second timeout and a 250-token output limit. Human handoff and resolution confirmation do not need a model call. Cost-free local tests cover these behaviors; live integration is tested separately.

## Try these paths

- Start with `会社のサイトが開きません。` and report that public websites also fail: the report recommends the demo network support group and keeps the root cause unknown.
- Report that you cannot complete two checks: those checks remain incomplete and the app prepares a handoff instead of repeating them.
- Click `担当者に引き継ぐ` at any time during triage: prepare an unsent report.
- Click `直ったか確認する`, confirm the original task works, then reopen and report it still fails: the same case retains the earlier evidence.

## Run locally

For an image demo, choose the remote-work example and answer the location/public-website questions. At the VPN question, choose `デモ：ログイン画面`, review the preview, then click `画像を確認する`. The wrong-screen observation should leave the VPN check unanswered. Try `デモ：VPN画面` next. Question order is chosen by the model and can vary.

Image input supports inline PNG/JPEG up to 2 MB, with type/signature and size checks. Preview selection alone does not send the image to a model; submission sends it via OrcaRouter to the configured vision provider. Only canonical observations and a SHA-256 image fingerprint remain in the case, not image bytes or filenames. Upstream retention is separate. The default vision model is `google/gemini-2.5-flash`; override it with `ORCAROUTER_VISION_MODEL` if needed. Each image call has a 30-second timeout and 350-token output cap. There are at most six image attempts per case; duplicate successful image/check pairs are rejected. Failed image calls do not add observations, and unknown cost remains unknown.

Requires Node.js 22 or newer. No package installation is needed.

1. Clone this repository and open its folder.
2. Copy `.env.example` to `.env`.
3. Fill in `ORCAROUTER_API_KEY` in `.env` with your own OrcaRouter key. Keep `ORCAROUTER_MODEL=orcarouter/auto` for the first connection test.
4. Run `node server.mjs` (or double-click `start-toria.cmd` on Windows when Node.js is installed on PATH).
5. Open http://127.0.0.1:4317 and send a fictional test message.

The local `.env` file is reread on each request: saving it does not require restarting TORIA. The key is used only by the server when calling https://api.orcarouter.ai/v1/chat/completions. It is never sent to the browser. Key presence is not proof of a successful connection; a successful model response confirms that.

## Development and verification

Run `node --test`. Tests use a fake upstream response and spend no API credit. A live call must be tested separately using your own key.

Frontend: plain HTML, CSS and JavaScript in `public/`. Backend: Node.js built-in HTTP server in `server.mjs`; triage logic in `triage.mjs`. Case records are held in server memory, not on disk. They are lost on server restart and expire after one hour without updates. A session identifier in browser sessionStorage lets a refresh restore the current case while the server still has it. Starting a new consultation switches the browser to a new case; it does not immediately erase the previous case from server memory. Exported reports and upstream retention are separate.

This is a local development demo, bound to 127.0.0.1. It has no user authentication or tenant isolation and must not be exposed as a production/public server. Use fictional data only. `.env` is ignored by Git; commit only the empty `.env.example`. Never commit credentials or real employee data.

The earlier `/api/chat` connection endpoint is retained for regression tests; the UI now uses `/api/triage`. A failed/timed-out response does not prove that no charge occurred. Missing cost means unknown, not free. Known per-case cost is shown separately from unknown call costs. Inline cost is preliminary; settled costs must be checked against OrcaRouter receipts. Model-call metadata and sources are inspectable, but real benchmark claims have not been established.

## Roadmap

- Stronger image evaluation against varied and ambiguous screenshots.
- Persistent test tickets with duplicate prevention and reviewable handoff.
- Better language support and more approved checks.
- Measured quality, reliability, safety and cost comparison.

## References

- [OrcaRouter Quickstart](https://docs.orcarouter.ai/getting-started/quickstart)
- [Response headers](https://docs.orcarouter.ai/routing/response-headers)
- [Per-request cost](https://docs.orcarouter.ai/operations/per-request-cost)
- [Vision inputs](https://docs.orcarouter.ai/advanced/vision)
