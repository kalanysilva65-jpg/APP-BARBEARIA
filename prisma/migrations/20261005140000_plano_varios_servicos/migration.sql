-- Plano com VÁRIOS serviços (antes: um só, em planos.servico_id).
CREATE TABLE "plano_servicos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "plano_id" INTEGER NOT NULL,
    "servico_id" INTEGER NOT NULL,
    CONSTRAINT "plano_servicos_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "plano_servicos_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "plano_servicos_plano_id_servico_id_key" ON "plano_servicos"("plano_id", "servico_id");

-- Copia o serviço que cada plano já tinha.
INSERT INTO "plano_servicos" ("plano_id", "servico_id")
SELECT "id", "servico_id" FROM "planos" WHERE "servico_id" IS NOT NULL;
