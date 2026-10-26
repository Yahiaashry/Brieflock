# docs/ — Frozen v2.0 Reference (do not maintain)

These documents are the v2.0 design suite, frozen on 2026-10-18. Their normative content was consolidated into [`../CONTRACT.md`](../CONTRACT.md).

**Rule:** where a file here disagrees with `CONTRACT.md`, `CONTRACT.md` wins. Do not edit or regenerate these files — if something needs to change, change `CONTRACT.md`.

## Why keep them

| File | Useful for |
|---|---|
| `PRD.md` | Requirement IDs, personas, personas-level acceptance criteria |
| `ARCHITECTURE.md` | C4 flows, sequence diagrams (upload/view/transfer/denial) |
| `DATABASE_SCHEMA.md` | Reference DDL, RLS policy matrix, function/trigger bodies |
| `API_SPEC.md` | Request/response shapes and exact field rules |
| `FRONTEND_ARCH.md` | Viewer sandbox details, client rules, component conventions |
| `BACKEND_ARCH.md` | Module map and backend test hooks |
| `SECURITY.md` | STRIDE model, threat catalog, incident response playbooks |
| `TESTING_STRATEGY.md` | Test-case inventories (RLS probes R-1..R-8, matrix, tamper tests) |
| `UI_UX_DESIGN.md` | Screen specs, watermark spec, copy rules |
| `DEPLOYMENT.md` | CI/CD recipes, security headers config, backup/restore runbooks |
| `TECH_STACK.md` | Stack rationale and comparisons (note: data-fetching contradiction resolved in CONTRACT §0 #11) |
| `ROADMAP.md` | v2 sprint plan (retired — see CONTRACT §20 for the solo sequence) |
| `DECISIONS.md` / `DOMAIN_MODEL.md` | The original locked contract; fully superseded by `CONTRACT.md` |
| `PROJECT_BRIEF.md` | Original one-page pitch |

## Known contradictions

All contradictions found during consolidation (uploads, delivery, hash chain, cron jobs, retention, level raising, archived cases, layout, env vars, data fetching, probe handling, L3 denial code) are listed and resolved in `CONTRACT.md` §0 — corrections 1–13. Where these files show the old behavior, the correction is authoritative.
