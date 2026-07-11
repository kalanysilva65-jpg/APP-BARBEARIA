-- AlterTable
ALTER TABLE "barbearias" ADD COLUMN "endereco" TEXT;
ALTER TABLE "barbearias" ADD COLUMN "latitude" REAL;
ALTER TABLE "barbearias" ADD COLUMN "longitude" REAL;

-- CreateTable
CREATE TABLE "contas_cliente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "telefone" TEXT,
    "foto_url" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_agendamentos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barbearia_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "cliente_nome" TEXT NOT NULL,
    "cliente_email" TEXT,
    "cliente_telefone" TEXT NOT NULL,
    "data" DATETIME NOT NULL,
    "hora_inicio" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'agendado',
    "valor_total" INTEGER NOT NULL DEFAULT 0,
    "cliente_id" INTEGER,
    "conta_cliente_id" INTEGER,
    "cliente_plano_id" INTEGER,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agendamentos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agendamentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "agendamentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "agendamentos_conta_cliente_id_fkey" FOREIGN KEY ("conta_cliente_id") REFERENCES "contas_cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "agendamentos_cliente_plano_id_fkey" FOREIGN KEY ("cliente_plano_id") REFERENCES "cliente_planos" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_agendamentos" ("barbearia_id", "cliente_email", "cliente_id", "cliente_nome", "cliente_plano_id", "cliente_telefone", "criado_em", "data", "hora_inicio", "id", "status", "usuario_id", "valor_total") SELECT "barbearia_id", "cliente_email", "cliente_id", "cliente_nome", "cliente_plano_id", "cliente_telefone", "criado_em", "data", "hora_inicio", "id", "status", "usuario_id", "valor_total" FROM "agendamentos";
DROP TABLE "agendamentos";
ALTER TABLE "new_agendamentos" RENAME TO "agendamentos";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "contas_cliente_email_key" ON "contas_cliente"("email");
