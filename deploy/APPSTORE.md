# Publicar o Cortavo na App Store

Guia de execução. Cada passo é uma coisa para fazer, na ordem em que precisa
ser feita.

## O que já está pronto no repositório

- `capacitor.config.json` — a casca nativa aponta para `https://cortavo.com.br`.
  O app não embute o site: carrega o servidor. Consequência boa: **corrigir um
  bug no VPS conserta o app já instalado**, sem passar por nova revisão da
  Apple. Consequência ruim: sem internet o app não abre — por isso a tela de
  `capacitor-web/`.
- `capacitor-web/index.html` — tela de "sem conexão", para o usuário offline
  não ver o erro cru do navegador dentro do app.
- `GET /privacidade` — política pública, sem login. As duas lojas **exigem**
  essa URL, e o revisor precisa abri-la sem conta.
  Final: `https://cortavo.com.br/privacidade`.
- `design/icone-1024-appstore.png` — ícone 1024×1024, RGB **sem canal alfa**
  (a App Store rejeita PNG com transparência no ícone).
- `deploy/conta-revisor-apple.js` — cria a conta de demonstração para o revisor
  (ver passo 1).
- APNs no servidor: `src/services/apns.js` e `public/js/push-nativo.js`.
  Falta só a credencial, que só existe depois da conta de desenvolvedor.

## ⚠️ O risco real de rejeição: guideline 4.2

A Apple **rejeita apps que são só um site dentro de uma janela**. É a regra 4.2
("Minimum Functionality"), e é a causa mais comum de reprovação de apps como
este. Um Capacitor apontando para uma URL é exatamente o que ela descreve.

**O que já foi feito contra isso:** notificações push nativas (APNs) — o
barbeiro é avisado no celular quando cai um agendamento, com o app fechado.
É a funcionalidade que mais claramente justifica ser um app, e é útil de
verdade aqui. **Não pule o passo 4.**

Se ainda assim vier rejeição, os próximos candidatos, em ordem de esforço:
Face ID para entrar, adicionar o atendimento ao calendário do aparelho,
compartilhar via folha nativa (`@capacitor/share`).

---

## Passo 1 — Conta de demonstração para o revisor (no VPS)

A Apple testa o app **logado**. O formulário tem um campo obrigatório
"Sign-In Information", e sem uma conta que funcione a rejeição é automática.

**Não entregue a conta do Bruno.** O revisor conclui, cancela e apaga coisas —
e a tela de Clientes mostra nome e telefone de pessoas reais. Isso é vazamento
de dado pessoal, e contradiz a política de privacidade que declaramos no mesmo
formulário.

No servidor:

```bash
cd ~/app && node deploy/conta-revisor-apple.js
```

Cria a "Barbearia Demonstração" com gente inventada: 10 atendimentos
concluídos, 5 agendados, 6 clientes, catálogo, estoque com um alerta e caixa
batendo com os atendimentos. Painel cheio, que é o que evita a queixa de
"conteúdo insuficiente".

A barbearia nasce com `ativo = false` de propósito: isso **não** bloqueia o
login no painel, mas some com ela da listagem do app do cliente e do
agendamento público. Nenhum cliente real vai esbarrar numa barbearia de
mentira.

A senha é sorteada e **impressa uma única vez** — anote. Depois de publicar,
`node deploy/conta-revisor-apple.js --remover` apaga tudo.

## Passo 2 — Preparar o projeto iOS (no Mac)

```bash
git clone https://github.com/kalanysilva65-jpg/cortavo.git
cd cortavo
npm install --ignore-scripts
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/push-notifications
npx cap add ios
npx cap sync ios
npx cap open ios
```

**`--ignore-scripts` no primeiro `npm install` não é opcional.** O
`postinstall` deste projeto roda `prisma migrate deploy` e o seed — ele quer um
banco e um `.env` que no Mac não existem, e aborta a instalação inteira. Você
não precisa do servidor no Mac: só do Capacitor.

`npx cap add ios` **tem que rodar no Mac** — instala dependências via
CocoaPods, que não existe no Windows. Por isso a pasta `ios/` não estava no
repositório: gerada no Windows sairia quebrada.

## Passo 3 — Configurar no Xcode

1. **Signing & Capabilities** → escolha seu Team. Deixe "Automatically manage
   signing" ligado.
2. Ainda em Capabilities, **+ Capability** → **Push Notifications**.
3. **+ Capability** → **Background Modes** → marque **Remote notifications**.
4. **Ícone**: no painel esquerdo, `App > Assets > AppIcon`. Do Xcode 14 em
   diante basta **um** arquivo de 1024×1024 — arraste
   `design/icone-1024-appstore.png` para o slot único. Não precisa de gerador
   de tamanhos.
5. **Display Name**: `Cortavo`. **Deployment Target**: iOS 14 ou superior.
6. No `Info.plist`, adicione `ITSAppUsesNonExemptEncryption` = `NO`
   (Boolean). Sem isso, o App Store Connect faz a pergunta de conformidade de
   exportação **a cada envio**, e o build fica parado até você responder. `NO`
   é a resposta correta aqui: o app só usa HTTPS, que é isento.

