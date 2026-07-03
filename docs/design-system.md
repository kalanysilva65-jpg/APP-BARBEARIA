# Design System — App Barbearia

Documento de referência do visual do app, extraído do CSS em produção
(`public/css/styles.css`, `tema-minimal.css`, `painel-app.css`). Use isto
como fonte de verdade ao gerar telas/artes no Claude Design.

O app tem **dois sistemas visuais coexistindo**, cada um com seu público:

| | Área pública (cliente agenda) | Painel da equipe |
|---|---|---|
| Rotas | `/agendar`, `/login` (cliente) | `/painel/*` |
| Estilo | Minimalista, preto & branco, cards com borda | "App" — azul, cards flutuantes, navegação inferior fixa |
| Cor de destaque | Preto (`--acao`) | Azul `#2f6bff` |
| Navegação | Passos no topo (Serviço → Barbeiro → Horário → Dados) | Bottom nav fixa (5 ícones) |

Os dois compartilham a mesma base tipográfica, os mesmos tokens neutros
(texto, fundo, borda) e o mesmo suporte a tema claro/escuro.

---

## 1. Fundação

### Fonte
```
Plus Jakarta Sans (Google Fonts), pesos 400/500/600/700
Fallback: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
```
Geométrica, limpa — inspirada em Apple / Linear / Vercel.

### Grid & viewport
Mobile-first. Container principal com `max-width` de leitura confortável,
padding lateral ~16–20px. Em telas ≥720px a navegação inferior do painel
vira uma "barra estreita" centralizada (max-width 560px) ao invés de
ocupar a largura toda.

### Raios
| Token | Valor | Uso |
|---|---|---|
| `--raio-btn` / `--raio-input` | 8px | botões, inputs |
| `--raio-card` | 12px (área pública) | cards padrão |
| Cards do painel (`.app-painel .card`) | 16px | sobrescrito, mais arredondado |
| Cards de destaque (hero azul, ganhos) | 20px | `.dash-azul`, `.caixa-ganhos` |
| Pills (botões, badges, chips) | 999px | `.btn-pill`, `.status`, `.badge-papel` |
| Bottom-sheet (pop-up mobile) | 20px 20px 0 0 | vira 20px nos 4 cantos em ≥600px |

### Sombra
```css
--sombra: 0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04);
/* escuro: 0 1px 2px rgba(0,0,0,.3), 0 4px 16px rgba(0,0,0,.3) */
```
Dupla, bem sutil — não usar sombras pesadas/dramáticas.

---

## 2. Cor

### Tokens neutros (compartilhados, claro/escuro)

| Token | Claro | Escuro |
|---|---|---|
| `--fundo` | `#ffffff` | `#0e0e0e` |
| `--superficie` (cards) | `#ffffff` | `#171717` |
| `--secao-alt` (fundo alternado, sub-cards) | `#f7f7f7` | `#1c1c1c` |
| `--borda` | `#f0f0f0` | `#2a2a2a` |
| `--texto` | `#000000` | `#f0f0f0` |
| `--texto-secundario` | `#737373` | `#888888` |
| `--texto-sutil` | `#a3a3a3` | `#555555` |
| `--acao` (preto, área pública) | `#000000` | `#ffffff` |
| `--sucesso` | `#16a34a` | `#22c55e` |
| `--aviso` | `#b45309` | `#f59e0b` |
| `--erro` | `#dc2626` | `#ef4444` |

### Cor de destaque do painel (staff)
```css
--azul:        #2f6bff;
--azul-hover:  #235ce0;
--azul-barra:  rgba(47, 107, 255, 0.30); /* barras de gráfico não-ativas */
```
Fundo de página do painel: `#f4f5f7` (claro) / `#0d0d0f` (escuro) — um
cinza levemente distinto do branco/preto puro dos cards, para os cards
"flutuarem" visualmente.

### Uso da cor
- **Azul** = ação primária no painel (botões, FAB, ícone ativo da nav,
  card de destaque "Agenda de hoje", barras de gráfico, link/progress).
