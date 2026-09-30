-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "descricao" TEXT;

-- CreateTable
CREATE TABLE "servico_precos_barbeiro" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barbearia_id" INTEGER NOT NULL,
    "servico_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL,
    CONSTRAINT "servico_precos_barbeiro_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "servico_precos_barbeiro_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "servico_precos_barbeiro_barbearia_id_idx" ON "servico_precos_barbeiro"("barbearia_id");

-- CreateIndex
CREATE UNIQUE INDEX "servico_precos_barbeiro_servico_id_usuario_id_key" ON "servico_precos_barbeiro"("servico_id", "usuario_id");

