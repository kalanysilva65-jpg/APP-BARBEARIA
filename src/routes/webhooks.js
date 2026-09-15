// Rotas dos webhooks externos (públicas — chamadas por serviços de fora).
const express = require('express');
const router = express.Router();
const wh = require('../controllers/webhookController');

// WhatsApp Cloud API (Meta).
router.get('/whatsapp', wh.verificar); // verificação (handshake)
router.post('/whatsapp', wh.receber); // recebimento de mensagens

module.exports = router;
