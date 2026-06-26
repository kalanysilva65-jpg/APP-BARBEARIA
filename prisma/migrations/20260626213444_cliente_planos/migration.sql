-- CreateTable
CREATE TABLE "cliente_planos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "cliente_id" INTEGER NOT NULL,
    "plano_id" INTEGER NOT NULL,
    "data_inicio" DATETIME NOT NULL,
    "data_fim" DATETIME NOT NULL,
    "usos_restantes" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cliente_planos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cliente_planos_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
