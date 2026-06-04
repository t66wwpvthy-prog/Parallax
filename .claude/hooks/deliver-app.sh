#!/usr/bin/env bash
# Stop hook: deliver the freshly built index.html to Nathan via SendUserFile so
# he always has the latest app without asking. Nudges ONLY when index.html has
# changed since the last delivery (keyed on the file's git blob hash stored in a
# sentinel), so a normal stop with no app change is a silent no-op. The
# stop_hook_active guard prevents an infinite stop loop.
input=$(cat)
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0
dir="${CLAUDE_PROJECT_DIR:-.}"
f="$dir/index.html"
[ -f "$f" ] || exit 0
cur=$(git -C "$dir" hash-object "$f" 2>/dev/null) || exit 0
[ -z "$cur" ] && exit 0
sentinel="$dir/.claude/.last-sent-index"
last=$(cat "$sentinel" 2>/dev/null)
if [ "$cur" != "$last" ]; then
  printf '%s' "$cur" > "$sentinel"
  printf '{"decision":"block","reason":"index.html changed since Nathan last received a copy. Deliver the freshly built index.html to him now via SendUserFile (status: proactive, short caption: save over the old file and refresh), so he always has the latest app on his machine. Then finish."}'
fi
exit 0
