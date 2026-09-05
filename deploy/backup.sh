#!/usr/bin/env bash
# Backup diário do banco + uploads. No VPS não existe a rede de proteção que
# a hospedagem gerenciada tinha — se o disco falhar ou alguém der um DROP sem
# querer, isto é a única cópia. Roda via cron (veja o fim do arquivo).
set -euo pipefail

# --- Ajuste estes três caminhos para o VPS real -----------------------------
DADOS_DIR="/home/cortavo/cortavo-data"
DESTINO_DIR="/home/cortavo/backups"
MANTER_DIAS=14
# -----------------------------------------------------------------------------

DATA=$(date +%Y-%m-%d_%H%M)
ARQ="$DESTINO_DIR/cortavo-$DATA.tar.gz"

mkdir -p "$DESTINO_DIR"

# `sqlite3 .backup` em vez de copiar o arquivo bruto: SQLite pode estar no
# meio de uma escrita, e copiar o arquivo "ao vivo" arrisca um backup
# corrompido. `.backup` é a forma segura, consistente mesmo com o app rodando.
TMP=$(mktemp -d)
sqlite3 "$DADOS_DIR/app.db" ".backup '$TMP/app.db'"

tar -czf "$ARQ" -C "$TMP" app.db -C "$DADOS_DIR" uploads
rm -rf "$TMP"

echo "Backup salvo em $ARQ"

# Apaga backups mais velhos que MANTER_DIAS — sem isto o disco enche sozinho
# em alguns meses.
find "$DESTINO_DIR" -name 'cortavo-*.tar.gz' -mtime "+$MANTER_DIAS" -delete

# --- Envio para FORA do servidor (importante) -------------------------------
# Backup que mora no mesmo disco do banco NÃO sobrevive a uma falha de disco.
# Este passo liga sozinho assim que você definir o destino — sem editar o script:
#
#   1) Instale e configure o rclone uma vez (cria um "remoto"):
#        rclone config          # ex.: nome "gdrive", "r2" ou "s3"
#   2) Aponte o destino via variável de ambiente (no crontab, veja abaixo):
#        RCLONE_REMOTE="gdrive:cortavo-backups"
#
# Sem RCLONE_REMOTE o backup ainda roda, mas fica SÓ no disco local (com aviso).
REMOTO="${RCLONE_REMOTE:-}"
if [ -n "$REMOTO" ]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copy "$ARQ" "$REMOTO" && echo "Enviado para $REMOTO"
  else
    echo "AVISO: RCLONE_REMOTE definido, mas 'rclone' não está instalado — backup ficou SÓ no disco local." >&2
  fi
else
  echo "AVISO: RCLONE_REMOTE não definido — backup ficou SÓ no disco local (não sobrevive a falha de disco)." >&2
fi
# -----------------------------------------------------------------------------
# TESTE DE RESTAURAÇÃO (faça uma vez — backup nunca restaurado não é backup):
#   mkdir -p /tmp/restore && tar -xzf <um-backup>.tar.gz -C /tmp/restore
#   sqlite3 /tmp/restore/app.db "SELECT count(*) FROM usuarios;"   # deve responder
# -----------------------------------------------------------------------------

# --- Instalação do agendamento (rodar uma vez) ------------------------------
# chmod +x backup.sh
# crontab -e
# Adicionar a linha (roda todo dia às 3h da manhã; com destino externo já embutido):
#   0 3 * * * RCLONE_REMOTE="gdrive:cortavo-backups" /home/cortavo/app/deploy/backup.sh >> /home/cortavo/backups/backup.log 2>&1
# (sem o RCLONE_REMOTE ele roda igual, mas o backup fica só no disco local.)
# -----------------------------------------------------------------------------
