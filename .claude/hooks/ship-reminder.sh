#!/usr/bin/env bash
# Stop hook: if the current branch has commits not yet on origin/main, remind
# Claude to /ship — GitHub Pages serves main, so an un-shipped commit means the
# live site is stale. No-op when already in sync, or when we're already looping
# from a prior stop-hook nudge (avoids an infinite stop loop).
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0
n=$(git rev-list --count origin/main..HEAD 2>/dev/null)
if [ -n "$n" ] && [ "$n" != "0" ]; then
  printf '{"decision":"block","reason":"%s commit(s) on %s are not on origin/main yet — GitHub Pages serves main, so the live site is stale. Run /ship (push the working branch AND main) before finishing."}' \
    "$n" "$(git branch --show-current)"
fi
exit 0
