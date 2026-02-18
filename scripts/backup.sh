#!/usr/bin/env bash
# ============================================================
# Nexora – PostgreSQL Backup-Skript
#
# Erstellt ein komprimiertes Backup der Nexora-Datenbank.
# Kann manuell oder per Cron-Job ausgeführt werden.
#
# Verwendung:
#   ./scripts/backup.sh                 # Backup in ./backups/
#   ./scripts/backup.sh /pfad/zu/dir    # Backup in angegebenes Verzeichnis
#
# Cron-Beispiel (täglich um 02:00):
#   0 2 * * * cd /path/to/wiki && ./scripts/backup.sh >> /var/log/nexora-backup.log 2>&1
# ============================================================

set -euo pipefail

# Farben für Ausgabe
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_DIR}/.env"

# .env laden
if [[ ! -f "$ENV_FILE" ]]; then
  echo -e "${RED}Fehler: .env-Datei nicht gefunden: ${ENV_FILE}${NC}"
  exit 1
fi
source "$ENV_FILE"

# Backup-Verzeichnis (Argument oder Standard)
BACKUP_DIR="${1:-${PROJECT_DIR}/backups}"
mkdir -p "$BACKUP_DIR"

# Dateiname mit Zeitstempel
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/nexora_backup_${TIMESTAMP}.sql.gz"

echo -e "${YELLOW}[$(date -Iseconds)] Nexora Backup gestartet...${NC}"
echo "  Datenbank: ${DB_NAME:-nexoradb}"
echo "  Benutzer:  ${DB_USER:-nexorauser}"
echo "  Ziel:      ${BACKUP_FILE}"

# pg_dump über Docker-Container ausführen und komprimieren
docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T db \
  pg_dump -U "${DB_USER:-nexorauser}" -d "${DB_NAME:-nexoradb}" --clean --if-exists \
  | gzip > "$BACKUP_FILE"

# Dateigröße prüfen
FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

if [[ -s "$BACKUP_FILE" ]]; then
  echo -e "${GREEN}[$(date -Iseconds)] Backup erfolgreich: ${BACKUP_FILE} (${FILE_SIZE})${NC}"
else
  echo -e "${RED}[$(date -Iseconds)] Backup fehlgeschlagen – Datei ist leer${NC}"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Alte Backups aufräumen (Standard: 30 Tage behalten)
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DELETED=$(find "$BACKUP_DIR" -name "nexora_backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [[ "$DELETED" -gt 0 ]]; then
  echo -e "${YELLOW}  ${DELETED} alte Backup(s) gelöscht (älter als ${RETENTION_DAYS} Tage)${NC}"
fi

echo -e "${GREEN}Fertig.${NC}"
