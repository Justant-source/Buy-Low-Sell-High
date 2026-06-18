# ADR 0000: Clean-Room Bootstrap

## Status
Accepted

## Context
The source implementation plan requires a new repository that excludes live trading code, secrets, Redis, and broker connectors.

## Decision
Bootstrap SOXL-Mania as a PostgreSQL-only clean-room project with Python engine and TypeScript dashboard skeletons. Add static verification that fails when prohibited trading or Redis patterns appear in the source tree.

## Consequences
- Phase 0 can be validated without market data or external services.
- Later phases can build on a clear boundary without inheriting Bit-Mania runtime risk.

