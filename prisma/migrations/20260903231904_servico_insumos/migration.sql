-- CreateTable
CREATE TABLE "servico_insumos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barbearia_id" INTEGER NOT NULL,
    "servico_id" INTEGER NOT NULL,
    "estoque_id" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "servico_insumos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "servico_insumos_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "servico_insumos_estoque_id_fkey" FOREIGN KEY ("estoque_id") REFERENCES "estoque" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "servico_insumos_estoque_id_idx" ON "servico_insumos"("estoque_id");

-- CreateIndex
CREATE UNIQUE INDEX "servico_insumos_servico_id_estoque_id_key" ON "servico_insumos"("servico_id", "estoque_id");