- **Preto/branco** (`--acao`) = ação primária na área pública do cliente.
- **Verde** = sucesso, status "concluído", valores de entrada/comissão.
- **Vermelho** = erro, cancelar, excluir, saída de caixa.
- **Cinza sutil** = metadado, texto secundário, bloqueios/inativo.

---

## 3. Tipografia

| Elemento | Tamanho | Peso | Observação |
|---|---|---|---|
| H1 (título de página) | 28px (32px ≥960px) | 700 | `letter-spacing: -0.03em` |
| H2 (título de card/seção) | 18–19px | 600 | `letter-spacing: -0.02em` |
| Valor grande (hero, KPI) | 26–46px | 700 | `letter-spacing: -0.02em` |
| Corpo | 15–16px | 400–500 | inputs sempre ≥16px (evita zoom no iOS) |
| Label de campo | 11–12px | 600 | UPPERCASE, `letter-spacing: 0.06em`, cor sutil |
| Texto secundário/legenda | 11–13px | 400–500 | cor `--texto-secundario` / `--texto-sutil` |
| Badge/status | 10–12px | 500–600 | UPPERCASE, `letter-spacing: 0.03–0.06em` |

---

## 4. Componentes

### Botões
```
.btn            → padding 12px 20px, radius 8px, font 15px/500
.btn-primario   → fundo --acao (público) ou --azul (painel), texto branco
.btn-secundario → transparente, borda --borda, hover borda --texto-sutil
.btn-perigo     → transparente, texto/hover --erro
.btn-sm         → padding 8px 14px, font 13px
.btn-pill       → radius 999px (CTAs "soltos", chips de ação)
.btn-bloco      → width 100%
```
Todo botão tem `active { transform: scale(0.97) }` — leve feedback de toque.

### Cards
```
.card           → fundo --superficie, borda 1px --borda, radius 12–16px, padding 24px (16px no painel, mais compacto)
.card-link:hover → borda --texto-sutil + --sombra
```
Sub-cards (dentro de um card, ex. Faturamento/Comissão) usam
`--secao-alt` como fundo em vez de borda — cria hierarquia sem duplicar contorno.

### Inputs
```
input/select/textarea → fundo --superficie, borda 1px --borda, radius 8px,
                         padding 12px 14px, font 16px
:focus → borda --acao (sem outline/glow)
```

### Badges / status
Pill pequeno, uppercase, borda da cor do status, texto da cor do status,
fundo transparente — nunca preenchido (mantém o app "leve").
```
status-agendado  → cinza (texto-secundario)
status-concluido → verde
status-cancelado → vermelho
```

### Barra de progresso (métricas)
```
.barra-prog       → trilho 6px, fundo --secao-alt, radius 999px
.barra-prog-fill  → preenchimento --azul
```
Usada em "Ticket médio", "Ocupação", produtividade, retenção — sempre
com o rótulo + valor acima e a legenda pequena abaixo.

### Gráfico de barras semanal ("Ganhos", "Vendas")
```
.semana      → flex row, align-items flex-end, height 92px
.semana-bar  → fundo --azul-barra; a barra "ativa/hoje" vira --azul sólido
.semana-rot  → rótulo 10px, --texto-sutil (o dia ativo fica --texto + 600)
```
Padrão reaproveitado em 3 lugares: Painel (faturamento da semana), Caixa
(ganhos do mês, dividido em semanas) e Equipe (vendas por dia da semana
no período filtrado).

### Avatar / foto de perfil (com upload)
Círculo com inicial (fallback) ou `<img>` `object-fit: cover`, mais um
badge de câmera azul no canto inferior direito, sobreposto com borda da
cor de fundo. Clique abre o seletor de arquivo (input file oculto);
tamanhos usados: 46px (hero do topo), 52–58px (card de equipe).

