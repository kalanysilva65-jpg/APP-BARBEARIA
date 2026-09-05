# Checklist pré-escala — Cortavo

Estratégia: piloto com poucas barbearias parceiras pra validar robustez, confiança e
velocidade no mundo real. Ajustar o resto enquanto roda.

Regra de ouro: o **Tier 0** protege dados/dinheiro reais das parceiras e **tem que estar
pronto ANTES da primeira parceira entrar**. Tier 1 roda durante o piloto. Tier 2 é antes
de escalar de verdade (depois do piloto validar).

---

## TIER 0 — Antes da 1ª parceira (inegociável, ~1 dia de trabalho)

Se qualquer um destes falhar durante o piloto, você perde a confiança da parceira.

> **JÁ EM PRODUÇÃO (deploy 2026-09-05, verificado ao vivo):** troca de senha obrigatória,
> rate-limit e helmet. Backup off-site: código pronto, falta você configurar o destino.
> O painel-mestre (Onda 1) também subiu: auditoria, busca/paginação, suspender/reativar,
> notas internas, reset de senha do dono, e o redesign no estilo suave claro do app.

- [x] **Trocar as senhas padrão** `dono123` / `admin123`. → Feito via **troca de senha
      obrigatória no 1º login**: a migration marca todo usuário existente como
      "senha provisória" (menos o revisor da Apple) e o app prende na tela de troca até
      definir uma senha própria (mín. 8 caracteres). Contas novas já nascem provisórias.
      **Falta:** rodar a migration no VPS (`prisma migrate deploy`) no deploy.
- [ ] **Confirmar `SESSION_SECRET`** forte e único setado na `.env` do VPS. ← **VOCÊ**
      Sem ele, cai no fallback `'troque-este-segredo'` → sessões forjáveis.
- [x] **Rate-limit no login** (`express-rate-limit`, 20 tentativas/15min por IP, na
      equipe e no cliente). Feito.
- [x] **`helmet`** — headers de segurança (HSTS, nosniff, X-Frame-Options etc.).
      Feito (CSP fica pra Tier 1/2, precisa de política sob medida por causa do inline).
- [~] **Backup OFF-SITE.** Código pronto: `deploy/backup.sh` agora envia pra fora sozinho
      quando `RCLONE_REMOTE` estiver setado. **Falta VOCÊ:** (1) `rclone config` no VPS
      pra criar o remoto (Drive/R2/S3), (2) pôr `RCLONE_REMOTE=...` na linha do cron,
      (3) **restaurar um backup uma vez** pra provar que funciona (passo no fim do script).
- [ ] **Confirmar HTTPS + cookie `secure`** ok em produção (a config já está certa —
      só validar que `NODE_ENV=production` está setado no VPS). ← **VOCÊ**

## TIER 1 — Durante o piloto (pra você APRENDER com ele, primeiras semanas)

O objetivo do piloto é medir robustez/velocidade. Sem instrumentação você não mede —
só espera a parceira reclamar.

- [ ] **Log de erros centralizado** (Sentry free, ou ao menos logs persistidos em
      arquivo com data). Você quer VER o bug antes da parceira contar.
- [ ] **Monitor de uptime + alerta** (UptimeRobot free): avisa se o app cair.
- [ ] **Healthcheck + auto-restart:** confirmar que o systemd reinicia em falha
      (`Restart=on-failure` no unit) e que existe um endpoint `/health` simples.
- [ ] **Testes nos fluxos que mexem em dinheiro/agenda:** agendar, concluir→caixa,
      encaixe (duração), baixa de estoque. São os caminhos onde bug = prejuízo real.
      Não precisa cobrir tudo — cobrir esses 4~5.
- [ ] **Migrations confiáveis no deploy:** hoje é passo manual (`prisma migrate deploy`
      separado). Fácil esquecer → schema quebrado em produção. Colocar no script de
      deploy pra rodar sempre, e **backup ANTES de todo deploy de schema.**
- [ ] **CSRF** nos forms de escrita (login, agendar, caixa).
- [ ] **Canal direto de bug com a parceira** (WhatsApp seu): quer o feedback em minutos,
      não em dias.

## TIER 2 — Antes de escalar de verdade (depois do piloto validar)

- [ ] **SQLite → Postgres gerenciado** (Supabase/Neon). SQLite tem 1 escritor só; segura
      o piloto, mas trava com muitas lojas escrevendo junto. Prisma torna a migração
      relativamente indolor.
- [ ] **Session store compartilhado** (Redis/Postgres) — pré-requisito pra ter +1
      servidor. Hoje sessão em arquivo prende você a 1 máquina.
- [ ] **CI** que roda os testes a cada push (não deixar quebrar sem avisar).
- [ ] **Revisão de segurança completa** + LGPD formal (política de privacidade, base
      legal, direito de exclusão).

---

## Instruções importantes (hábitos durante o piloto)

1. **Dados reais = LGPD já vale.** Não colete mais dado pessoal do cliente do que precisa.
   Tenha um jeito de apagar dados de um cliente se ele pedir.
2. **Backup ANTES de cada deploy** — principalmente os que mexem em schema. 30 segundos
   que evitam perder dados de parceira.
3. **Vigie de perto a 1ª semana de cada parceira** — caixa e agenda são o coração; um
   número errado ali é o que mais rápido queima confiança.
4. **Deploy com cuidado no VPS:** rodar node/git/prisma como `sudo -u cortavo` (root cria
   journals do SQLite com dono errado → banco vira readonly).
5. **Não remova a conta do revisor da Apple** (`revisor@cortavo.com.br`) enquanto houver
   review em andamento.
