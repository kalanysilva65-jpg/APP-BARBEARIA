ALTER TABLE "mensagens" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'texto';
ALTER TABLE "mensagens" ADD COLUMN "midia_arquivo" TEXT;
ALTER TABLE "mensagens" ADD COLUMN "midia_mime" TEXT;
ALTER TABLE "mensagens" ADD COLUMN "midia_nome" TEXT;
ALTER TABLE "mensagens" ADD COLUMN "wa_id" TEXT;
ALTER TABLE "mensagens" ADD COLUMN "status_envio" TEXT;
CREATE INDEX "mensagens_wa_id_idx" ON "mensagens"("wa_id");
ALTER TABLE "conversas" ADD COLUMN "ultima_msg_cliente_em" DATETIME;
