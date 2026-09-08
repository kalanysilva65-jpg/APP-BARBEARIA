-- CreateTable
CREATE TABLE "dispositivos_push" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuario_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT,
    "auth" TEXT,
    "plataforma" TEXT NOT NULL DEFAULT 'web',
    "criado_em" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dispositivos_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "dispositivos_push_endpoint_key" ON "dispositivos_push"("endpoint");

-- CreateIndex
CREATE INDEX "dispositivos_push_usuario_id_idx" ON "dispositivos_push"("usuario_id");
