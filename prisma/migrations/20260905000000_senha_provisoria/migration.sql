-- AlterTable: marca de senha provisória (força troca no 1º login)
ALTER TABLE "usuarios" ADD COLUMN "senha_provisoria" BOOLEAN NOT NULL DEFAULT false;

-- Fecha o buraco das senhas padrão (dono123/admin123) em produção: todo usuário
-- que JÁ existe passa a precisar definir uma senha própria no próximo login.
-- Exceção: a conta do revisor da Apple, cujas credenciais fixas não podem mudar
-- enquanto houver review em andamento.
UPDATE "usuarios" SET "senha_provisoria" = true WHERE "email" <> 'revisor@cortavo.com.br';
