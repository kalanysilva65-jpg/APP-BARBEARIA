-- CreateIndex
CREATE INDEX "caixa_barbearia_id_tipo_data_idx" ON "caixa"("barbearia_id", "tipo", "data");

-- CreateIndex
CREATE INDEX "caixa_barbearia_id_data_idx" ON "caixa"("barbearia_id", "data");
