#!/usr/bin/env bash
# One-time repository setup. Requires: gh (authenticated), git. Run from the repo root after the first commit on main.
set -euo pipefail
REPO="NextTyrCreator/100proof"
git checkout main && git pull
git checkout -b dev 2>/dev/null || git checkout dev
git push -u origin dev
git checkout main
git config commit.template .gitmessage
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{"required_status_checks":{"strict":true,"contexts":["ci"]},"enforce_admins":true,
 "required_pull_request_reviews":{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":true},
 "restrictions":null,"required_linear_history":false,"allow_force_pushes":false,"allow_deletions":false,"required_conversation_resolution":true}
JSON
gh api -X PUT "repos/$REPO/branches/dev/protection" --input - <<'JSON'
{"required_status_checks":{"strict":true,"contexts":["ci"]},"enforce_admins":false,
 "required_pull_request_reviews":{"required_approving_review_count":0},
 "restrictions":null,"allow_force_pushes":false,"allow_deletions":false,"required_conversation_resolution":true}
JSON
gh api -X PATCH "repos/$REPO" -f allow_squash_merge=true -f allow_merge_commit=true -f allow_rebase_merge=false \
  -f delete_branch_on_merge=true -f has_wiki=false -f has_issues=true \
  -f squash_merge_commit_title=PR_TITLE -f squash_merge_commit_message=PR_BODY >/dev/null
gh api -X PATCH "repos/$REPO" --input - >/dev/null <<'JSON'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
JSON
gh api -X PUT "repos/$REPO/vulnerability-alerts" >/dev/null
for l in "ws:capture" "ws:valuation" "ws:evidence" "ws:packet" "ws:agents" "ws:insurance" "ws:infra" "ws:legal" "docs" "adr" "bug" "security" "perf"; do
  gh label create "$l" --repo "$REPO" --force >/dev/null
done
echo "Done. Flow: ws/* -> PR -> dev (squash) -> PR -> main (merge commit, daily)."
