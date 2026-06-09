# Deployment Runbook

Date: 2026-06-09

Goal: clean and deploy the current Parallax build without rebuilding the
product, redesigning the UI, or changing engine math.

## Before Touching Code

1. Confirm the live entry file is `index.html`.
2. Confirm GitHub Pages serves from `main`.
3. Confirm the current app loads locally.
4. Confirm `engine.js` is imported by the app.
5. Do not edit engine math during cleanup.

## Cleanup Flow

```bash
git status
git checkout main
git pull origin main
git checkout -b cleanup/canon

mkdir -p archive/old-memory archive/ideas archive/static-demos docs/positioning
```

Move stale docs and prototypes out of the active root. Keep app code, engine
code, tests, build scripts, and current root docs active.

Before deleting code, run reference checks:

```bash
git grep -n -e "renderHybrid('goals')" -e recGoalRow -e onceGoalRow -- .
git grep -n -e seq-data.js -e window.SEQ -- .
git grep -n -e ASSET_STATS -- .
```

Delete only code proven dead by reference checks and verification. Archive static
demo files when they are not imported by the live app.

## Verify

```bash
npm ci
npm test
node scripts/verify.mjs
```

For manual local inspection:

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## GitHub Pages Check

After pushing to `main`:

1. Open the GitHub repository settings.
2. Go to Pages.
3. Confirm the source is the `main` branch.
4. Confirm the folder is `/root` unless the repo intentionally serves `/docs`.
5. Wait for the Pages build to finish.
6. Open the live URL in a private browser window.

## Manual Release Checklist

- App opens with no console errors.
- Household / Plan inputs work.
- Goals board works.
- Scenarios run.
- Solve-For works if visible.
- Sequencing runs.
- Cash-flow drawer opens with year-by-year rows.
- RMD rows appear after age 73 when traditional balance exists.
- Healthcare is independent from lifestyle spending changes.

## Rollback

```bash
git log --oneline -5
git revert <cleanup_commit_hash>
git push origin main
```
