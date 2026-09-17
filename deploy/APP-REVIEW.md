# App Review da Meta — WhatsApp (Provedor de Tecnologia) — Checklist

Para as barbearias se conectarem **sozinhas** (coexistência), o app precisa de
**Acesso Avançado** às permissões `whatsapp_business_messaging` e
`whatsapp_business_management` — o que passa por **App Review** e por **publicar**
o app. Este é o passo de ESCALA. Enquanto não aprova, só contas com papel no app
(admin/testador) conectam — o que já serve pro piloto.

## 0. Pré-requisitos (já feitos ✅)
- [x] Verificação da empresa (Business Verification) — **aprovada**.
- [x] Independent Tech Provider — iniciado.
- [x] Embedded Signup — configuração criada (`config_id = 963545223434692`).
- [x] JS SDK habilitado + domínio `https://cortavo.com.br` autorizado.

## 1. Configurações básicas do app (resolve o aviso vermelho "Não qualificado")
developers.facebook.com → app **Cortavo** → **Configurações do app → Básico**:
- [ ] **Ícone do app (1024×1024)** — logo da Cortavo, quadrado, PNG/JPG ≤ 5 MB.
- [ ] **URL da Política de Privacidade** — página pública (ex.: `https://cortavo.com.br/privacidade`).
- [ ] **Categoria** — escolher uma (ex.: "Empresa" / "Produtividade").
- [ ] **Domínios do aplicativo** — `cortavo.com.br`.
- [ ] **URL dos Termos de Serviço** — (recomendado) `https://cortavo.com.br/termos`.
- [ ] Salvar.

## 2. Justificativas das permissões (texto que a Meta pede no App Review)
Cole algo assim (ajuste ao gosto):

**whatsapp_business_messaging**
> A Cortavo é uma plataforma de gestão para barbearias. Com esta permissão,
> atendemos os clientes das barbearias pelo WhatsApp: uma secretária de IA
> responde dúvidas, agenda e remarca horários — sempre em nome da barbearia
> (nosso cliente empresarial) e dentro da janela de atendimento iniciada pelo
> cliente.

**whatsapp_business_management**
> Usamos para o onboarding e a gestão dos ativos de WhatsApp das barbearias que
> contratam a Cortavo: registrar o número, inscrever o webhook e gerenciar as
> configurações da conta do WhatsApp Business delas — tudo via Embedded Signup,
> autorizado pelo próprio dono da barbearia.

## 3. Vídeos de evidência (screencasts) ⚠️ precisam de um número REAL conectado
> Estes vídeos mostram o app **usando** a permissão de verdade. Só dá pra gravar
> DEPOIS de conectar um número real (coexistência ou Etapa 2). Ordem prática:
> **conseguir o número → conectar → gravar os vídeos → submeter.**

- [ ] **Vídeo 1 — `whatsapp_business_messaging`**: mostrar o app (a **Caixa de
  entrada / Conversas** do Cortavo, ou a secretária respondendo) **enviando** uma
  mensagem para um número, **e** o **WhatsApp** (app do celular ou web) daquele
  número **recebendo** a mesma mensagem. Fluxo completo, sem cortes.
- [ ] **Vídeo 2 — `whatsapp_business_management`**: uma **chamada de teste da API
  criando um modelo de mensagem (template)** — vídeo separado. (A Meta também
  costuma aceitar mostrar o **Embedded Signup conectando** uma conta.)

Dicas: tela nítida, mostrar as URLs/telas, narração ou legenda do que está
acontecendo, sem edição que "pule" etapas.

## 4. Submeter e publicar
- [ ] App Review → revisar permissões + anexar vídeos + justificativas → **Enviar**.
      Análise costuma levar de horas a alguns dias.
- [ ] Depois de **aprovado**: **Publicar** o app (sair do modo Desenvolvimento) para
      barbearias de fora se conectarem.

## Estado atual
- O código da coexistência está pronto (botão "Conectar WhatsApp" na tela
  Secretária, `src/services/whatsappOnboard.js`). Ver [WHATSAPP.md](./WHATSAPP.md).
- Gargalo real: (1) **um número de WhatsApp real** para conectar/testar e gravar os
  vídeos; (2) **App Review** aprovado para liberar o autoatendimento das barbearias.
