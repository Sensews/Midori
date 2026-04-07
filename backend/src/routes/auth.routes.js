const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = require('../prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function normalizeCpf(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const cpfRegex = /^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$/;
  if (!cpfRegex.test(raw)) return '__INVALID__';

  const digits = raw.replace(/\D/g, '');
  return digits || null;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits || null;
}

function isValidCpfDigits(cpfDigits) {
  if (!cpfDigits || cpfDigits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpfDigits)) return false;

  function calcVerifier(base, factorStart) {
    let total = 0;
    for (let index = 0; index < base.length; index += 1) {
      total += Number(base[index]) * (factorStart - index);
    }
    const mod = total % 11;
    return mod < 2 ? 0 : 11 - mod;
  }

  const baseNine = cpfDigits.slice(0, 9);
  const dig10 = calcVerifier(baseNine, 10);
  const dig11 = calcVerifier(`${baseNine}${dig10}`, 11);

  return cpfDigits.endsWith(`${dig10}${dig11}`);
}

function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.post('/register', async (req, res) => {
  const { email, username, displayName, password, cpf, phone } = req.body;

  if (!email || !username || !displayName || !password) {
    return res.status(400).json({ error: 'Campos obrigatórios: email, username, displayName, password.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 8 caracteres.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedUsername = username.toLowerCase().trim();
  const normalizedCpf = normalizeCpf(cpf);
  const normalizedPhone = normalizePhone(phone);

  if (normalizedCpf === '__INVALID__') {
    return res.status(400).json({ error: 'CPF inválido. Use 000.000.000-00.' });
  }

  if (normalizedCpf && normalizedCpf.length !== 11) {
    return res.status(400).json({ error: 'CPF inválido. Use 11 dígitos.' });
  }

  if (normalizedCpf && !isValidCpfDigits(normalizedCpf)) {
    return res.status(400).json({ error: 'CPF inválido.' });
  }

  if (normalizedPhone && (normalizedPhone.length < 10 || normalizedPhone.length > 13)) {
    return res.status(400).json({ error: 'Telefone inválido. Use entre 10 e 13 dígitos.' });
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        { username: normalizedUsername },
        ...(normalizedCpf ? [{ cpf: normalizedCpf }] : []),
      ],
    },
  });

  if (existing) {
    return res.status(409).json({ error: 'Email, username ou CPF já cadastrado.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      username: normalizedUsername,
      cpf: normalizedCpf,
      phone: normalizedPhone,
      displayName: displayName.trim(),
      passwordHash,
    },
  });

  const token = signToken(user);

  return res.status(201).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      cpf: user.cpf,
      phone: user.phone,
      displayName: user.displayName,
      role: user.role,
    },
  });
});

router.post('/login', async (req, res) => {
  const { login, password } = req.body;

  if (!login || !password) {
    return res.status(400).json({ error: 'Informe login (email/username) e senha.' });
  }

  const value = login.toLowerCase().trim();

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: value },
        { username: value },
      ],
    },
  });

  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  if (user.role === 'BANNED') {
    return res.status(403).json({ error: 'Conta banida. Entre em contato com o suporte.' });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const token = signToken(user);

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      cpf: user.cpf,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
    },
  });
});

router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      role: true,
      cpf: true,
      phone: true,
      avatarUrl: true,
      bio: true,
      createdAt: true,
    },
  });

  return res.json({ user });
});

module.exports = router;
