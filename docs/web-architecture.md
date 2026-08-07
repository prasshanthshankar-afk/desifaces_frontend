# desifaces Web Architecture Baseline

## Status

Approved implementation direction for the richer desifaces web application.

## Primary rule

The tested native application remains the functional source of truth. Web must reuse the same backend contracts, Face/Audio/Fusion API modules, pricing/entitlement behavior, creator-flow state, media model, authentication identity, and job lifecycle.

Web may have a substantially different desktop presentation, but it must not fork business behavior.

## Canonical frontend

`desifaces_frontend` remains the canonical frontend repository.

- Expo 55
- React 19
- Expo Router
- React Native / React Native Web
- TanStack React Query

The active route tree is `src/app`.

The legacy root `app/` tree is not the architectural baseline and must not receive new product work. It may be removed only after native and web validation confirms it is unused.

## Platform split

Use Expo platform modules instead of runtime platform conditionals for major presentation differences.

Examples:

- `StudioNavigation.native.tsx`
- `StudioNavigation.web.tsx`
- `FaceStudioScreen.tsx` / `FaceStudioScreen.web.tsx`
- `AudioStudioScreen.tsx` / `AudioStudioScreen.web.tsx`
- `FusionStudioScreen.tsx` / `FusionStudioScreen.web.tsx`
- `tokenStore.ts` / `tokenStore.web.ts`

Native presentation must remain stable while web evolves into a richer desktop workspace.

## Shared functionality

The following stay shared unless a platform API makes an adapter necessary:

- `src/core/api`
- `src/core/config`
- `src/core/flow`
- `src/core/media`
- `src/core/pricing`
- feature API modules under `src/features/*/api`
- pricing hooks and normalization
- backend DTOs and request builders
- job polling/status behavior
- creator-flow handoff state

## Web information architecture

Authenticated web navigation target:

1. Dashboard
2. Face Studio
3. Audio Studio
4. Fusion Studio
5. Library
6. Developers
   - Overview
   - API Keys
   - Usage
   - Logs
7. Plan & Billing
8. Settings

Public developer content will be added under `/developers` without exposing internal microservice contracts directly.

## Developer API principle

External developers should consume a stable public API surface rather than calling internal service routes directly. API-key lifecycle, scopes, usage metering, rate limiting, and public documentation are backend capabilities and should be introduced as a dedicated feature, while the web console consumes them through `src/features/developers`.

## Design system

The existing desifaces brand is the source for web visual identity. Before broad UI expansion, existing duplicate theme definitions should be consolidated into one token model covering:

- brand colors
- semantic colors
- typography
- spacing
- radii
- elevation
- studio accents
- responsive breakpoints

The public static website is a brand/content reference, not the application architecture.

## Guardrails

Do not:

- extend the older standalone Next.js frontend as the primary desifaces product UI;
- duplicate Face/Audio/Fusion workflow logic for web;
- create a second pricing or entitlement implementation;
- rename or reorganize native routes solely for web aesthetics;
- change Apple/Google payment behavior as part of web presentation work;
- expose internal service URLs as the public developer API.

## F0 baseline

The Web Architecture Baseline establishes:

- platform-specific navigation;
- explicit web API-base resolution;
- web token-storage adapter behind the existing auth contract;
- consistent Babel/TypeScript aliases;
- `.web` and `.native` module resolution;
- architecture documentation.

The next implementation milestone is the rich web Dashboard shell, followed by web-specific Face, Audio and Fusion workspace presentations while preserving their existing shared API and pricing modules.
