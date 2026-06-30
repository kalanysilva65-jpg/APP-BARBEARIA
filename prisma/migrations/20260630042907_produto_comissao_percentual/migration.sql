-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_servicos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "categoria_id" INTEGER,
    "valor" INTEGER NOT NULL,
    "duracao_min" INTEGER NOT NULL,
    "foto_url" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "eh_produto" BOOLEAN NOT NULL DEFAULT false,
    "comissao_percentual" REAL NOT NULL DEFAULT 10,
    CONSTRAINT "servicos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_servico" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_servicos" ("ativo", "categoria_id", "duracao_min", "eh_produto", "foto_url", "id", "nome", "valor") SELECT "ativo", "categoria_id", "duracao_min", "eh_produto", "foto_url", "id", "nome", "valor" FROM "servicos";
DROP TABLE "servicos";
ALTER TABLE "new_servicos" RENAME TO "servicos";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
