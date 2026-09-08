# Migração SQLite → Postgres (Supabase)

Runbook da **Fase 1** do roadmap de escala. Objetivo: sair do SQLite (um escritor
por vez) para um Postgres gerenciado, que aguenta escrita concorrente — pré-requisito
para a IA no app e, principalmente, para a IA no WhatsApp criar agendamentos sozinha.

O schema do Cortavo é **quase 100% compatível** com Postgres: sem enums, sem tipos
exóticos, sem query crua. A virada é pequena e **reversível** — mantemos o `.db` do
SQLite e um export em JSON como rede de segurança.

---

## Antes de começar — o que decidir

- **Plano.** O *free tier* do Supabase **pausa o banco após ~1 semana** de baixa
  atividade. Para uma barbearia de verdade isso é inaceitável (o app cairia). Para
  produção, use o plano **Pro (~US$25/mês)**. Dá para começar no free só para testar
  a migração.
- **Região.** Escolha **South America (São Paulo)** — menor latência para o VPS e
  dados no Brasil (bom para LGPD).
- **Uploads e sessões continuam no disco do VPS.** Só o banco vai para o Supabase.
  `APP_DATA_DIR` segue obrigatório (fotos, sessões).

---

## Passo 0 — Criar o projeto no Supabase

1. Criar projeto, região **São Paulo**, definir uma senha forte do banco (guardar
   no gerenciador de senhas — ela entra na connection string).
2. Em **Project Settings → Database → Connection string**, copiar as DUAS:
   - **Transaction pooler** (porta **6543**) → vira `DATABASE_URL` (o app usa esta).
   - **Direct connection** (porta **5432**) → vira `DIRECT_URL` (as migrations usam esta).

Formato (exemplo):

```
DATABASE_URL="postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
```

> O `pgbouncer=true` é obrigatório na URL pooled — sem ele o Prisma tenta usar
> prepared statements que o pgBouncer (modo transaction) não suporta.

---

## Passo 1 — Exportar os dados atuais (AINDA no SQLite)

No estado atual do repositório (schema `provider = "sqlite"`), com a `DATABASE_URL`
apontando para o `app.db` de produção:

```bash
node deploy/migrar-supabase.js --exportar
```

Gera `deploy/_migracao-dados.json`. **Anote as contagens** que ele imprime — vamos
conferir depois. Guarde esse arquivo e uma cópia do `app.db`.

---

## Passo 2 — Trocar o código para Postgres

Três edições. Faça todas juntas (elas quebram o SQLite, então é um corte único).

### 2a. `prisma/schema.prisma` — datasource

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### 2b. Busca case-insensitive (2 lugares)

No Postgres, `contains` é **case-sensitive** por padrão — a busca pararia de achar
"João" ao digitar "joão". Adicione `mode: 'insensitive'`:

- `src/controllers/appClienteController.js` (~linha 41):
  ```js
  ...(termo ? { nome: { contains: termo, mode: 'insensitive' } } : {}),
  ```
- `src/controllers/mestreController.js` (~linha 75):
  ```js
  where.OR = [
    { nome: { contains: q, mode: 'insensitive' } },
    { slug: { contains: q.toLowerCase(), mode: 'insensitive' } },
  ];
  ```

### 2c. Novas migrations para Postgres

As migrations em `prisma/migrations/` são SQL de SQLite e **não** aplicam no
Postgres. Gere um baseline novo:

```bash
# aponte o ambiente local para o Supabase (DATABASE_URL/DIRECT_URL no .env)
mv prisma/migrations prisma/migrations_sqlite_backup
npx prisma migrate dev --name init_postgres
```

Isso cria as tabelas no Supabase e grava a migration nova (commitar depois).
Regenere o client: `npx prisma generate`.

---

## Passo 3 — Importar os dados

Com as tabelas já criadas (Passo 2c) e `DATABASE_URL` no Supabase:

```bash
node deploy/migrar-supabase.js --importar
```

Ele insere tudo preservando os IDs e **reajusta as sequences** (senão o próximo
insert do app colidiria com um ID já usado). Confira que as contagens batem com as
do Passo 1.

---

## Passo 4 — Verificar ANTES de virar produção

Rode o app local apontado para o Supabase e teste:

- [ ] Login do dono e de um barbeiro.
- [ ] Agenda do dia carrega; concluir um atendimento grava no caixa.
- [ ] **Criar um agendamento novo** (testa a sequence de ID — o ponto mais
      provável de falha se o Passo 3 não reajustou as sequences).
- [ ] Busca de cliente/barbearia achando com maiúscula/minúscula/acento (testa o 2b).
- [ ] Relatórios/faturamento com números iguais aos de antes.

Só depois de tudo verde, seguir para o deploy.

---

## Passo 5 — Deploy no VPS

```bash
cd /home/cortavo/app
sudo -u cortavo git pull
sudo -u cortavo npm install
# .env do VPS: definir DATABASE_URL e DIRECT_URL do Supabase, REMOVER a antiga file:
sudo -u cortavo npx prisma migrate deploy
sudo -u cortavo npx prisma generate
sudo systemctl restart cortavo
```

O import (Passo 3) pode ser feito a partir da sua máquina apontando para o Supabase
(o banco é o mesmo, na nuvem) — não precisa reimportar no VPS.

---

## Rollback (se algo der errado)

A virada é reversível enquanto você mantém:

1. O `app.db` do SQLite intacto (não apagar por semanas).
2. O `deploy/_migracao-dados.json`.

Para voltar: `git revert` das edições do Passo 2, restaurar `prisma/migrations`,
voltar `DATABASE_URL` para o `file:...app.db` no `.env`, `npx prisma generate`,
restart. O SQLite volta exatamente como estava.

---

## Depois da migração — ganhos e próximos cuidados

- **Backups:** o Supabase Pro faz backup diário automático. Ainda assim, mantenha um
  `pg_dump` periódico próprio (adapte o `deploy/backup.sh`).
- **Conexões:** a URL pooled com `connection_limit=1` por processo é o recomendado
  para apps serverless/single-process; se o app escalar para vários workers, revisar.
- **Segredos:** `DATABASE_URL`/`DIRECT_URL` só no `.env` do VPS, nunca no git. A
  `service_role` key do Supabase **não é usada** (o app fala Postgres direto via
  Prisma) — não colocá-la no servidor reduz superfície de ataque.
