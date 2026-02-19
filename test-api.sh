#!/bin/bash
set -uo pipefail

BASE="https://localhost:8443/api"
JAR="/tmp/nexora-test-cookies.txt"
PASS=0
FAIL=0
RESULTS=""

ok()   { PASS=$((PASS+1)); RESULTS+="✅ $1\n"; echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); RESULTS+="❌ $1 — $2\n"; echo "  ❌ $1 — $2"; }

# Generic endpoint tester
# Usage: test_endpoint "label" METHOD "/path" '{"json":"data"}' "expect_string"
te() {
  local label="$1" method="$2" url="$3" data="${4:-}" expect="${5:-}"
  local args=(-sk -w "\n%{http_code}" -b "$JAR" -H "X-Requested-With: XMLHttpRequest")

  case "$method" in
    POST)   args+=(-X POST -H "Content-Type: application/json") ;;
    PUT)    args+=(-X PUT -H "Content-Type: application/json") ;;
    PATCH)  args+=(-X PATCH -H "Content-Type: application/json") ;;
    DELETE) args+=(-X DELETE) ;;
  esac
  [ -n "$data" ] && args+=(-d "$data")

  local output code resp
  output=$(curl "${args[@]}" "${BASE}${url}" 2>&1) || true
  code=$(echo "$output" | tail -1)
  resp=$(echo "$output" | sed '$d')

  if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    if [ -n "$expect" ]; then
      if echo "$resp" | grep -q "$expect"; then
        ok "$label ($code)"
      else
        fail "$label" "HTTP $code but missing '$expect'"
      fi
    else
      ok "$label ($code)"
    fi
  else
    fail "$label" "HTTP $code"
  fi
  # Return resp for ID extraction
  echo "$resp"
}

echo ""
echo "═══════════════════════════════════════════"
echo "  NEXORA – Vollständiger API-Funktionstest"
echo "═══════════════════════════════════════════"
echo ""

