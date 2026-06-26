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

> **Windows (uso diário):** depois de instalado, é só dar **duplo-clique em
> `iniciar.bat`** na pasta do projeto — ele sobe o app e mostra o endereço para
> abrir no PC e no celular (mesma Wi-Fi). Deixe a janela aberta enquanto usar.

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
- [x] **Fase 5** — Controle de estoque (com alerta de mínimo)
- [x] **Fase 6** — Controle de caixa (entradas/saídas, saldo dia/mês, entrada automática opcional)

### Funcionalidades adicionais

- [x] **Comissões por barbeiro** — relatório (admin) com **% configurável por barbeiro** sobre serviços, **produtos a 10%**, **ticket médio** e **taxa de ocupação**; seletor de período e de barbeiro
- [x] **Cadastro de clientes** — nome + **telefone único** (comparado de forma normalizada, só dígitos); novos agendamentos alimentam a lista automaticamente; histórico do cliente. Acesso de admin e funcionários
- [x] **Agendamento manual** pela equipe, com autocomplete de clientes e bloqueio de conflito
- [x] **Excluir agendamento** na agenda (qualquer status), com confirmação
- [x] **Planos (assinaturas)** — modelos limitado/ilimitado (admin) com **serviço incluso**; atribuição ao cliente com **entrada no caixa na compra**; uso no agendamento do site (telefone → ilimitado só **seg–qui**, **R$ 0**, consome 1 uso); comissão pelo **valor do plano**, uma vez por assinatura
