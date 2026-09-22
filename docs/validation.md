# TORIA validation record — 2026-09-22 JST

## Automated regression checks

Command: `node --test`. Windows, Node.js v24.19.0. 36 tests passed, zero failed or skipped. Upstream model responses in these tests are mocked: they verify application behavior, not model accuracy. No API credit is used.

The added `test/scenarios.test.mjs` covers image/report disagreement; matching observations; wrong-screen and unreadable-image handling; image-service outages; the remote-work-to-access-refusal handoff; and truncated model output. Existing tests cover approved check selection, human escalation, costs, origin checks, secret suppression, retries, persisted tickets and resolution/reopening.

## Live checks with fictional inputs

Run all six fixtures: `node scripts/evaluate.mjs --live --run=my-check`.
Run one: `node scripts/evaluate.mjs --live --case=urgent-work-context --run=my-urgent-check`.
Without `--live`, the script prints help without calling the API. Real runs consume credit. Use a new `--run` name to preserve previous results. Only the built-in synthetic files and fixed fictional messages are sent. Keys are not written to the results.

| File | Conditions | Result |
| --- | --- | --- |
| `evaluation-results.json` | Original priority wording, 250 text output tokens; four image fixtures and two text fixtures | 5/6 matched expectations. Urgent case fell back to `public_web`; no model finish diagnostic existed yet. |
| `evaluation-followup.json` | Same urgent input, 250 tokens, added diagnostics | Tool response invalid; `finishReason: length`. Cost retained; basic procedure used. |
| `evaluation-512-token-followup.json` | Same urgent input, 512 tokens | Valid tool response, but chose `public_web` rather than expected `impact`. No fallback. |
| `evaluation-priority-followup.json` | Same urgent input, 512 tokens, explicit urgency-before-connectivity priority | Valid AI tool call selecting `impact`. One successful follow-up only. |

All runs are dated in UTC in the JSON; they occurred on 2026-09-22 JST. Total: 9 calls, known preliminary cost USD 0.003964, zero calls with missing cost in this sample. These are response-time costs, not reconciled receipts. Earlier development calls are not included.

The four image fixtures use the same unchanged vision implementation: connected VPN; login page supplied for a VPN check; blank image; and login page containing an instruction to claim VPN connectivity. All four matched their expected classifications in this one run. This does not establish robustness against prompt injection, realistic screenshot accuracy, or performance across companies.

The final text prompt was retested only on the urgent input. Do not combine results from different implementation versions into a claimed final-version 6/6 pass rate. The unit tests and live fixture checks measure different things. No user study, measured Helpdesk time saving, production security audit, or statistical benchmark has been completed.

## Added product behavior

`triage.mjs` now stores structured screenshot observations. If the latest readable matching screenshot and a definite employee button answer differ, both remain in the evidence history. The application adds an explicit discrepancy and prepares a handoff without claiming either source is correct. An older screenshot, a changed display, and AI misreading remain possible explanations. Wrong-screen, unreadable or unknown observations do not trigger a false discrepancy.

## Before a public demo

Use the new source on the presentation laptop and restart the local server. Try the normal wrong-screen path and the disagreement path once with fictional inputs. The Windows environment has been tested here; the Mac presentation environment still needs an actual rehearsal. API availability and responses can vary. Authentication, tenant separation, external ticket delivery and endpoint repairs remain outside this prototype.

## Language consistency update

The legacy chat endpoint's error messages and reply-language instruction now use Japanese. Retrieval tags, explicit human-handoff phrases and test examples use Japanese or English. All 36 automated tests passed again after this update, including Japanese/English retrieval and human handoff without a model call. Tracked text and the four demo/evaluation images were reviewed for language consistency.

The recorded live evaluations above and the article's pinned source links describe the earlier implementation. Their inputs, results and hashes are preserved as measured; they are not new measurements of the language update. No paid model calls were made for this update. The retrieved tag vocabulary has changed, so new live results may differ.

## Connection recovery and diagnostics — 2026-09-22 JST

An app launched from a restricted execution environment could load its local page and key while outbound Node.js fetch requests failed with EACCES. An unauthenticated request to the OrcaRouter models endpoint failed in that environment and returned HTTP 200 in the unrestricted local environment. Restarting the local-only app from the unrestricted environment restored the observed text API call. This was a launch-environment issue, not an employee's troubleshooting mistake.

`provider-diagnostics.mjs` now maps failures to fixed diagnostic codes and Japanese guidance, with separate handling for network denial, authentication, budget, rate limiting, timeouts, DNS/TLS failures and invalid responses. Both triage and vision preserve unknown costs and avoid exposing raw errors. The page distinguishes key presence from a validated API response.

All 40 automated tests passed, including four new tests for denied networking, image transport failures, authentication/budget separation and secret-safe diagnostics. [The connection recovery record](connection-recovery-check.json) contains two additional synthetic live checks: the running HTTP server selected `location` through the text model, and the vision module correctly classified the built-in VPN image in the unrestricted environment. Text: 6,142 ms, USD 0.000090. Image: 2,294 ms, USD 0.000928. Combined preliminary response-time cost: USD 0.001018. These two checks are separate from the nine earlier evaluations and are not a new full benchmark or billing reconciliation.
