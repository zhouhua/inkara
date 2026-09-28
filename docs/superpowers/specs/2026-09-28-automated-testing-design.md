# 墨语自动化测试金字塔 — Design

**Date:** 2026-09-28  
**Status:** Approved for implementation

## Goal

Introduce a full testing pyramid for inkara (unit + API integration + Playwright E2E) with an independent CI workflow that reports failures without blocking Cloudflare deploy.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | Complete pyramid (B) |
| CI gate | Non-blocking (C): `ci.yml` alerts only; deploy unchanged |
| Package manager | npm (`package-lock.json`) |
| Unit / API runner | Vitest |
| E2E | Playwright |
| Coverage threshold | None in CI |
| Canvas / pen ink | Manual only |

## Architecture

- **Unit:** `src/lib/**/*.test.ts` — pure logic (BYOK, errors, schemas, LLM credentials, recall, quota helpers, dates, dock hints).
- **API:** `src/app/api/**/*.test.ts` — call route `POST` handlers with `vi.mock("ai")`.
- **E2E:** `e2e/*.spec.ts` — stub `/api/ask`, `/api/probe`, `/api/recall-rank` via `page.route`.
- **CI:** `.github/workflows/ci.yml` on PR and push; does not `needs` deploy.

## Out of scope

- Forced coverage gates
- Cloudflare Worker runtime tests
- Real LLM / embedding / IndexedDB end-to-end
- Component RTL suite for every panel

## Success criteria

- `npm run test` and `npm run test:e2e` pass locally
- CI job exists and runs lint + unit + e2e
- Deploy workflow remains independent
