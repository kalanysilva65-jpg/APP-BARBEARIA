-- Canal de origem do agendamento (publico | app | whatsapp | barbeiro).
-- Nulo nos registros antigos (mostrados como "Anterior" no painel-mestre).
ALTER TABLE "agendamentos" ADD COLUMN "origem" TEXT;
