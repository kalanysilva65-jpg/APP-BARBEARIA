-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_planos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "usos" INTEGER,
    "validade_dias" INTEGER NOT NULL DEFAULT 30,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "servico_id" INTEGER,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "planos_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_planos" ("ativo", "criado_em", "id", "nome", "tipo", "usos", "validade_dias", "valor") SELECT "ativo", "criado_em", "id", "nome", "tipo", "usos", "validade_dias", "valor" FROM "planos";
DROP TABLE "planos";
ALTER TABLE "new_planos" RENAME TO "planos";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
