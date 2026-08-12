-- CreateIndex
CREATE INDEX "agendamento_itens_agendamento_id_idx" ON "agendamento_itens"("agendamento_id");

-- CreateIndex
CREATE INDEX "agendamentos_usuario_id_data_idx" ON "agendamentos"("usuario_id", "data");

-- CreateIndex
CREATE INDEX "agendamentos_barbearia_id_data_idx" ON "agendamentos"("barbearia_id", "data");

-- CreateIndex
CREATE INDEX "bloqueios_usuario_id_data_idx" ON "bloqueios"("usuario_id", "data");

-- CreateIndex
CREATE INDEX "horarios_trabalho_usuario_id_dia_semana_idx" ON "horarios_trabalho"("usuario_id", "dia_semana");