# ━━━━━ 1. AUTH ━━━━━
echo "── 1. Auth ──────────────────────────────"
resp=$(curl -sk -c "$JAR" -w "\n%{http_code}" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{"username":"admin","password":"Admin123!"}' \
  "$BASE/auth/login" 2>&1)
code=$(echo "$resp" | tail -1)
if [ "$code" = "200" ] && grep -q nexora_token "$JAR" 2>/dev/null; then
  ok "POST /auth/login ($code)"
else
  fail "POST /auth/login" "HTTP $code"
fi

te "GET /auth/me" GET "/auth/me" "" "admin" > /dev/null

bad_code=$(curl -sk -o /dev/null -w "%{http_code}" \
  -H "Content-Type: application/json" \
  -H "X-Requested-With: XMLHttpRequest" \
  -d '{"username":"admin","password":"wrongpass"}' \
  "$BASE/auth/login" 2>&1)
if [[ "$bad_code" =~ ^4[0-9][0-9]$ ]]; then
  ok "POST /auth/login bad creds ($bad_code)"
else
  fail "POST /auth/login bad creds" "HTTP $bad_code"
fi
echo ""

# ━━━━━ 2. HEALTH ━━━━━
echo "── 2. Health ────────────────────────────"
pub=$(curl -sfk "$BASE/health" 2>&1)
if echo "$pub" | grep -q healthy; then
  ok "GET /health public"
else
  fail "GET /health public" "no healthy"
fi
te "GET /health/details" GET "/health/details" "" "connected" > /dev/null
echo ""

# ━━━━━ 3. ORGANIZATIONS ━━━━━
echo "── 3. Organizations ─────────────────────"
te "GET /organizations" GET "/organizations" "" "" > /dev/null
te "GET /organizations/1" GET "/organizations/1" "" "Nexora" > /dev/null
echo ""

# ━━━━━ 4. USERS ━━━━━
echo "── 4. Users ─────────────────────────────"
te "GET /users" GET "/users" "" "admin" > /dev/null
te "GET /users/list" GET "/users/list" "" "" > /dev/null
echo ""

# ━━━━━ 5. SPACES ━━━━━
echo "── 5. Spaces ────────────────────────────"
SPACE_NAME="Testbereich-$(date +%s)"
SPACE_RESP=$(te "POST /spaces" POST "/spaces" "{\"name\":\"$SPACE_NAME\",\"description\":\"CI Test\"}" "")
SPACE_ID=$(echo "$SPACE_RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "   → Space ID: ${SPACE_ID:-NONE}"

if [ -n "${SPACE_ID:-}" ]; then
  te "GET /spaces" GET "/spaces" "" "Testbereich" > /dev/null
  te "GET /spaces/$SPACE_ID" GET "/spaces/$SPACE_ID" "" "Testbereich" > /dev/null
  te "PUT /spaces/$SPACE_ID" PUT "/spaces/$SPACE_ID" "{\"name\":\"$SPACE_NAME Upd\",\"description\":\"Upd\"}" "" > /dev/null
fi
echo ""

# ━━━━━ 6. FOLDERS ━━━━━
echo "── 6. Folders ───────────────────────────"
if [ -n "${SPACE_ID:-}" ]; then
  FOLDER_RESP=$(te "POST /spaces/$SPACE_ID/folders" POST "/spaces/$SPACE_ID/folders" '{"name":"Testordner"}' "Testordner")
  FOLDER_ID=$(echo "$FOLDER_RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
  echo "   → Folder ID: ${FOLDER_ID:-NONE}"

  te "GET /spaces/$SPACE_ID/folders" GET "/spaces/$SPACE_ID/folders" "" "" > /dev/null

  if [ -n "${FOLDER_ID:-}" ]; then
    te "PUT /folders/$FOLDER_ID" PUT "/folders/$FOLDER_ID" '{"name":"Ordner Upd"}' "" > /dev/null
  fi
fi
echo ""

# ━━━━━ 7. PAGES ━━━━━
echo "── 7. Pages ─────────────────────────────"
PAGE_RESP=$(te "POST /pages" POST "/pages" '{"title":"Testseite","content":"<p>Hallo Welt</p>"}' "Testseite")
PAGE_ID=$(echo "$PAGE_RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "   → Page ID: ${PAGE_ID:-NONE}"

te "GET /pages" GET "/pages" "" "items" > /dev/null

if [ -n "${PAGE_ID:-}" ]; then
  te "GET /pages/$PAGE_ID" GET "/pages/$PAGE_ID" "" "Testseite" > /dev/null
  te "PUT /pages/$PAGE_ID" PUT "/pages/$PAGE_ID" '{"title":"Testseite Upd","content":"<p>Upd</p>"}' "" > /dev/null
  te "GET /pages/$PAGE_ID/versions" GET "/pages/$PAGE_ID/versions" "" "" > /dev/null
fi
echo ""

# ━━━━━ 8. TAGS ━━━━━
echo "── 8. Tags ──────────────────────────────"
te "GET /tags" GET "/tags" "" "" > /dev/null

TAG_RESP=$(te "POST /tags" POST "/tags" '{"name":"TestTag","color":"#ff5500"}' "TestTag")
TAG_ID=$(echo "$TAG_RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "   → Tag ID: ${TAG_ID:-NONE}"

if [ -n "${PAGE_ID:-}" ] && [ -n "${TAG_ID:-}" ]; then
  te "PUT /pages/$PAGE_ID/tags" PUT "/pages/$PAGE_ID/tags" "{\"tagIds\":[$TAG_ID]}" "" > /dev/null
  te "GET /pages/$PAGE_ID/tags" GET "/pages/$PAGE_ID/tags" "" "" > /dev/null
fi
echo ""

# ━━━━━ 9. FAVORITES ━━━━━
echo "── 9. Favorites ─────────────────────────"
if [ -n "${PAGE_ID:-}" ]; then
  te "POST /favorites/$PAGE_ID" POST "/favorites/$PAGE_ID" "" "" > /dev/null
  te "GET /favorites" GET "/favorites" "" "" > /dev/null
  te "GET /favorites/$PAGE_ID/check" GET "/favorites/$PAGE_ID/check" "" "" > /dev/null
fi
echo ""

# ━━━━━ 10. COMMENTS ━━━━━
echo "── 10. Comments ─────────────────────────"
if [ -n "${PAGE_ID:-}" ]; then
  COMMENT_RESP=$(te "POST /pages/$PAGE_ID/comments" POST "/pages/$PAGE_ID/comments" '{"content":"Testkommentar"}' "Testkommentar")
  COMMENT_ID=$(echo "$COMMENT_RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
  echo "   → Comment ID: ${COMMENT_ID:-NONE}"

  te "GET /pages/$PAGE_ID/comments" GET "/pages/$PAGE_ID/comments" "" "" > /dev/null

  if [ -n "${COMMENT_ID:-}" ]; then
    te "PUT /comments/$COMMENT_ID" PUT "/comments/$COMMENT_ID" '{"content":"Upd Kommentar"}' "" > /dev/null
    te "DELETE /comments/$COMMENT_ID" DELETE "/comments/$COMMENT_ID" "" "" > /dev/null
  fi
fi
echo ""

# ━━━━━ 11. SHARING ━━━━━
echo "── 11. Sharing ────────────────────────"
if [ -n "${PAGE_ID:-}" ]; then
  # Sharing returns 410 Gone (deprecated) – that's expected
  resp_code=$(curl -sk -o /dev/null -w "%{http_code}" -b "$JAR" -H "X-Requested-With: XMLHttpRequest" "${BASE}/pages/$PAGE_ID/shares")
  if [ "$resp_code" = "410" ]; then ok "GET /pages/:id/shares (410 Gone)"; else fail "GET /pages/:id/shares" "HTTP $resp_code"; fi
  resp_code=$(curl -sk -o /dev/null -w "%{http_code}" -b "$JAR" -H "X-Requested-With: XMLHttpRequest" "${BASE}/shared")
  if [ "$resp_code" = "410" ]; then ok "GET /shared (410 Gone)"; else fail "GET /shared" "HTTP $resp_code"; fi
fi
echo ""

# ━━━━━ 12. PRIVATE SPACE ━━━━━
sleep 1
echo "── 12. Private Space ────────────────────"
PRIV_RESP=$(te "POST /private-space/pages" POST "/private-space/pages" '{"title":"Private Notiz","content":"<p>Geheim</p>"}' "")
PRIV_ID=$(echo "$PRIV_RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "   → Private Page ID: ${PRIV_ID:-NONE}"

te "GET /private-space" GET "/private-space" "" "" > /dev/null

if [ -n "${PRIV_ID:-}" ]; then
  te "GET /private-space/pages/$PRIV_ID" GET "/private-space/pages/$PRIV_ID" "" "" > /dev/null
  te "PUT /private-space/pages/$PRIV_ID" PUT "/private-space/pages/$PRIV_ID" '{"title":"Priv Upd","content":"<p>Upd</p>"}' "" > /dev/null
fi
echo ""

# ━━━━━ 13. PUBLISHING ━━━━━
sleep 1
echo "── 13. Publishing ───────────────────────"
te "GET /publishing/requests" GET "/publishing/requests" "" "" > /dev/null
if [ -n "${PAGE_ID:-}" ] && [ -n "${SPACE_ID:-}" ]; then
  te "POST /publishing/request" POST "/publishing/request" "{\"pageId\":$PAGE_ID,\"targetSpaceId\":$SPACE_ID}" "" > /dev/null
fi
echo ""

# ━━━━━ 14. APPROVALS ━━━━━
echo "── 14. Approvals ────────────────────────"
resp_code=$(curl -sk -o /dev/null -w "%{http_code}" -b "$JAR" -H "X-Requested-With: XMLHttpRequest" "${BASE}/approvals")
if [ "$resp_code" = "410" ]; then ok "GET /approvals (410 Gone)"; else fail "GET /approvals" "HTTP $resp_code"; fi
echo ""

# ━━━━━ 15. TEMPLATES ━━━━━
echo "── 15. Templates ────────────────────────"
te "GET /templates" GET "/templates" "" "" > /dev/null
TMPL_RESP=$(te "POST /templates" POST "/templates" '{"name":"Test Tmpl","content":"<p>Tmpl</p>","category":"test"}' "")
TMPL_ID=$(echo "$TMPL_RESP" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
echo "   → Template ID: ${TMPL_ID:-NONE}"
echo ""

# ━━━━━ 16. NOTIFICATIONS ━━━━━
sleep 2
echo "── 16. Notifications ────────────────────"
te "GET /notifications" GET "/notifications" "" "" > /dev/null
te "GET /notifications/unread" GET "/notifications/unread" "" "" > /dev/null
echo ""

# ━━━━━ 17. DASHBOARD ━━━━━
echo "── 17. Dashboard ────────────────────────"
te "GET /dashboard/stats" GET "/dashboard/stats" "" "" > /dev/null
te "GET /dashboard/activity" GET "/dashboard/activity" "" "" > /dev/null
echo ""

# ━━━━━ 18. AUDIT ━━━━━
echo "── 18. Audit ────────────────────────────"
te "GET /audit" GET "/audit" "" "" > /dev/null
echo ""

# ━━━━━ 19. SETTINGS ━━━━━
# Brief pause to avoid nginx rate-limit (15r/s burst 30)
sleep 2
echo "── 19. Settings ─────────────────────────"
te "GET /settings/theme" GET "/settings/theme" "" "" > /dev/null
te "GET /settings/language" GET "/settings/language" "" "" > /dev/null
echo ""

# ━━━━━ 20. GRAPH ━━━━━
echo "── 20. Knowledge Graph ──────────────────"
te "GET /graph" GET "/graph" "" "" > /dev/null
echo ""

# ━━━━━ 21. TRASH ━━━━━
sleep 2
echo "── 21. Trash ────────────────────────────"
if [ -n "${PAGE_ID:-}" ]; then
  te "DELETE /pages/$PAGE_ID" DELETE "/pages/$PAGE_ID" "" "" > /dev/null
  te "GET /trash" GET "/trash" "" "" > /dev/null
  te "POST /trash/$PAGE_ID/restore" POST "/trash/$PAGE_ID/restore" "" "" > /dev/null
fi
echo ""

# ━━━━━ 22. CHANGE PASSWORD ━━━━━
echo "── 22. Change Password ──────────────────"
te "POST /auth/change-password" POST "/auth/change-password" '{"currentPassword":"Admin123!","newPassword":"Admin123!"}' "" > /dev/null
echo ""

# ━━━━━ CLEANUP ━━━━━
sleep 2
echo "── Cleanup ──────────────────────────────"
if [ -n "${PRIV_ID:-}" ]; then
  te "DELETE /private-space/pages/$PRIV_ID" DELETE "/private-space/pages/$PRIV_ID" "" "" > /dev/null
fi
if [ -n "${SPACE_ID:-}" ]; then
  te "DELETE /spaces/$SPACE_ID" DELETE "/spaces/$SPACE_ID" "" "" > /dev/null
fi
# Final page cleanup (was restored from trash)
if [ -n "${PAGE_ID:-}" ]; then
  te "DELETE /pages/$PAGE_ID (final)" DELETE "/pages/$PAGE_ID" "" "" > /dev/null
fi
te "POST /auth/logout" POST "/auth/logout" "" "" > /dev/null
echo ""

# ━━━━━ SUMMARY ━━━━━
echo "═══════════════════════════════════════════"
echo "  ERGEBNIS: $PASS bestanden, $FAIL fehlgeschlagen"
echo "═══════════════════════════════════════════"
echo ""
printf "$RESULTS"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
else
  exit 0
fi
