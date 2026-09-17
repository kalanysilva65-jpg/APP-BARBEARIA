# Ligar a Secretária de IA no WhatsApp (Cloud API da Meta)

Guia passo a passo para conectar o WhatsApp à secretária de IA do Cortavo.
Começamos pelo **NÚMERO DE TESTE gratuito da Meta** (valida tudo sem risco);
depois migra para um número real. O código do lado do servidor **já está pronto**
(webhook em `/webhooks/whatsapp` + envio pela Cloud API); aqui é só a configuração
na Meta + colar as credenciais.

`appId` do app iOS/Android é `br.com.cortavo.app`, mas o app da Meta é OUTRA coisa
(um "app de desenvolvedor" só para a API do WhatsApp) — não confunda os dois.

---

## Como funciona (resumo técnico)

- A Meta chama nosso **webhook** (`https://cortavo.com.br/webhooks/whatsapp`) toda vez
  que um cliente manda mensagem.
- O servidor descobre a barbearia pelo **phone_number_id** da mensagem, roda a
  secretária de IA e **responde pela Cloud API**.
- As credenciais são **por barbearia** (multi-tenant), guardadas na tabela
  `Configuracao`:
  - `whatsapp_phone_number_id` → identifica o número/barbearia
  - `whatsapp_token` → token de acesso para enviar
- Duas variáveis **globais** ficam no `.env` do VPS:
  - `WHATSAPP_VERIFY_TOKEN` → um segredo que NÓS inventamos (handshake do webhook)
  - `META_APP_SECRET` → o "App Secret" do app da Meta (confere a assinatura dos POSTs)

---

## Pré-requisitos
- Uma conta no **Facebook** (pessoal) — a Meta exige para criar o app.
- Acesso a **developers.facebook.com** e **business.facebook.com** (grátis).

---

## Passo 0 — Conta de desenvolvedor Meta
1. Acesse **developers.facebook.com** e entre com o Facebook.
2. Se pedir, clique em **Começar / Get Started** e registre-se como desenvolvedor
   (aceitar termos + verificar por e-mail/telefone).

## Passo 1 — Criar o app
1. **developers.facebook.com/apps** → **Criar app**.
2. Em "Caso de uso", escolha **Outro** → avançar → tipo **Empresa (Business)**.
3. Nome do app: `Cortavo` (nome interno, só você vê). E-mail de contato.
4. Vincule/crie a **Conta comercial (Meta Business)**. Criar app.

## Passo 2 — Adicionar o produto WhatsApp
1. No painel do app → **Adicionar produtos** → **WhatsApp** → **Configurar**.
2. Ele cria uma **conta do WhatsApp Business (WABA)** e já entrega um **número de teste**.

## Passo 3 — Pegar as credenciais de teste
No menu **WhatsApp → Configuração da API** você vê:
- **Número de teste** (o "De") e o **ID do número de telefone** (Phone number ID) — **copie**.
- **Token de acesso temporário** (vale 24h) — **copie** (serve pro 1º teste).
- **ID da conta do WhatsApp Business** (WABA ID) — anote.

E adicione o **destinatário de teste**: em "Para", coloque **o seu número de WhatsApp**
(pode adicionar até 5) e confirme o código que a Meta enviar. Só esses números podem
trocar mensagem enquanto estiver em teste.

## Passo 4 — Pegar o App Secret
1. **Configurações do app → Básico**.
2. Copie o **Chave secreta do app (App Secret)** (clique em "Mostrar").

## Passo 5 — Pôr as credenciais no servidor

### 5a) As duas variáveis globais no `.env` do VPS
> `WHATSAPP_VERIFY_TOKEN` você inventa (qualquer texto aleatório, ex.: gere com
> `openssl rand -hex 16`). Guarde, pois vai digitá-lo na Meta no Passo 6.

No SSH do VPS, edite o `.env` com o nano (uma variável por linha):
```bash
sudo -u cortavo nano /home/cortavo/app/.env
```
Adicione (troque pelos seus valores, sem aspas, sem espaço no `=`):
```
WHATSAPP_VERIFY_TOKEN=um-segredo-aleatorio-que-voce-inventou
META_APP_SECRET=o-app-secret-do-passo-4
```
Salve (Ctrl+O, Enter) e saia (Ctrl+X). **NÃO reinicie ainda** (falta o Passo 6 pra
verificar o webhook, mas o verify token já precisa estar salvo). Reinicie agora:
```bash
sudo systemctl restart cortavo
```

