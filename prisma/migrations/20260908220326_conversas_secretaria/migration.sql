-- DropIndex
DROP INDEX "metas_barbearia_id_idx";

-- CreateTable
CREATE TABLE "conversas" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barbearia_id" INTEGER NOT NULL,
    "cliente_telefone" TEXT NOT NULL,
    "cliente_nome" TEXT,
    "cliente_id" INTEGER,
    "ia_ativa" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'aberta',
    "nao_lidas" INTEGER NOT NULL DEFAULT 0,
    "ultima_previa" TEXT,
    "ultima_mensagem_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conversas_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "conversa_id" INTEGER NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mensagens_conversa_id_fkey" FOREIGN KEY ("conversa_id") REFERENCES "conversas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "conversas_barbearia_id_ultima_mensagem_em_idx" ON "conversas"("barbearia_id", "ultima_mensagem_em");

-- CreateIndex
CREATE UNIQUE INDEX "conversas_barbearia_id_cliente_telefone_key" ON "conversas"("barbearia_id", "cliente_telefone");

-- CreateIndex
CREATE INDEX "mensagens_conversa_id_criado_em_idx" ON "mensagens"("conversa_id", "criado_em");
