-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_servicos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barbearia_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria_id" INTEGER,
    "valor" INTEGER NOT NULL,
    "duracao_min" INTEGER NOT NULL,
    "foto_url" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "eh_produto" BOOLEAN NOT NULL DEFAULT false,
    "eh_encaixe" BOOLEAN NOT NULL DEFAULT false,
    "comissao_percentual" REAL NOT NULL DEFAULT 10,
    CONSTRAINT "servicos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "servicos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_servico" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_servicos" ("ativo", "barbearia_id", "categoria_id", "comissao_percentual", "descricao", "duracao_min", "eh_produto", "foto_url", "id", "nome", "valor") SELECT "ativo", "barbearia_id", "categoria_id", "comissao_percentual", "descricao", "duracao_min", "eh_produto", "foto_url", "id", "nome", "valor" FROM "servicos";
DROP TABLE "servicos";
ALTER TABLE "new_servicos" RENAME TO "servicos";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
