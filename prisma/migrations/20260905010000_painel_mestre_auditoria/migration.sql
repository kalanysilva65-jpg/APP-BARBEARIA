-- Notas internas do dono do SaaS sobre cada barbearia (só o painel-mestre vê).
ALTER TABLE "barbearias" ADD COLUMN "notas_internas" TEXT;

-- Trilha de auditoria do painel-mestre (ações administrativas sensíveis).
CREATE TABLE "logs_auditoria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "admin_id" INTEGER,
    "admin_nome" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "alvo_tipo" TEXT,
    "alvo_id" INTEGER,
    "detalhe" TEXT,
    "ip" TEXT,
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "logs_auditoria_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "logs_auditoria_criado_em_idx" ON "logs_auditoria"("criado_em");
