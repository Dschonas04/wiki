#!/usr/bin/env bash
# ============================================================
# Nexora – PostgreSQL Restore-Skript
#
# Stellt ein Backup der Nexora-Datenbank wieder her.
#
# Verwendung:
#   ./scripts/restore.sh backups/nexora_backup_20260218_020000.sql.gz
# ============================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_DIR}/.env"

if [[ $# -lt 1 ]]; then
  echo -e "${RED}Verwendung: $0 <backup-datei.sql.gz>${NC}"
  echo "  Beispiel: $0 backups/nexora_backup_20260218_020000.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo -e "${RED}Fehler: Backup-Datei nicht gefunden: ${BACKUP_FILE}${NC}"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}Fehler: .env-Datei nicht gefunden: ${ENV_FILE}${NC}"
  exit 1
fi
source "$ENV_FILE"

echo -e "${YELLOW}╔══════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║  ⚠  WARNUNG: Datenbank-Wiederherstellung    ║${NC}"
echo -e "${YELLOW}║  Alle aktuellen Daten werden überschrieben!  ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo "  Backup:     ${BACKUP_FILE}"
echo "  Datenbank:  ${DB_NAME:-nexoradb}"
echo ""
read -p "Fortfahren? (ja/nein): " CONFIRM

if [[ "$CONFIRM" != "ja" ]]; then
  echo "Abgebrochen."
  exit 0
fi

echo -e "${YELLOW}[$(date -Iseconds)] Restore gestartet...${NC}"

# Dekomprimieren und in die Datenbank einspielen
gunzip -c "$BACKUP_FILE" | docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T db \
  psql -U "${DB_USER:-nexorauser}" -d "${DB_NAME:-nexoradb}" --quiet

echo -e "${GREEN}[$(date -Iseconds)] Restore erfolgreich abgeschlossen.${NC}"
echo -e "${YELLOW}Hinweis: Neustart des Backends empfohlen: docker compose restart wiki${NC}"
