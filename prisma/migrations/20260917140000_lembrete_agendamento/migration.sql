-- Lembrete de WhatsApp: marca quando o lembrete do agendamento foi enviado
-- (nulo = ainda não). Coluna aditiva e anulável — não mexe nos dados existentes.
ALTER TABLE "agendamentos" ADD COLUMN "lembrete_enviado_em" DATETIME;