## Passo 4 — Ligar os avisos (APNs)

O código do servidor está pronto; falta a credencial.

Por que um caminho separado do Web Push que já funciona no navegador: o
Capacitor roda a página num **WKWebView, que não implementa Web Push**. O aviso
que chega no Safari com o site na tela de início fica mudo dentro do app.

**4.1 — Gerar a chave.** Apple Developer → Certificates, Identifiers &
Profiles → **Keys** → **+**. Marque **Apple Push Notifications service
(APNs)**, registre e baixe o `.p8`.
O download acontece **UMA VEZ SÓ** — perdeu, tem que gerar outra. Anote o
**Key ID** (está no nome do arquivo) e o **Team ID** (canto superior direito
do painel).

**4.2 — Guardar no servidor**, fora da pasta de deploy (ela é sobrescrita a
cada `git pull`):

```bash
mkdir -p ~/segredos && chmod 700 ~/segredos
# copie o .p8 para ~/segredos/apns.p8 e então:
chmod 600 ~/segredos/apns.p8
```

**4.3 — Adicionar ao `~/app/.env`:**

```
APNS_KEY_PATH=/home/cortavo/segredos/apns.p8
APNS_KEY_ID=SEU_KEY_ID
APNS_TEAM_ID=SEU_TEAM_ID
APNS_BUNDLE_ID=br.com.cortavo.app
APNS_PRODUCTION=false
```

**Errar `APNS_PRODUCTION` é a causa nº 1 de "o push não chega"**, e a regra não
é a intuitiva. Quem decide o ambiente não é "estou testando ou publicando" — é
o **perfil de assinatura** com que o app foi compilado, via a entitlement
`aps-environment`:

| Como o app chegou no iPhone | Ambiente APNs | `APNS_PRODUCTION` |
|---|---|---|
| Rodado direto do Xcode (perfil de desenvolvimento) | sandbox | `false` |
| **TestFlight** (perfil de distribuição) | **produção** | **`true`** |
| App Store | produção | `true` |

Ou seja: **TestFlight já usa o servidor de produção da Apple**. Um token de
TestFlight enviado para o sandbox volta como `BadDeviceToken`, e o aviso
simplesmente não sai — sem erro visível no app.

Como você vai testar primeiro rodando do Xcode no seu iPhone, comece com
`false` e mude para `true` antes de mandar para o TestFlight.

Depois de qualquer troca, `sudo systemctl restart cortavo`.

**4.4 — Testar.** Abra o app no iPhone, aceite a permissão, entre no painel.
O token é registrado sozinho:

```bash
sqlite3 ~/cortavo-data/app.db "SELECT id, plataforma, substr(endpoint,1,12) || '...' FROM dispositivos_push;"
```

Aparecendo uma linha `ios`, use o botão **Enviar teste** no Perfil.

Sem essas variáveis o servidor sobe igual e os aparelhos iOS ficam guardados
esperando — nada quebra, os avisos só não saem.

## Passo 5 — App Store Connect

1. **My Apps → +** → novo app, bundle ID `br.com.cortavo.app`.
2. **Capturas de tela**: obrigatórias para iPhone 6.7" e 6.5". Tire do
   simulador do Xcode, logado na conta de demonstração do passo 1.
3. **Privacy Policy URL**: `https://cortavo.com.br/privacidade`.
4. **App Privacy**: declare o que a política diz — nome, e-mail, telefone e
   histórico de agendamentos, vinculados ao usuário, usados só para operar o
   serviço. **Não** declare rastreamento: o app não rastreia.
5. **Sign-In Information**: o e-mail e a senha impressos no passo 1.
6. **Notes for Review**: vale escrever, em inglês, que o app é a ferramenta de
   gestão que barbearias usam para operar (agenda, caixa, comissões,
   estoque) e que recebe avisos push de novos agendamentos. É onde você
   responde a 4.2 antes de ser perguntado.
7. No Xcode: **Product → Archive → Distribute App**.

Revisão costuma levar de 1 a 3 dias.

---

## Antes de apertar "Submit"

- [ ] Trocar as senhas padrão do seed (`dono123`, `admin123`) — pendência
      antiga, e agora tem gente de fora com acesso ao sistema.
- [ ] Rodar o passo 1 e guardar a senha.
- [ ] Revisar `/privacidade` com um advogado. O texto de lá é um rascunho
      técnico honesto do que o app faz, não parecer jurídico.
- [ ] Confirmar que o push chega no iPhone (passo 4.4).

## Se o bundle ID mudar

`br.com.cortavo.app` está gravado em `capacitor.config.json`. **Depois de
publicado, o bundle ID não pode ser alterado** — mudá-lo cria outro app na
loja, do zero. Se for para mudar, mude agora.

## Sobre a pasta `ios/`

Passa a ser versionada, **menos** `Pods/`, `build/` e os `xcuserdata` (ver
`.gitignore`). O motivo: assinatura, capabilities e ícone ficam gravados no
projeto do Xcode, e sem versionar isso tudo se perde a cada `npx cap add ios`.
O que fica de fora é o que o CocoaPods e o Xcode regeneram sozinhos — e que
pesaria centenas de MB no repositório que o VPS puxa.
