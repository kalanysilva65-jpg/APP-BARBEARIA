// Rotas públicas de agendamento (cliente, sem login).
const express = require('express');
const router = express.Router();
const c = require('../controllers/agendamentoPublicoController');

router.get('/plano', c.passoPlano); // consulta de plano por telefone
router.get('/', c.passoServico); // passo 1: serviço
router.get('/barbeiro', c.passoBarbeiro); // passo 2: barbeiro
router.get('/horario', c.passoHorario); // passo 3: data e horário
router.get('/dados', c.passoDados); // passo 4: dados do cliente
router.post('/confirmar', c.confirmar); // cria o agendamento
router.get('/sucesso/:id', c.sucesso); // confirmação

module.exports = router;
