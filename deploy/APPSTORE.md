# Publicar o Cortavo na App Store (e na Play Store)

O que está pronto neste repositório e o que ainda depende de você.

## O que JÁ está configurado aqui

- `capacitor.config.json` — a casca nativa aponta para `https://cortavo.com.br`.
  O app não embute o site: carrega o servidor. Consequência boa: **corrigir um
  bug no VPS conserta o app instalado**, sem nova revisão da Apple. Consequência
  ruim: sem internet o app não abre (por isso a tela de `capacitor-web/`).
- `capacitor-web/index.html` — tela de "sem conexão", para o usuário offline não
  ver o erro cru do navegador dentro do app.
- `GET /privacidade` — política de privacidade pública, sem login. As duas lojas
  **exigem** essa URL no formulário, e o revisor precisa abri-la sem conta.
  URL final: `https://cortavo.com.br/privacidade`.

## O que você precisa providenciar (não dá para fazer por código)

1. **Conta no Apple Developer Program** — US$ 99/ano, em
   [developer.apple.com/programs](https://developer.apple.com/programs/).
   Pessoa física resolve; empresa (CNPJ) exige verificação e demora mais dias.
2. **Um Mac com Xcode.** É exigência da Apple: só dá para compilar e enviar app
   iOS a partir do macOS. Se você não tem, as saídas são:
   - Mac emprestado por alguns dias (basta para a primeira submissão);
   - Mac na nuvem (MacStadium, MacinCloud) — dezenas de dólares por mês;
   - serviço de build na nuvem (Codemagic, Expo EAS) — compila sem Mac próprio.

## ⚠️ O risco real de rejeição: guideline 4.2

A Apple **rejeita apps que são só um site dentro de uma janela**. É a regra 4.2
("Minimum Functionality"), e é a causa mais comum de reprovação de apps como
este. Um Capacitor apontando para uma URL é exatamente o que ela descreve.

**O que já foi feito contra isso:** notificações push nativas (APNs) — o
barbeiro é avisado no celular quando cai um agendamento. É a funcionalidade que
mais claramente justifica ser um app, e é útil de verdade aqui. Falta ligar as
credenciais (seção abaixo).

Se ainda assim vier rejeição, os próximos candidatos, em ordem de esforço:
Face ID para entrar, adicionar o atendimento ao calendário do aparelho,
compartilhar via folha nativa (`@capacitor/share`).

## Avisos no app (APNs) — o que falta ligar

O código está pronto (`src/services/apns.js`, `public/js/push-nativo.js`); falta
a credencial, que só existe depois da conta de desenvolvedor.

Por que um caminho separado do Web Push que já funciona no navegador: o
Capacitor roda a página num **WKWebView, que não implementa Web Push**. O aviso
que chega no Safari com o site na tela de início fica mudo dentro do app. Daí o
APNs.

**1. Gerar a chave** (Apple Developer → Certificates, Identifiers & Profiles →
   **Keys** → **+**): marque **Apple Push Notifications service (APNs)**,
   registre e baixe o arquivo `.p8`.
   O download acontece **UMA VEZ SÓ** — perdeu, tem que gerar outra. Guarde bem.
   Anote também o **Key ID** (aparece no nome do arquivo) e o **Team ID** (canto
   superior direito do painel).

**2. No Xcode**, na aba **Signing & Capabilities**: adicione **Push
   Notifications** e, em **Background Modes**, marque **Remote notifications**.

**3. Instalar o plugin** (no Mac, junto do `cap add ios`):

```bash
npm install @capacitor/push-notifications
npx cap sync ios
```

**4. No servidor**, envie o `.p8` para fora da pasta de deploy (ela é
   sobrescrita a cada `git pull`) e restrinja o acesso:

```bash
mkdir -p ~/segredos && chmod 700 ~/segredos
# copie o .p8 para ~/segredos/apns.p8 e então:
chmod 600 ~/segredos/apns.p8
```

**5. Adicionar ao `~/app/.env`** (trocando pelos seus valores):

```
APNS_KEY_PATH=/home/cortavo/segredos/apns.p8
APNS_KEY_ID=SEU_KEY_ID
APNS_TEAM_ID=SEU_TEAM_ID
APNS_BUNDLE_ID=br.com.cortavo.app
APNS_PRODUCTION=false
```

`APNS_PRODUCTION=false` enquanto você testa por TestFlight/Xcode; vira `true`
quando o app sair na App Store. **Errar isso é a causa nº 1 de "o push não
chega"**: token de build de teste não funciona no servidor de produção da Apple,
e vice-versa.

Depois, `sudo systemctl restart cortavo`.

**6. Testar**: abra o app no iPhone, aceite a permissão, entre no painel. O
   token é registrado sozinho. Confira no servidor:

```bash
sqlite3 ~/cortavo-data/app.db "SELECT id, plataforma, substr(endpoint,1,12) || '...' FROM dispositivos_push;"
```

Aparecendo uma linha `ios`, use o botão **Enviar teste** no Perfil.

Sem essas variáveis o servidor sobe igual e os aparelhos iOS ficam guardados
esperando — nada quebra, os avisos só não saem.

## Passo a passo, quando tiver conta e Mac

No Mac, com o repositório clonado:

```bash
npm install
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios
```

`npx cap add ios` precisa rodar **no Mac** — ele instala dependências via
CocoaPods, que não existe no Windows. Por isso a pasta `ios/` não está
versionada aqui: gerada no Windows sairia quebrada.

No Xcode:

1. **Signing & Capabilities** → escolha seu Team (a conta de desenvolvedor).
2. **Ícone**: use `public/icon-512.png` como base. O Xcode pede vários tamanhos;
   qualquer gerador de "App Icon Set" resolve.
3. **Display Name**: `Cortavo`.
4. **Deployment Target**: iOS 14 ou superior.

Depois, em [App Store Connect](https://appstoreconnect.apple.com):

1. **My Apps → +** → novo app, bundle ID `br.com.cortavo.app`.
2. **Capturas de tela**: obrigatórias para iPhone 6.7" e 6.5". Tire do simulador
   do Xcode ou de um iPhone real.
3. **Privacy Policy URL**: `https://cortavo.com.br/privacidade`.
4. **App Privacy**: declare o que a política diz — nome, e-mail, telefone e
   histórico de agendamentos, vinculados ao usuário, usados só para operar o
   serviço. Não declare rastreamento (o app não rastreia).
5. **Conta de teste para o revisor** (campo "Sign-In Information"): a Apple
   testa o app logado. Crie um usuário só para isso — **não** entregue a conta
   real do Bruno.
6. No Xcode: **Product → Archive → Distribute App**.

Revisão costuma levar de 1 a 3 dias.

## Antes de submeter

- [ ] Trocar as senhas padrão do seed (`dono123`, `admin123`) — pendência antiga.
- [ ] Criar o usuário de teste para o revisor da Apple.
- [ ] Revisar `/privacidade` com um advogado. O texto de lá é um rascunho
      técnico honesto do que o app faz, não parecer jurídico.
- [ ] Decidir sobre o push (ver guideline 4.2 acima).

## Se o bundle ID mudar

`br.com.cortavo.app` está gravado em `capacitor.config.json`. **Depois de
publicado, o bundle ID não pode ser alterado** — mudá-lo cria outro app na loja,
do zero. Se for para mudar, mude agora.