### Hero do topo do painel (`app-hero`)
Substitui o logo: foto do usuário à esquerda (com upload), nome (19px/700)
+ papel (12px, sutil) ao lado, e dois botões circulares à direita
(alternar tema / sair), 36px, fundo `--superficie`, borda `--borda`.
Fica `position: sticky; top: 0` com fundo sólido da página (não
transparente) para não sobrepor o conteúdo ao rolar.

### Card de destaque azul (hero de KPI)
`.dash-azul` — fundo azul sólido, texto branco, radius 20px. Número
grande (46px/700) + rótulo pequeno acima + rodapé com borda superior
translúcida (`rgba(255,255,255,.22)`) separando um resumo secundário.

### Navegação inferior (bottom nav)
Fixa, `z-index: 50`, fundo `--superficie`, borda superior `--borda`,
5 itens (ícone 22px + rótulo 10px), item ativo em `--azul`. Em telas
largas vira uma barra estreita centralizada com cantos superiores
arredondados (16px).

### Botão flutuante (FAB) — só na tela de Agenda
Círculo 52px, fundo `--azul`, sombra colorida
(`0 6px 18px rgba(47,107,255,.45)`), fixo no canto inferior direito,
acima da bottom nav. Toque abre um menu vertical de 1–2 pills azuis
(mesmas cores, radius 14px) com as ações rápidas da tela.

### Pop-up / bottom-sheet (`.ag-overlay` + `.ag-modal-box`)
Padrão único de modal usado em toda a área do painel (detalhe de
agendamento, bloquear horário, categorias de caixa, detalhe de
barbeiro). Backdrop `rgba(0,0,0,.55)`; no mobile sobe do rodapé
(`align-items: flex-end`, radius só no topo); em ≥600px vira centralizado
com radius nos 4 cantos. Fecha por clique no backdrop, no "×" ou Esc.

### Blocos de agenda (linha do tempo)
Bloco posicionado por horário (`position: absolute`, altura proporcional
à duração), radius 10px, borda 1px `--borda`. Bolinha de status (7px)
no canto superior direito: verde = concluído, azul = agendado, cinza =
cancelado (com nome riscado). Blocos ≤35min colapsam para layout em
linha (nome + horário lado a lado, sem o serviço). Bloqueios usam
padrão diagonal hachurado (`repeating-linear-gradient`) em vez de cor sólida.

---

## 5. Ícones

SVG inline, estilo **stroke** (outline), `stroke-width="2"`,
`stroke-linecap/linejoin="round"`, sem preenchimento — estilo
Feather/Lucide. Tamanhos usuais: 14–16px (dentro de botões/badges),
22px (navegação).

---

## 6. Tema claro/escuro

Toggle manual (ícone sol/lua no hero), salvo em `localStorage` e aplicado
via `[data-tema="escuro"]` no `<html>`. Todo componente é construído em
cima dos tokens (`--fundo`, `--superficie`, `--texto`, `--borda`, etc.),
nunca com cor hardcoded — isso garante que qualquer componente novo
funcione nos dois temas automaticamente, exceto o azul de destaque do
painel e o verde/vermelho de status, que são fixos nos dois temas
(apenas o tom muda ligeiramente para manter contraste).

---

## 7. Tom visual (para prompts de geração de imagem)

> App de gestão para barbearias, estilo mobile-first "app nativo".
> Painel da equipe: fundo cinza muito claro (ou quase preto no escuro),
> cards brancos flutuantes com cantos bem arredondados (16–20px), azul
> vibrante (#2f6bff) como única cor de destaque, tipografia geométrica
> sans-serif bold em títulos e números grandes, ícones outline finos,
> navegação por barra inferior fixa com 5 ícones, sem gradientes nem
> sombras pesadas — visual "clean fintech app" (referências: Linear,
> Vercel, apps bancários modernos). Área pública do cliente: mesma base
> tipográfica, porém monocromática (preto/branco), cards com borda fina
> ao invés de preenchimento colorido, mais "editorial minimal".
