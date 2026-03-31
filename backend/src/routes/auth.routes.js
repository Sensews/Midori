const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = require('../prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

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
  const { email, username, displayName, password } = req.body;

  if (!email || !username || !displayName || !password) {
    return res.status(400).json({ error: 'Campos obrigatórios: email, username, displayName, password.' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 8 caracteres.' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedUsername = username.toLowerCase().trim();

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        { username: normalizedUsername },
      ],
    },
  });

  if (existing) {
    return res.status(409).json({ error: 'Email ou username já cadastrado.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      username: normalizedUsername,
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
      avatarUrl: true,
      bio: true,
      createdAt: true,
    },
  });

  return res.json({ user });
});

module.exports = router;
