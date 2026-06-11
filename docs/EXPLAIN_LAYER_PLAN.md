# Parallax Explain Layer Plan

Status: planning only. Do not implement code changes from this document without a separate implementation pass, explicit approval, engine tests, and rendered-screen verification.

Figma / FigJam planning board:
https://www.figma.com/board/71yG13H9iWMcOes6Qjg4pS?utm_source=chatgpt&utm_content=edit_in_figjam&oai_id=v1%2FxzDIWMQUuhdXSbkCwCTVZXSWCXUHM5l9DJU9oZswLK3TFfbkCGKVDW&request_id=77cfe092-44fd-44fc-bc86-d147ad6b450f

## Doctrine Guardrails

This plan is subordinate to `PRINCIPLES.md`.

Parallax remains an advisor-led retirement planning instrument. The program shows the story; the advisor tells it.

The engine remains the only source of financial truth. The Explain Layer may format, label, group, and arrange engine outputs. It must not create UI-side financial math, deterministic projections, expected paths, invented success scores, invented resilience scores, or untraceable terminal values.

## Product Direction

The current app should remain the advisor workbench:

1. Build: Household and Goals
2. Explore: Scenarios
3. Experience: Sequencing and historical playback
4. Explain: Plan Drivers and client story layer

The missing layer is not another dashboard. It is an explanation surface that turns engine output into an advisor-led client narrative.

## Recommended First Build

Build an Advisor Workbench + Story Rail before creating a full separate Client Story Mode.

The Story Rail should sit beside or below the existing scenario / sequencing surfaces and show:

- Outcome snapshot from selected engine output
- Plan Anchors
- Strengths
- Pressure Points
- Toss-Ups
- Suggested historical sequence to review
- Button or control to open Playback / Sequence Theater

## Signature Experience

The signature Parallax moment should be:

Same plan. Same client facts. Same planning choice. Different real market sequence. Different lived experience.

Sequencing should own this experience.

Historical playback examples should include periods such as 1966, 1973, 2000, and 2008, as available in the engine data.

## Sequence Theater Concept

Sequence Theater is a client-safe presentation view for a selected historical path.

It should show:

- Selected sequence year
- Final status
- Terminal balance or depletion age from engine output
- First 10 years of return sequence
- Balance path
- Year-by-year cash-flow ledger
- Advisor note area or talking-point prompt

It must not describe a path as expected, likely, normal, average, or forecasted.

## Meeting Packet Concept

The Meeting Packet is a leave-behind/export view, not the primary app.

It should include:

- Outcome summary
- Plan Drivers
- Historical context labeled as context only / not a forecast
- Selected playback summary
- Year-by-year appendix if advisor chooses

## Build Order

1. Add Story Rail planning mock to the current app model.
2. Define exact engine output fields needed for Plan Drivers and Playback.
3. Mock Sequence Theater as a presentation surface.
4. Only after approval, implement Story Rail in the live app.
5. Then implement Sequence Theater.
6. Then implement Meeting Packet/export.

## Explicit Non-Goals

Do not build:

- A generic report generator
- A forecast page
- An expected-path view
- A new advice narrator
- A separate planning engine
- UI-side tax/return/withdrawal math
- A decorative redesign detached from engine truth

## Acceptance Criteria For Any Later Implementation

Any future implementation must pass:

- `npm test`
- `node scripts/verify.mjs`
- manual inspection of rendered screens
- doctrine review against `PRINCIPLES.md`
- traceability review showing every financial number comes from engine output or approved input summaries
