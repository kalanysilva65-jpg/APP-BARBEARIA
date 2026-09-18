-- Consumo de IA detalhado por MODELO (ver schema: UsoIAModelo).
CREATE TABLE "uso_ia_modelo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barbearia_id" INTEGER NOT NULL,
    "competencia" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tokens_entrada" INTEGER NOT NULL DEFAULT 0,
    "tokens_saida" INTEGER NOT NULL DEFAULT 0,
    "chamadas" INTEGER NOT NULL DEFAULT 0,
    "atualizado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uso_ia_modelo_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "uso_ia_modelo_barbearia_id_competencia_canal_modelo_key" ON "uso_ia_modelo"("barbearia_id", "competencia", "canal", "modelo");
