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
