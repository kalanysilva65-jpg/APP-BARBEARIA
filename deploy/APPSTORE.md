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

Não adianta descobrir isso depois de pagar os US$ 99. O que reduz o risco, em
ordem de eficácia:

- **Notificações push nativas** — avisar o barbeiro de um agendamento novo. É a
  funcionalidade que mais claramente justifica ser um app, e é útil de verdade
  aqui. Exige `@capacitor/push-notifications` + Firebase/APNs.
- **Login com Face ID / Touch ID** (`@capacitor/biometric` ou equivalente).
- **Adicionar o atendimento ao calendário do aparelho**, compartilhar via folha
  nativa (`@capacitor/share`), abrir o WhatsApp do cliente direto.

Recomendação honesta: **resolva o push antes de submeter**. Submeter sem nenhuma
integração nativa é apostar os US$ 99 e algumas semanas numa regra que a Apple
aplica com frequência.

A Play Store é bem mais tolerante nesse ponto — se quiser começar por algum
lugar, comece pelo Android.

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
