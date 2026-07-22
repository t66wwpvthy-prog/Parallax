# T2 income spine handoff (historical)

**Status:** complete — merged PR #81 → `main` @ `d6e1e1b`

Schedule D classification (`FED_SCHEDULE_D_CLASSIFICATION`) wired through `form1040Spine.js`. annual-08 derives line 7a `-$3,000` without the `netLongTermCapitalGains: 0` shortcut. 167 tests passing at merge.

See git history and `src/tax/federal/rules/scheduleDClassification.js` for implementation detail. This file is completion provenance, not active sequencing authority.
