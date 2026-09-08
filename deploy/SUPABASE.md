# Virada SQLite → Postgres (Supabase) — checklist de execução

Runbook da **Fase 1**. Objetivo: sair do SQLite (um escritor por vez) para o
Postgres do Supabase, que aguenta escrita concorrente — pré-requisito para a IA no
WhatsApp criar agendamentos sozinha.

**O trabalho de código já está PRONTO** na branch `infra/supabase`:
- `schema.prisma` → provider `postgresql` + `directUrl`.
- Migration inicial de Postgres já gerada (`prisma/migrations/20260908000000_init_postgres`).
  As migrations antigas de SQLite foram para `prisma/migrations_sqlite_backup/`.
- Os 2 `contains` da busca com `mode: 'insensitive'` (senão viram case-sensitive).

Este documento é só a **sequência de execução da virada**. Ela é **reversível**: só
LEMOS o SQLite (nunca apagamos), então dá para voltar.

---

## Projeto Supabase (já criado)

- Projeto `cortavo`, região **South America (São Paulo)**, Data API desligada.
- `.env` de produção precisa destas duas linhas (troque `SENHA` pela real):

```
DATABASE_URL="postgresql://postgres.cpxxfkadmgcyhsolyebb:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.cpxxfkadmgcyhsolyebb:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
```

> As duas passam pelo **pooler** (IPv4). `pgbouncer=true` é obrigatório na primeira.

---

## A ORDEM IMPORTA

O `--exportar` lê o SQLite e **tem que rodar ANTES** do `git pull` que troca o schema
para Postgres — depois do pull, o Prisma Client vira Postgres e não lê mais o `.db`.
Faça na janela com a **barbearia fechada** (sem agendamentos entrando no meio).

---

## Passo 1 — Exportar os dados de produção (VPS, ainda SQLite)

```bash
cd /home/cortavo/app
sudo -u cortavo node deploy/migrar-supabase.js --exportar
```

Gera `deploy/_migracao-dados.json` no VPS. **Anote as contagens** que ele imprime.
Faça também uma cópia de segurança do banco atual:

```bash
sudo -u cortavo cp /home/cortavo/cortavo-data/app.db /home/cortavo/cortavo-data/app.db.pre-supabase
```

## Passo 2 — Subir o código da virada

Da sua máquina, juntar a branch e publicar:

```bash
git checkout design/suave && git merge infra/supabase
git push origin design/suave && git push hostinger design/suave:main
```

No VPS:

```bash
cd /home/cortavo/app
sudo -u cortavo git pull
sudo -u cortavo npm install
```

## Passo 3 — Apontar o `.env` para o Supabase

Editar `/home/cortavo/app/.env`: **comentar/remover** a `DATABASE_URL="file:..."`
antiga e colocar as duas linhas do Supabase (seção acima, com a senha real).
**Manter** `APP_DATA_DIR` e `APP_DOMAIN` — uploads e sessões seguem no disco.

## Passo 4 — Criar as tabelas e importar os dados (no Supabase)

```bash
cd /home/cortavo/app
sudo -u cortavo npx prisma migrate deploy   # cria o schema no Supabase
sudo -u cortavo npx prisma generate         # client Postgres
sudo -u cortavo node deploy/migrar-supabase.js --importar   # popula (IDs + sequences)
```

Confira que as contagens do `--importar` batem com as do Passo 1.

## Passo 5 — Reiniciar e verificar

```bash
sudo systemctl restart cortavo
```

Testar no app real:
- [ ] Login do dono e de um barbeiro.
- [ ] Agenda do dia carrega; **concluir** um atendimento grava no caixa.
- [ ] **Criar um agendamento novo** — testa a sequence de ID (o ponto mais provável
      de falha se as sequences não subiram no import).
- [ ] Busca de cliente/barbearia com maiúscula/minúscula/acento.
- [ ] Faturamento/relatórios com números iguais aos de antes.

---

## Rollback (se algo der errado)

O SQLite ficou intacto (só foi lido) e você tem o `.db.pre-supabase`. Para voltar:

```bash
cd /home/cortavo/app
# 1) .env: voltar DATABASE_URL="file:/home/cortavo/cortavo-data/app.db", remover DIRECT_URL
sudo -u cortavo git checkout design/suave   # (antes do merge, ou git revert do merge)
sudo -u cortavo npm install && sudo -u cortavo npx prisma generate
sudo systemctl restart cortavo
```

O app volta ao SQLite exatamente como estava. Guarde o `app.db.pre-supabase` e o
`_migracao-dados.json` por algumas semanas antes de descartar.

---

## Depois da virada

- **Backups:** o Supabase Pro faz backup diário. Ainda assim, um `pg_dump` periódico
  próprio é saudável (adaptar `deploy/backup.sh`).
- **Segredos:** `DATABASE_URL`/`DIRECT_URL` só no `.env` do VPS, nunca no git. A
  `service_role` key do Supabase **não é usada** (Prisma fala Postgres direto).
- **Custo:** o free tier pausa após ~1 semana de baixa atividade — para produção,
  **plano Pro (~US$25/mês)**.
