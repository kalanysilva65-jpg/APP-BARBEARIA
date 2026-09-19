-- Registro durável de cada lembrete de WhatsApp enviado (ver schema: LembreteLog).
-- Sobrevive ao cancelamento/exclusão do agendamento (dados do cliente copiados;
-- agendamento_id opcional, vira NULL se o agendamento for apagado).
CREATE TABLE "lembrete_logs" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barbearia_id" INTEGER NOT NULL,
    "agendamento_id" INTEGER,
    "cliente_nome" TEXT NOT NULL,
    "cliente_telefone" TEXT NOT NULL,
    "hora_agendamento" TEXT,
    "data_agendamento" DATETIME,
    "enviado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lembrete_logs_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "lembrete_logs_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "lembrete_logs_barbearia_id_enviado_em_idx" ON "lembrete_logs"("barbearia_id", "enviado_em");
