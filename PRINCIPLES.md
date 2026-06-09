# Parallax Principles

Date: 2026-06-09

## What The Tool Is

Parallax models retirement planning interactions. The value is watching one
lever move another and seeing the client decision clearly.

The program shows the story; the advisor tells it. If the picture is right, the
sentence is redundant.

Parallax is neutral. It has no opinion about whether a client should spend more
or cut back. It runs the math and reports what is there.

## Product Tests

Every feature must pass at least one of these tests:

1. Does it show a real planning interaction?
2. Does it expose engine truth more clearly?
3. Does it help the advisor explain a client decision?

If no, delete or archive it.

## Build Rules

- Make the requirement less dumb: question it and trace back to fundamentals.
- Subtract before adding: deleting is the default.
- Simplify: fewer steps, fewer abstractions, fewer rules.
- The engine is the one source of truth.
- Screens only show or adjust engine inputs and outputs.
- Do not invent UI-side math.
- Do not touch engine math without explicit agreement and tests.
- When two builds compete, pick the one most faithful to the truth.
- Do not let the product become a collection of disconnected tabs.

## Verification Rules

- Logic checks are not enough; inspect the rendered screen.
- Mock big visual changes first, then screenshot, then build the live version.
- Faithful and ugly beats clever and broken.
- Terminal wealth is not the goal. It is only a ranking device.
- Plan for spending security, bad-market survival, and meeting goals.

## Visual Doctrine

- Avoid bright white.
- Avoid mint green.
- Avoid code-font styling in the client-facing UI.
- Prefer warm paper, brass, and teal.
- Charts should be smooth and trackable, never jagged.

## Working Rules

- Lead with the result.
- Verify by running, reading, or inspecting before making a claim.
- Keep one current source of project truth in the root docs.
- Archive old notes instead of letting them compete with current guidance.
