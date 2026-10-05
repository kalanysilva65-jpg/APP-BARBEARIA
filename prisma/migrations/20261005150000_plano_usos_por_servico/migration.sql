-- Usos por serviço no plano (ex.: 2 cortes + 4 barbas por mês).
ALTER TABLE "plano_servicos" ADD COLUMN "usos" INTEGER;
ALTER TABLE "cliente_planos" ADD COLUMN "usos_por_servico" TEXT;