### 5b) As credenciais da barbearia (phone_number_id + token)
Ainda no VPS, rode este comando trocando os DOIS valores pelos do Passo 3
(barbearia 1 = a piloto; ajuste o id se for outra):
```bash
cd /home/cortavo/app && sudo -u cortavo node -e "const p=require('./src/config/db');(async()=>{const B=1;const set=async(k,v)=>p.configuracao.upsert({where:{barbeariaId_chave:{barbeariaId:B,chave:k}},create:{barbeariaId:B,chave:k,valor:v},update:{valor:v}});await set('whatsapp_phone_number_id',process.env.PNID);await set('whatsapp_token',process.env.WT);console.log('credenciais gravadas na barbearia',B);await p.\$disconnect();})()" 
```
> Cole os valores ANTES, na mesma linha, assim (o `PNID` é o ID do número; o `WT` é o token):
> ```bash
> PNID='000000000000000' WT='EAAG...seu-token...' node -e "..."   # (use o comando acima inteiro após o WT='...')
> ```
> Ou, mais simples, use o nano num script — o importante é gravar as duas chaves.
> (Em breve dá pra fazer isso pela tela **Secretária** do painel, sem terminal.)

## Passo 6 — Configurar o Webhook na Meta
1. **WhatsApp → Configuração** → seção **Webhook** → **Editar**.
2. **URL de callback:** `https://cortavo.com.br/webhooks/whatsapp`
3. **Token de verificação:** o MESMO valor de `WHATSAPP_VERIFY_TOKEN` do Passo 5a.
4. Clique **Verificar e salvar** → a Meta chama nosso servidor e valida (se der erro,
   confira a URL e se o serviço reiniciou com o token no `.env`).
5. Ainda ali, em **Gerenciar** os campos do webhook, **assine o campo `messages`**.

## Passo 7 — Testar 🎉
1. Confirme que o serviço reiniciou depois dos Passos 5 e 6.
2. Salve o **número de teste** (o "De" do Passo 3) nos contatos do seu celular.
3. Do seu WhatsApp (um número que você cadastrou como destinatário no Passo 3),
   **mande uma mensagem** para o número de teste, ex.: *"Oi, qual o horário de vocês?"*.
4. A secretária de IA deve **responder sozinha** no seu WhatsApp. As conversas
   aparecem em **Painel → Conversas**.

Se não responder, veja os logs no VPS:
```bash
sudo journalctl -u cortavo -n 80 --no-pager | grep -iE 'whatsapp|webhook|secretaria|erro'
```

---

## Token PERMANENTE (fazer antes de usar pra valer)
O token do Passo 3 expira em 24h. Para um token que não expira:
1. **business.facebook.com** → **Configurações do negócio** → **Usuários → Usuários do sistema**.
2. **Adicionar** um usuário do sistema (função Admin). 
3. Em **Adicionar ativos**, dê a ele acesso ao **app** e à **conta do WhatsApp (WABA)**.
4. **Gerar novo token** → escolha o app → marque as permissões
   **whatsapp_business_messaging** e **whatsapp_business_management** → gerar.
5. Copie o token e regrave o `whatsapp_token` da barbearia (Passo 5b) com ele.

---

## Ir para PRODUÇÃO (número real) — depois do teste
- Adicionar um **número real** ao WABA (número que NÃO esteja num WhatsApp ativo, OU
  usar **coexistência** para manter o WhatsApp Business atual do barbeiro).
- **Verificação da empresa (Business Verification)** e, para o número self-serve de
  terceiros, **Revisão do app (App Review)** com as permissões acima.
- Publicar o app (sair do modo Desenvolvimento).
- Coexistência (manter o app do barbeiro + API no mesmo número) usa o fluxo de
  **Embedded Signup** — é a etapa de ESCALA, feita depois do piloto funcionando.

## Custos (Meta), resumo
- Desde jul/2025 a cobrança é **por mensagem**.
- **Mensagens de atendimento** (o cliente iniciou; dentro de 24h) → **grátis**.
- **Templates** (mensagem que NÓS iniciamos, fora das 24h) → têm custo (utilidade
  ~R$0,04–0,05; marketing mais caro). A secretária responde dentro das 24h, então o
  uso normal cai na faixa grátis.

## Lembretes automáticos de agendamento

Manda um lembrete pro cliente **1h antes** (configurável) do horário. Reduz falta.
É mensagem que a barbearia INICIA → precisa de **template aprovado** e tem **custo
baixo** (utilidade ~R$0,04–0,08). Quem responde o lembrete cai na secretária, na
janela grátis de 24h.

### 1) Criar o template na Meta
1. **business.facebook.com** → **WhatsApp Manager** → **Modelos de mensagem** →
   **Criar modelo**.
2. Categoria **Utilidade (Utility)**, idioma **Português (BR)** (`pt_BR`).
3. Nome (só letras minúsculas e `_`), ex.: **`lembrete_agendamento`**.
4. **Corpo** com 3 variáveis, nesta ordem — {{1}} nome, {{2}} barbearia, {{3}} hora:
   > Oi {{1}}! Passando pra lembrar do seu horário na {{2}} hoje às {{3}}. 🙂 Se precisar remarcar ou cancelar, é só responder por aqui.
