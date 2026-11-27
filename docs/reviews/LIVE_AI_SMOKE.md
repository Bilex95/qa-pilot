# Live AI smoke results (REQ-042, D-087)

Date: 27 Nov 2026. Free tiers only. No key appears in this file or in the raw outputs.

## How it was run
* Script: `e2e/scripts/smoke-live-ai.mjs`. It signs in as a seeded QA Engineer, calls the six AI features once (Bug Writer, Explain this log, Duplicate check, Triage, Test Case Generator, Release Summary) and prints status, time, tokens, cost and who answered each call. The duplicate check runs locally by design (D-013), so a run has 5 model calls.
* The backend was recreated per model with a temporary compose override that set `AI_PROVIDER` and the model. `.env` was not read or edited. For the single provider measures no fallback was configured (and no retry existed yet, so a 429 or 503 counted as a miss).
* Three runs of five model calls per model unless noted. Raw outputs: `.gate/smoke-*.txt` (local, not committed).

## Models measured
| Provider and model | Pass | Median per call | Slowest | Failure reasons |
|---|---|---|---|---|
| Gemini `gemini-3.5-flash-lite` (chosen primary) | 15 of 15 | about 1.6 s (run medians 1.8, 1.3, 1.6 s) | 2.2 s | none |
| Gemini `gemini-3.1-flash-lite` | 15 of 15 | about 1.7 s (2.4, 1.7, 1.8 s) | 22.2 s (one outlier) | none |
| Gemini `gemini-2.5-flash`, `gemini-2.5-flash-lite` | 0 | n/a | n/a | HTTP 404, no longer available to new users (retired) |
| Gemini `gemini-3.8-flash` | 0 | n/a | hang past 90 s | HTTP 503 on every retry |
| Gemini `gemini-3.7-flash` | 0 | n/a | n/a | HTTP 503 |
| Gemini `gemini-3.6-flash` | answered | n/a | 59 s for a trivial request | HTTP 200 but thinking makes it far too slow |
| Gemini `gemini-3.5-flash` | 0 | n/a | 40 s | no usable answer within a small budget |
| Groq `openai/gpt-oss-20b` (chosen Groq and fallback default) | 14 of 15 | about 1.7 s (1.7, 2.3, 1.7 s) | 4.5 s | one http_400 json_validate_failed |
| Groq `qwen/qwen3.8-27b`, spaced runs | 12 of 15 | about 1.7 s (1.7, 1.5, 1.9 s) | 10.1 s | every miss an http_429 |
| Groq `qwen/qwen3.8-27b`, back to back burst | 2 to 3 of 5 per run | about 1.1 to 1.9 s | 5.6 s | http_429 after the minute budget is used |
| Groq `openai/gpt-oss-120b` | not adopted | n/a | n/a | http_400 json_validate_failed in a tiny JSON probe |

## Chain tests (live)
* Primary Gemini with the retired `gemini-2.5-flash`, fallback Groq `gpt-oss-20b`: all five model features answered by `openai_compatible` with `fallback_reason` `http_404`. The admin warning was logged once; the key is not in the log.
* Primary Groq `qwen/qwen3.8-27b`, fallback `gemini-3.5-flash-lite`, three spaced runs: 15 of 15. One call recovered on its own retry (attempts 2); one fell back to Gemini with `http_429` (attempts 3). The chain turns the Groq rate limit misses into passes.

## Groq free tier limits
8,000 tokens per minute and 1,000 requests per day for both Groq models. Groq counts the requested `max_tokens` against the minute budget, which is why a burst of calls ends in 429.

## OpenRouter
Documented only, not tested (no key). Free model `google/gemma-4-31b-it:free` (262k context, JSON `response_format` supported, listed live on 27 Nov 2026). Its free list changes often; the owner verifies it before use.

## Not covered
Anthropic and OpenAI were not run. OpenRouter was not run. No cost data: the free tiers have no price, so the cost column is `n/a`. Results are from one day and one network; free tier speed and limits move.
