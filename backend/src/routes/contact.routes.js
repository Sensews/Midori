const express = require('express');
const rateLimit = require('express-rate-limit');

const { sendContactEmail } = require('../utils/mailer');

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.CONTACT_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas mensagens enviadas. Tente novamente em alguns minutos.' },
});

function cleanString(value, maxLen) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (typeof maxLen === 'number' && maxLen > 0) return trimmed.slice(0, maxLen);
  return trimmed;
}

function isValidEmail(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  // Simple validation; backend will treat as untrusted anyway.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

router.post('/', contactLimiter, async (req, res) => {
  const {
    fullName,
    subject,
    email,
    phone,
    destination,
    uf,
    city,
    message,
    acceptPrivacy,
  } = req.body || {};

  const safeName = cleanString(fullName, 120);
  const safeSubject = cleanString(subject, 140);
  const safeEmail = cleanString(email, 200);
  const safePhone = cleanString(phone, 40);
  const safeDestination = cleanString(destination, 120);
  const safeUf = cleanString(uf, 2).toUpperCase();
  const safeCity = cleanString(city, 80);
  const safeMessage = cleanString(message, 4000);

  if (!safeName) {
    return res.status(400).json({ error: 'Nome completo é obrigatório.' });
  }

  if (!safeSubject) {
    return res.status(400).json({ error: 'Assunto é obrigatório.' });
  }

  if (!isValidEmail(safeEmail)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }

  if (!safeMessage) {
    return res.status(400).json({ error: 'Mensagem é obrigatória.' });
  }

  if (acceptPrivacy !== true) {
    return res.status(400).json({ error: 'Você precisa aceitar a Política de Privacidade.' });
  }

  try {
    await sendContactEmail({
      fullName: safeName,
      subject: safeSubject,
      email: safeEmail,
      phone: safePhone,
      destination: safeDestination,
      uf: safeUf,
      city: safeCity,
      message: safeMessage,
      meta: {
        ip: req.ip,
        userAgent: req.get('user-agent') || '',
      },
    });
  } catch {
    return res.status(503).json({
      error: 'Serviço de email indisponível no momento. Tente novamente em instantes.',
    });
  }

  return res.json({ status: 'ok' });
});

module.exports = router;
