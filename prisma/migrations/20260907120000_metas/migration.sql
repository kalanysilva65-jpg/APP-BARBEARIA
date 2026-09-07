-- Metas configuráveis (métrica + alvo, por barbearia ou por barbeiro).
CREATE TABLE "metas" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barbearia_id" INTEGER NOT NULL,
    "usuario_id" INTEGER,
    "metrica" TEXT NOT NULL,
    "alvo" INTEGER NOT NULL,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "metas_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "metas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "metas_barbearia_id_idx" ON "metas"("barbearia_id");
