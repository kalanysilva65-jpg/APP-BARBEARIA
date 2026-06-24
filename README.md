# 💈 App de Gestão para Barbearia

Aplicação web full-stack para gestão de uma barbearia, com **área pública** (clientes agendam) e **área interna** (equipe gerencia agenda, produtos, estoque e caixa).

- **Backend:** Node.js + Express
- **Banco:** SQLite + Prisma (ORM, com migrations versionáveis)
- **Frontend:** EJS (renderizado no servidor) + CSS, **mobile-first** e responsivo
- **Auth:** sessão com senha (bcrypt)
- **Uploads:** fotos de produtos em `/uploads` (multer)

---

## ✅ Pré-requisitos

- **Node.js 18+** (testado no Node 24). Verifique com `node --version`.

> No Windows, se `node` não for reconhecido no terminal, ele costuma estar em
> `C:\Program Files\nodejs\`. Adicione essa pasta ao PATH ou abra o terminal que
> já tenha o Node disponível.

---

## 🚀 Como rodar (passo a passo)

```bash
# 1. Instalar as dependências
npm install

# 2. Criar o banco (migrations) e gerar o Prisma Client
npx prisma migrate dev --name init

# 3. Popular o banco com a equipe e exemplos
npm run seed

# 4. Subir o servidor
npm run dev
```

Acesse: **http://localhost:3000**

> Atalho: depois do `npm install`, você pode rodar `npm run setup` (faz a
> migration e o seed de uma vez) e então `npm run dev`.

---

## 🔑 Logins de teste

| Perfil | E-mail | Senha | Acesso |
|--------|--------|-------|--------|
| Admin (chefe) | `admin@barbearia.com` | `admin123` | Total |
| Funcionário 1 | `bruno@barbearia.com` | `func123` | Própria agenda |
| Funcionário 2 | `carlos@barbearia.com` | `func123` | Própria agenda |

Os três são barbeiros agendáveis pelo cliente.

---

## 📂 Estrutura de pastas

```
barbearia/
├── prisma/
│   ├── schema.prisma   # modelo de dados
│   ├── migrations/     # migrations versionáveis
│   └── seed.js         # popula equipe + exemplos
├── src/
│   ├── server.js       # bootstrap do Express
│   ├── config/         # db (Prisma) e constantes
│   ├── middlewares/    # auth (permissões) e upload (multer)
│   ├── controllers/    # lógica das rotas
│   ├── routes/         # auth e painel
│   └── views/          # EJS (layouts, partials, telas)
├── public/css/         # design system (estilos)
├── uploads/            # fotos de produtos
└── .env                # configurações locais
```

---

## 🛠️ Scripts disponíveis

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Sobe o servidor com auto-reload |
| `npm start` | Sobe o servidor (produção) |
| `npm run seed` | Popula o banco (idempotente) |
| `npm run migrate` | Roda/atualiza as migrations |
| `npm run setup` | Migration + seed de uma vez |

---

## 📌 Notas técnicas

- Valores monetários são guardados em **centavos** (inteiros) para evitar erros
  de arredondamento; a formatação para `R$` acontece na exibição.
- Usamos **bcryptjs** (JavaScript puro) para o hash de senha — mesma função do
  bcrypt, sem precisar compilar código nativo no Windows.
- O banco SQLite fica em `prisma/dev.db`. As migrations garantem que você não
  perca dados ao reiniciar.
- **PWA (fase 2):** o projeto está estruturado para virar PWA depois (basta
  adicionar `manifest.json` + service worker). Ainda não implementado.

---

## 📈 Status de desenvolvimento

- [x] **Fase 1** — Base: banco, autenticação e design system
- [x] **Fase 2** — Agendamento (lado do cliente)
- [x] **Fase 3** — Agenda da equipe + horários/bloqueios
- [x] **Fase 4** — Serviços & produtos (com upload de foto)
- [ ] **Fase 5** — Controle de estoque
- [ ] **Fase 6** — Controle de caixa
