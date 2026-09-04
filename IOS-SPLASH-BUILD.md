# iOS — matar a "tela preta de 2s" na abertura (build no Mac)

**Problema:** ao abrir o app aparece ~2s de tela **preta** e só depois o splash CORTAVO.
Causa: o app é um casco que carrega `cortavo.com.br` de fora. Entre o launch e o 1º
paint da página remota, a WKWebView mostra o **fundo preto** padrão. O servidor
responde em ~0,1–0,3s — o preto é 100% do lado nativo, não da rede.

O que já foi feito no repo (sincroniza pro Mac via `npx cap sync`):

- `capacitor.config.json`: `ios.backgroundColor` e `android.backgroundColor` = `#ffffff`
  (fundo da webview branco → some o preto durante a carga) + plugin `SplashScreen`
  com `launchAutoHide: false` e fundo branco (o splash nativo segura até a página pintar).
- `src/views/partials/splash.ejs`: assim que o splash HTML branco pinta, ele chama
  `SplashScreen.hide()` — entrega nativo→HTML sem corte. É no-op no navegador.

## Passos no Mac (Xcode)

1. Instalar o plugin no projeto Capacitor (onde ficam as deps `@capacitor/*`):
   ```bash
   npm i @capacitor/splash-screen
   ```

2. Sincronizar a config e o plugin pro projeto iOS:
   ```bash
   npx cap sync ios
   ```

3. **Launch Screen branca** (é o que o iOS mostra no 1º instante, antes até do
   splash do plugin). Em `ios/App/App/`, abrir `LaunchScreen.storyboard` no Xcode e
   deixar o fundo **branco** (`#FFFFFF`). Ideal: centralizar o wordmark "CORTAVO"
   preto pra casar com o splash HTML — mas só o fundo branco já elimina o preto.

4. (Opcional, recomendado) Imagem do splash do plugin branca: gerar/registrar um
   `Splash` branco nos assets do app (Assets.xcassets → Splash) pra o splash nativo
   ser branco liso enquanto a página carrega.

5. Rodar no dispositivo e conferir a abertura a frio:
   - launch → **branco** (Launch Screen) → splash nativo **branco** → splash HTML
     CORTAVO → app. **Sem preto e sem piscada.**

## De brinde neste mesmo build

Este build também aplica o `ios.contentInset: "never"` (já na config), que corrige a
**faixa cinza embaixo** e o **espaço branco em cima** dos pop-ups no iOS — pendência
antiga que só se resolve recompilando.

## Se ainda aparecer preto

- Confirmar que o `npx cap sync ios` rodou **depois** de instalar o plugin (senão o
  `launchAutoHide:false` não vai pro nativo e o splash some cedo demais).
- Conferir no Xcode que a cor de fundo da view raiz / WKWebView é branca (o
  `ios.backgroundColor` cobre isso, mas um tema escuro do template pode sobrescrever).
