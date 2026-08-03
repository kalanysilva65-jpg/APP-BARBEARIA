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

# --- Envio para fora do servidor (recomendado, não obrigatório) -------------
# Backup que mora no mesmo disco do banco não sobrevive a uma falha de disco.
# Descomente UMA opção depois de configurar as credenciais:
#
# rclone copy "$ARQ" remoto:cortavo-backups/          # rclone (Drive, R2, S3...)
# scp "$ARQ" usuario@outro-servidor:/backups/          # outro servidor via SSH
# -----------------------------------------------------------------------------

# --- Instalação do agendamento (rodar uma vez) ------------------------------
# chmod +x backup.sh
# crontab -e
# Adicionar a linha (roda todo dia às 3h da manhã):
#   0 3 * * * /home/cortavo/app/deploy/backup.sh >> /home/cortavo/backups/backup.log 2>&1
# -----------------------------------------------------------------------------
