-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "barbearias" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "endereco" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "capa_url" TEXT,
    "notas_internas" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "barbearias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "foto_url" TEXT,
    "foto_pos" TEXT,
    "papel" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "senha_provisoria" BOOLEAN NOT NULL DEFAULT false,
    "comissao_percentual" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispositivos_push" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT,
    "auth" TEXT,
    "plataforma" TEXT NOT NULL DEFAULT 'web',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispositivos_push_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "horarios_trabalho" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "hora_inicio" TEXT NOT NULL,
    "hora_fim" TEXT NOT NULL,
    "trabalha" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "horarios_trabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bloqueios" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "hora_inicio" TEXT NOT NULL,
    "hora_fim" TEXT NOT NULL,
    "motivo" TEXT,

    CONSTRAINT "bloqueios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_servico" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "categorias_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicos" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria_id" INTEGER,
    "valor" INTEGER NOT NULL,
    "duracao_min" INTEGER NOT NULL,
    "foto_url" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "eh_produto" BOOLEAN NOT NULL DEFAULT false,
    "eh_encaixe" BOOLEAN NOT NULL DEFAULT false,
    "comissao_percentual" DOUBLE PRECISION NOT NULL DEFAULT 10,

    CONSTRAINT "servicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servico_insumos" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "servico_id" INTEGER NOT NULL,
    "estoque_id" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "servico_insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamentos" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "cliente_nome" TEXT NOT NULL,
    "cliente_email" TEXT,
    "cliente_telefone" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "hora_inicio" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'agendado',
    "concluido_em" TIMESTAMP(3),
    "valor_total" INTEGER NOT NULL DEFAULT 0,
    "total_manual" BOOLEAN NOT NULL DEFAULT false,
    "forma_pagamento" TEXT,
    "cliente_id" INTEGER,
    "conta_cliente_id" INTEGER,
    "cliente_plano_id" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamento_pagamentos" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "agendamento_id" INTEGER NOT NULL,
    "valor" INTEGER NOT NULL,
    "forma_pagamento" TEXT NOT NULL,
    "parcelas" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "agendamento_pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contas_cliente" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "telefone" TEXT,
    "foto_url" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contas_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "data_nascimento" TIMESTAMP(3),
    "observacoes" TEXT,
    "selos_fidelidade" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "usos" INTEGER,
    "validade_dias" INTEGER NOT NULL DEFAULT 30,
    "valor" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "servico_id" INTEGER,
    "dias_semana" TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cliente_planos" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "plano_id" INTEGER NOT NULL,
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3) NOT NULL,
    "usos_restantes" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cliente_planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cupons" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "desconto" TEXT NOT NULL,
    "validade" TIMESTAMP(3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fidelidade_resgates" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "selos_usados" INTEGER NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fidelidade_resgates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendamento_itens" (
    "id" SERIAL NOT NULL,
    "agendamento_id" INTEGER NOT NULL,
    "servico_id" INTEGER NOT NULL,
    "valor_unitario" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "agendamento_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_estoque" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "categorias_estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estoque" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria_id" INTEGER,
    "quantidade" INTEGER NOT NULL DEFAULT 0,
    "quantidade_minima" INTEGER NOT NULL DEFAULT 0,
    "valor_gasto" INTEGER NOT NULL DEFAULT 0,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_caixa" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,

    CONSTRAINT "categorias_caixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caixa" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "categoria_id" INTEGER,
    "descricao" TEXT NOT NULL,
    "valor" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agendamento_id" INTEGER,
    "forma_pagamento" TEXT,

    CONSTRAINT "caixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_auditoria" (
    "id" SERIAL NOT NULL,
    "admin_id" INTEGER,
    "admin_nome" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "alvo_tipo" TEXT,
    "alvo_id" INTEGER,
    "detalhe" TEXT,
    "ip" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metas" (
    "id" SERIAL NOT NULL,
    "barbearia_id" INTEGER NOT NULL,
    "usuario_id" INTEGER,
    "metrica" TEXT NOT NULL,
    "alvo" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "barbearias_slug_key" ON "barbearias"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_barbearia_id_email_key" ON "usuarios"("barbearia_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "dispositivos_push_endpoint_key" ON "dispositivos_push"("endpoint");

-- CreateIndex
CREATE INDEX "dispositivos_push_usuario_id_idx" ON "dispositivos_push"("usuario_id");

-- CreateIndex
CREATE INDEX "horarios_trabalho_usuario_id_dia_semana_idx" ON "horarios_trabalho"("usuario_id", "dia_semana");

-- CreateIndex
CREATE INDEX "bloqueios_usuario_id_data_idx" ON "bloqueios"("usuario_id", "data");

-- CreateIndex
CREATE INDEX "servico_insumos_estoque_id_idx" ON "servico_insumos"("estoque_id");

-- CreateIndex
CREATE UNIQUE INDEX "servico_insumos_servico_id_estoque_id_key" ON "servico_insumos"("servico_id", "estoque_id");

-- CreateIndex
CREATE INDEX "agendamentos_usuario_id_data_idx" ON "agendamentos"("usuario_id", "data");

-- CreateIndex
CREATE INDEX "agendamentos_barbearia_id_data_idx" ON "agendamentos"("barbearia_id", "data");

-- CreateIndex
CREATE INDEX "agendamento_pagamentos_agendamento_id_idx" ON "agendamento_pagamentos"("agendamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "contas_cliente_email_key" ON "contas_cliente"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_barbearia_id_telefone_key" ON "clientes"("barbearia_id", "telefone");

-- CreateIndex
CREATE INDEX "agendamento_itens_agendamento_id_idx" ON "agendamento_itens"("agendamento_id");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_barbearia_id_chave_key" ON "configuracoes"("barbearia_id", "chave");

-- CreateIndex
CREATE INDEX "logs_auditoria_criado_em_idx" ON "logs_auditoria"("criado_em");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispositivos_push" ADD CONSTRAINT "dispositivos_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios_trabalho" ADD CONSTRAINT "horarios_trabalho_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horarios_trabalho" ADD CONSTRAINT "horarios_trabalho_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_servico" ADD CONSTRAINT "categorias_servico_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_servico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servico_insumos" ADD CONSTRAINT "servico_insumos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servico_insumos" ADD CONSTRAINT "servico_insumos_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servico_insumos" ADD CONSTRAINT "servico_insumos_estoque_id_fkey" FOREIGN KEY ("estoque_id") REFERENCES "estoque"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_conta_cliente_id_fkey" FOREIGN KEY ("conta_cliente_id") REFERENCES "contas_cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_cliente_plano_id_fkey" FOREIGN KEY ("cliente_plano_id") REFERENCES "cliente_planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamento_pagamentos" ADD CONSTRAINT "agendamento_pagamentos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamento_pagamentos" ADD CONSTRAINT "agendamento_pagamentos_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos" ADD CONSTRAINT "planos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos" ADD CONSTRAINT "planos_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_planos" ADD CONSTRAINT "cliente_planos_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_planos" ADD CONSTRAINT "cliente_planos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cliente_planos" ADD CONSTRAINT "cliente_planos_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cupons" ADD CONSTRAINT "cupons_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fidelidade_resgates" ADD CONSTRAINT "fidelidade_resgates_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fidelidade_resgates" ADD CONSTRAINT "fidelidade_resgates_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamento_itens" ADD CONSTRAINT "agendamento_itens_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendamento_itens" ADD CONSTRAINT "agendamento_itens_servico_id_fkey" FOREIGN KEY ("servico_id") REFERENCES "servicos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_estoque" ADD CONSTRAINT "categorias_estoque_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque" ADD CONSTRAINT "estoque_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estoque" ADD CONSTRAINT "estoque_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_estoque"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categorias_caixa" ADD CONSTRAINT "categorias_caixa_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa" ADD CONSTRAINT "caixa_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa" ADD CONSTRAINT "caixa_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias_caixa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caixa" ADD CONSTRAINT "caixa_agendamento_id_fkey" FOREIGN KEY ("agendamento_id") REFERENCES "agendamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracoes" ADD CONSTRAINT "configuracoes_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metas" ADD CONSTRAINT "metas_barbearia_id_fkey" FOREIGN KEY ("barbearia_id") REFERENCES "barbearias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metas" ADD CONSTRAINT "metas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

