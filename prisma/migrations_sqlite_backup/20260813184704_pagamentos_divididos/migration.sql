-- CreateTable
CREATE TABLE "agendamento_pagamentos" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "barbearia_id" INTEGER NOT NULL,
    "agendamento_id" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL,
    "forma_pagamento" TEXT NOT NULL,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "agendamento_pagamentos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "agendamento_pagamentos_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "agendamento_pagamentos_agendamento_id_idx" ON "agendamento_pagamentos"("agendamento_id");
