# desifaces-v3 Frontend/Mobile Baseline

## Purpose
This file records the immutable bootstrap point for the desifaces-v3 frontend/mobile development line.

## Inherited V2 Source
- Repository: `prasshanthshankar-afk/desifaces_frontend`
- V3 branch: `desifaces-v3`
- V2 source branch: `environment/development-testflight-20260811`
- V2 source commit: `e1c710c7e42af423ae9bf6256ffe2fa04a871b4c`
- Source commit message: `Keep Face jobs running across polling failures`
- Bootstrap date: 2026-08-17

The V3 branch started as an as-is copy of this exact actively used V2 development/TestFlight line. V2 production/release branches must remain unaffected by V3 development.

## Architecture Control
`#v3-core` is the source of truth for desifaces-v3 Architecture & Integration Control. Frontend/mobile changes that affect shared domain concepts, APIs, identity/auth, pricing/credits, media lifecycle, orchestration, or cross-stream behavior must conform to decisions frozen through `#v3-core`.

## EIP Rule
Before changing, reusing, or replacing V2 behavior, use EIP continuously to obtain current implementation evidence from V2: screens, state/data flows, API clients, auth/session behavior, pricing/entitlements, media handling, configuration, tests, and runtime/deployment assumptions.

## Evolution Rule
Inherited V2 UI/API behavior is a migration starting point, not automatically a V3 contract. Material shared changes follow:

Requirement -> EIP V2 evidence -> V3 architecture decision -> contract impact -> compatibility/migration strategy -> implementation -> certification -> freeze in `#v3-core`.
