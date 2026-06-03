---
name: bank
description: Regenerate the Parallax Master Idea Bank as a formatted Word doc (.docx) and deliver it. Use when Nathan asks for the idea bank, or after new ideas were parked and he wants the refreshed document. Keeps the bank's three homes in sync — ROADMAP.md (index), NOTES.md (detail), and the generated doc.
---

# Bank

Regenerate and deliver the Master Idea Bank as a Word document.

## Steps

1. **Sync new ideas first.** If ideas were parked since the last run, add them to:
   - `NOTES.md` (the detail — full rationale), and
   - `ROADMAP.md` (the one-line index), and
   - the section lists inside `scripts/make-idea-bank-docx.py` (what the doc renders).
   These three are the bank's canonical homes — keep them consistent.
2. **Generate** — `python3 scripts/make-idea-bank-docx.py`
   (writes `Parallax-Idea-Bank.docx`; needs `python-docx` — `pip install python-docx` if missing).
3. **Deliver** — send `Parallax-Idea-Bank.docx` to Nathan with `SendUserFile`.
4. **Persist** — commit `Parallax-Idea-Bank.docx` + any synced `NOTES.md`/`ROADMAP.md`/script
   changes, and push to BOTH the working branch and `main` (so it isn't lost when the container recycles).

## Notes
- Word doc is the preferred format (not PDF). The doc uses real Word headings + bullet
  styles so it's navigable and easy to skim.
- The bank lives in three places on purpose: NOTES.md = why, ROADMAP.md = checklist index,
  the .docx = the shareable deliverable. The script is the single place that controls the doc's content.
