-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_uso_ia" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barbearia_id" INTEGER NOT NULL,
    "competencia" TEXT NOT NULL,
    "respostas" INTEGER NOT NULL DEFAULT 0,
    "tokens_entrada" INTEGER NOT NULL DEFAULT 0,
    "tokens_saida" INTEGER NOT NULL DEFAULT 0,
    "avisado_teto" BOOLEAN NOT NULL DEFAULT false,
    "copiloto_consultas" INTEGER NOT NULL DEFAULT 0,
    "copiloto_tokens_entrada" INTEGER NOT NULL DEFAULT 0,
    "copiloto_tokens_saida" INTEGER NOT NULL DEFAULT 0,
    "atualizado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uso_ia_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_uso_ia" ("atualizado_em", "avisado_teto", "barbearia_id", "competencia", "id", "respostas", "tokens_entrada", "tokens_saida") SELECT "atualizado_em", "avisado_teto", "barbearia_id", "competencia", "id", "respostas", "tokens_entrada", "tokens_saida" FROM "uso_ia";
DROP TABLE "uso_ia";
ALTER TABLE "new_uso_ia" RENAME TO "uso_ia";
CREATE UNIQUE INDEX "uso_ia_barbearia_id_competencia_key" ON "uso_ia"("barbearia_id", "competencia");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
