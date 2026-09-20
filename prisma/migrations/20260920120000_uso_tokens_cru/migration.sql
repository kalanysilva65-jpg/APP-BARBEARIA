-- Entrada CRUA (tokens de entrada reais, sem a ponderação do cache) para o painel de uso.
ALTER TABLE "uso_ia" ADD COLUMN "tokens_entrada_cru" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "uso_ia" ADD COLUMN "copiloto_tokens_entrada_cru" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "uso_ia_modelo" ADD COLUMN "tokens_entrada_cru" INTEGER NOT NULL DEFAULT 0;
