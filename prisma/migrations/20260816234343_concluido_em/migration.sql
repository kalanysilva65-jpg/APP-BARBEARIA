-- AlterTable
ALTER TABLE "agendamentos" ADD COLUMN "concluido_em" DATETIME;

-- Preenche o histórico.
--
-- Os atendimentos já concluídos não têm como saber QUANDO foram concluídos —
-- o campo não existia. `data` (o dia do atendimento) é a melhor aproximação
-- disponível e, na prática, é o caso normal: quase todo atendimento é
-- concluído no próprio dia.
--
-- Sem isto, todo o histórico sairia dos relatórios de uma vez: as consultas
-- passam a filtrar por `concluido_em`, e nulo não entra em nenhum intervalo.
UPDATE "agendamentos" SET "concluido_em" = "data" WHERE "status" = 'concluido';