5. Enviar → aguardar **aprovação** (de minutos a ~1 dia).

### 2) Ligar no painel
Painel da barbearia → **Secretária** → seção **"Lembretes automáticos"**:
- marque **ativar**, ponha o **nome do template** (ex.: `lembrete_agendamento`) e a
  **antecedência** (padrão **60** min). Salvar.
- Requer o **WhatsApp conectado** (mesma tela).

### 3) Como funciona por trás
- `src/services/lembretes.js` roda a cada 5 min, acha os agendamentos `agendado`
  que começam dentro da antecedência e ainda sem lembrete, e dispara o template
  (`whatsapp.enviarTemplate`). Marca `agendamentos.lembrete_enviado_em` pra não
  repetir. Só age nas barbearias que ligaram (`lembretes_ativos`).
- **Deploy exige rodar a migração** (coluna nova): no VPS,
  `cd /home/cortavo/app && sudo -u cortavo npx prisma migrate deploy && sudo systemctl restart cortavo`.

## Segurança (já embutida no código)
- O `POST` do webhook só é aceito com **assinatura válida** (HMAC com o App Secret).
- Cada mensagem é ligada à barbearia certa pelo **phone_number_id** (multi-tenant).
- As proteções da secretária continuam valendo: opt-out "SAIR", teto mensal por
  barbearia, freio anti-flood, FAQ sem custo, e o aviso de privacidade (LGPD).

---

# Coexistência (Embedded Signup) — o barbeiro conecta o número dele sozinho

Este é o fluxo de **produção/escala**: cada barbearia clica em **"Conectar WhatsApp"**
na tela **Secretária** do painel, faz login com o Facebook num **popup da Meta**, e
o **número que ela já usa** fica ligado à IA — **sem perder o app do WhatsApp Business**
(coexistência). O código já está pronto (`src/services/whatsappOnboard.js` +
`/painel/secretaria/whatsapp/conectar`); falta só configurar o lado da Meta **uma vez**.

## Como funciona (resumo)
1. O popup devolve um `code` + o `waba_id` + o `phone_number_id`.
2. O servidor troca o `code` por um **token de acesso aos ativos do cliente** (usa o
   App Secret — nunca vai pro navegador).
3. Inscreve o nosso app na **WABA** do cliente (o `subscribed_apps`, automático).
4. Registra o número (best-effort) e **grava `whatsapp_phone_number_id` + `whatsapp_token`**
   na `Configuracao` daquela barbearia. Pronto: a secretária já atende naquele número.

## Passo A — Facebook Login for Business (no app da Meta)
1. **developers.facebook.com** → seu app **Cortavo** → **Adicionar produto** →
   **Login do Facebook para empresas** → configurar.
2. Em **Configurações** do Login, adicione o **URI de redirecionamento OAuth válido**:
   `https://cortavo.com.br/painel/secretaria` (e o domínio `cortavo.com.br` em
   "Domínios do app", na tela Básico).

## Passo B — Criar a configuração de Embedded Signup (pega o config_id)
1. Ainda no app → **WhatsApp** → **Embedded Signup** (ou "Configurações" do Login for
   Business → "Configurações" → criar uma **configuração**).
2. Crie uma configuração para o caso **"Onboard WhatsApp Business app users"**
   (COEXISTÊNCIA) — é o que mantém o app do barbeiro.
3. Copie o **ID da configuração** (`config_id`).

## Passo C — Variáveis no `.env` do VPS
```
META_APP_ID=983478401432377          # (o "ID do Aplicativo", é público)
WHATSAPP_ES_CONFIG_ID=xxxxxxxxxxxxx  # o config_id do Passo B
# META_APP_SECRET e WHATSAPP_API_VERSION você já tem dos passos anteriores.
```
Reinicie: `sudo systemctl restart cortavo`. Aí o botão **"Conectar WhatsApp"** aparece
na tela **Secretária** (só admin).

## Passo D — App Review (para atender barbearias de verdade)
Enquanto o app está em **Desenvolvimento**, só contas com papel no app (admin/testador)
conseguem conectar. Para **qualquer** barbearia se conectar sozinha, o app precisa de
**Acesso Avançado** às permissões **whatsapp_business_messaging** e
**whatsapp_business_management** (via **App Review**) e ser **publicado**. Isso é a
etapa final de escala — dá pra testar o fluxo inteiro antes disso com a sua própria conta.

## Pré-requisitos do NÚMERO do barbeiro (coexistência)
- WhatsApp **Business app** atualizado (v2.24.17+).
- O número precisa ter alguns dias de uso; o barbeiro confirma um código no app dele
  durante o popup. Depois, app do barbeiro **e** IA convivem no mesmo número.
