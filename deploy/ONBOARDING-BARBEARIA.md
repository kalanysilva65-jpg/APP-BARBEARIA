# Onboarding de uma barbearia nova (WhatsApp + cobrança centralizada)

A Cortavo é **Tech Provider** na Meta: não tem linha de crédito para compartilhar.
Cada barbearia conecta o PRÓPRIO WhatsApp (coexistência), e a conta de WhatsApp
Business (WABA) é **dela**. Para a cobrança da Meta cair no **cartão da Cortavo**,
o cartão da Cortavo é cadastrado manualmente na conta de cada barbearia.

> Desde **01/10/2026** a Meta cobra as respostas (IA/equipe via API) acima de
> **1.000 por número/mês** (~R$0,035 cada) e todo lembrete (template).
> **Conta SEM forma de pagamento = a Meta para de entregar as respostas.**
> Por isso o passo 4 é OBRIGATÓRIO antes de ligar a secretária.

## 1. Antes (no Cortavo)
- [ ] Barbearia criada no painel-mestre, com admin.
- [ ] Serviços + preços cadastrados.
- [ ] Barbeiros com **horário de trabalho** (é daí que a secretária tira os horários livres).

## 2. Pré-requisitos do número
- [ ] Número usado no **WhatsApp Business** (app) há **7+ dias**, app atualizado.
- [ ] Celular do número em mãos (o popup pede confirmação por ele).

## 3. Conectar
1. Logado como admin da barbearia → **Secretária** → **Conectar WhatsApp**.
2. No popup: conectar o **WhatsApp Business existente** (não criar número novo) e confirmar no celular.
3. A tela volta como **Conectado** com o número.

## 4. Cartão da Cortavo na conta da barbearia (cobrança centralizada)
1. O dono da barbearia abre **business.facebook.com** → **Configurações** → **Usuários → Pessoas**
   e **adiciona a conta da Cortavo** (kalanysilva65@gmail.com) com **acesso total (admin)**.
2. A Cortavo aceita o convite, troca para o portfólio da barbearia e vai em
   **Contas do WhatsApp** → conta dela → **Configurações de pagamento** (ou WhatsApp Manager → **Cobrança**).
3. **Adicionar forma de pagamento** → cartão da Cortavo → salvar.
4. Conferir que aparece como **ativo** (pode levar alguns minutos para propagar;
   o erro 131042 nos primeiros envios é esse atraso).

> Se a barbearia sair: remover o cartão da conta dela e sair do portfólio.

## 5. Testar
- [ ] De outro celular, mandar "Oi, quero marcar um corte amanhã".
- [ ] A mensagem aparece em **Conversas** e a secretária responde.
- [ ] A resposta aparece também no app WhatsApp Business do barbeiro (sincronização).

## 6. Lembretes (ainda manual)
O template `lembrete_agendamento` precisa existir e estar **aprovado na WABA da barbearia**
(WhatsApp Manager → Modelos → Utilidade, pt_BR, mesmas 3 variáveis: nome, barbearia, hora).
Enquanto não aprovar, a conversa funciona; só o lembrete não sai.

## 7. Acompanhar o custo
Painel-mestre → **Uso & custos** → coluna **WhatsApp msgs (pagas) · lembr.**
- Linha **laranja** = passou de 80% das 1.000 grátis no mês.
- O custo da Meta já entra em **Custo** e **Margem**.
- Para economizar mensagens: ligar `SECRETARIA_DEBOUNCE_MS=8000` no `.env` (agrupa rajadas numa resposta só).
