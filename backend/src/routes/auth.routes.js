const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');

const prisma = require('../prisma');
const { authenticate } = require('../middleware/auth');
const { sendSecurityCodeEmail, sendPasswordResetLinkEmail } = require('../utils/mailer');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;
const MFA_CODE_REGEX = /^\d{6}$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS = 14;
const LOGIN_CODE_TTL_MINUTES = 10;
const PASSWORD_RESET_TTL_MINUTES = 15;
const PASSWORD_RESET_LINK_TTL_MINUTES = 30;

function getLoginChallengeSecret() {
  return process.env.LOGIN_CHALLENGE_SECRET || process.env.JWT_SECRET;
}

function getAccessTokenSecret() {
  return process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
}

function getRefreshTokenSecret() {
  return process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code || '')).digest('hex');
}

function generateRandomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateSixDigitCode() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

function issueLoginChallengeToken(userId, code) {
  return jwt.sign(
    {
      userId,
      type: 'login_challenge',
      codeHash: hashCode(code),
    },
    getLoginChallengeSecret(),
    { expiresIn: `${LOGIN_CODE_TTL_MINUTES}m` }
  );
}

function verifyLoginChallengeToken(token) {
  return jwt.verify(token, getLoginChallengeSecret());
}

function getCookieConfig() {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  };
}

function issueAccessToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      type: 'access',
    },
    getAccessTokenSecret(),
    { expiresIn: `${ACCESS_TOKEN_TTL_SECONDS}s` }
  );
}

function issueRefreshToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      type: 'refresh',
    },
    getRefreshTokenSecret(),
    { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` }
  );
}

async function persistRefreshToken(userId, refreshToken) {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.user.update({
    where: { id: userId },
    data: {
      refreshTokenHash: hashRefreshToken(refreshToken),
      refreshTokenExpiresAt: expiresAt,
    },
  });
}

function setAuthCookies(res, accessToken, refreshToken) {
  const cookieConfig = getCookieConfig();
  res.cookie('midori_access', accessToken, {
    ...cookieConfig,
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie('midori_refresh', refreshToken, {
    ...cookieConfig,
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res) {
  const cookieConfig = getCookieConfig();
  res.clearCookie('midori_access', cookieConfig);
  res.clearCookie('midori_refresh', cookieConfig);
}

async function startSession(res, user) {
  const accessToken = issueAccessToken(user);
  const refreshToken = issueRefreshToken(user);

  await persistRefreshToken(user.id, refreshToken);
  setAuthCookies(res, accessToken, refreshToken);
}

async function createAuthCode({ userId, purpose, expiresInMinutes }) {
  const code = generateSixDigitCode();

  await createAuthSecret({
    userId,
    purpose,
    secret: code,
    expiresInMinutes,
  });

  return code;
}

async function createAuthSecret({ userId, purpose, secret, expiresInMinutes }) {
  const now = new Date();

  await prisma.authCode.updateMany({
    where: {
      userId,
      purpose,
      consumedAt: null,
    },
    data: {
      consumedAt: now,
    },
  });

  await prisma.authCode.create({
    data: {
      userId,
      purpose,
      codeHash: hashCode(secret),
      expiresAt: new Date(Date.now() + expiresInMinutes * 60 * 1000),
    },
  });
}

function getFrontendBaseUrl() {
  const explicit = String(process.env.FRONTEND_BASE_URL || '').trim();
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  const firstAllowed = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .find(Boolean);

  if (firstAllowed) {
    return firstAllowed.replace(/\/$/, '');
  }

  return 'http://localhost:5500';
}

async function consumeMatchingAuthCode({ userId, purpose, code }) {
  const now = new Date();
  const latest = await prisma.authCode.findFirst({
    where: {
      userId,
      purpose,
      consumedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!latest) {
    return false;
  }

  const matches = latest.codeHash === hashCode(code);
  if (!matches) {
    return false;
  }

  await prisma.authCode.update({
    where: { id: latest.id },
    data: {
      consumedAt: now,
    },
  });

  return true;
}

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

function getPasswordValidationMessage(password) {
  const value = String(password || '');
  if (!STRONG_PASSWORD_REGEX.test(value)) {
    return 'A senha deve ter no mínimo 8 caracteres, incluindo letra maiúscula, letra minúscula, número e caractere especial.';
  }
  return '';
}

router.post('/register', async (req, res) => {
  const { email, username, displayName, password, cpf, phone } = req.body;

  if (!email || !username || !displayName || !password) {
    return res.status(400).json({ error: 'Campos obrigatórios: email, username, displayName, password.' });
  }

  const passwordValidationError = getPasswordValidationMessage(password);
  if (passwordValidationError) {
    return res.status(400).json({ error: passwordValidationError });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedUsername = username.toLowerCase().trim();
  const normalizedCpf = normalizeCpf(cpf);
  const normalizedPhone = normalizePhone(phone);

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Email inválido.' });
  }

  if (!USERNAME_REGEX.test(normalizedUsername)) {
    return res.status(400).json({ error: 'username inválido. Use 3-30 caracteres com letras minúsculas, números e _.' });
  }

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

  await startSession(res, user);

  return res.status(201).json({
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

  const code = generateSixDigitCode();

  try {
    await sendSecurityCodeEmail({
      to: user.email,
      subject: 'Midori | Código de verificação para login',
      heading: 'Confirmação de login',
      code,
      expiresInMinutes: LOGIN_CODE_TTL_MINUTES,
    });
  } catch {
    return res.status(503).json({
      error:
        'Serviço de email indisponível no momento. Tente novamente em instantes ou contate o suporte.',
    });
  }

  const challengeToken = issueLoginChallengeToken(user.id, code);

  return res.json({
    requiresMfa: true,
    challengeToken,
    message: 'Enviamos um código para o seu email.',
  });
});

router.post('/login/verify', async (req, res) => {
  const { challengeToken, code } = req.body || {};

  if (!challengeToken || !code) {
    return res.status(400).json({ error: 'Informe challengeToken e código.' });
  }

  const cleanCode = String(code).trim();
  if (!MFA_CODE_REGEX.test(cleanCode)) {
    return res.status(400).json({ error: 'Código inválido.' });
  }

  let payload;
  try {
    payload = verifyLoginChallengeToken(String(challengeToken));
  } catch {
    return res.status(401).json({ error: 'Desafio de login expirado ou inválido.' });
  }

  if (payload.type !== 'login_challenge') {
    return res.status(401).json({ error: 'Desafio de login inválido.' });
  }

  if (!payload.codeHash || payload.codeHash !== hashCode(cleanCode)) {
    return res.status(401).json({ error: 'Código inválido ou expirado.' });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
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
    },
  });

  if (!user) {
    return res.status(401).json({ error: 'Usuário não encontrado.' });
  }

  if (user.role === 'BANNED') {
    return res.status(403).json({ error: 'Conta banida. Entre em contato com o suporte.' });
  }

  await startSession(res, user);

  return res.json({
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

router.post('/password/forgot', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Email inválido.' });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      role: true,
    },
  });

  if (user && user.role !== 'BANNED') {
    const token = generateRandomToken();

    await createAuthSecret({
      userId: user.id,
      purpose: 'PASSWORD_RESET_LINK',
      secret: token,
      expiresInMinutes: PASSWORD_RESET_LINK_TTL_MINUTES,
    });

    const resetLink = `${getFrontendBaseUrl()}/reset-password.html?token=${encodeURIComponent(token)}`;

    try {
      await sendPasswordResetLinkEmail({
        to: user.email,
        subject: 'Midori | Recuperação de senha',
        heading: 'Link para redefinir sua senha',
        resetLink,
        expiresInMinutes: PASSWORD_RESET_LINK_TTL_MINUTES,
      });
    } catch {
      return res.status(503).json({
        error:
          'Serviço de email indisponível no momento. Tente novamente em instantes ou contate o suporte.',
      });
    }
  }

  return res.json({ message: 'Se o email existir, enviaremos um link de recuperação.' });
});

router.post('/password/reset-link', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!token || token.length < 32) {
    return res.status(400).json({ error: 'Link de redefinição inválido.' });
  }

  const newPasswordValidationError = getPasswordValidationMessage(newPassword);
  if (newPasswordValidationError) {
    return res.status(400).json({ error: newPasswordValidationError });
  }

  const now = new Date();
  const authToken = await prisma.authCode.findFirst({
    where: {
      purpose: 'PASSWORD_RESET_LINK',
      codeHash: hashCode(token),
      consumedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      userId: true,
      user: {
        select: {
          role: true,
        },
      },
    },
  });

  if (!authToken || authToken.user.role === 'BANNED') {
    return res.status(401).json({ error: 'Link inválido ou expirado.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: authToken.userId },
      data: {
        passwordHash,
        refreshTokenHash: null,
        refreshTokenExpiresAt: null,
      },
    }),
    prisma.authCode.update({
      where: { id: authToken.id },
      data: {
        consumedAt: now,
      },
    }),
  ]);

  clearAuthCookies(res);
  return res.json({ message: 'Senha redefinida com sucesso.' });
});

router.post('/password/reset', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Email inválido.' });
  }

  if (!MFA_CODE_REGEX.test(code)) {
    return res.status(400).json({ error: 'Código inválido.' });
  }

  const newPasswordValidationError = getPasswordValidationMessage(newPassword);
  if (newPasswordValidationError) {
    return res.status(400).json({ error: newPasswordValidationError });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (!user || user.role === 'BANNED') {
    return res.status(401).json({ error: 'Solicitação inválida.' });
  }

  const accepted = await consumeMatchingAuthCode({
    userId: user.id,
    purpose: 'PASSWORD_RESET',
    code,
  });

  if (!accepted) {
    return res.status(401).json({ error: 'Código inválido ou expirado.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      refreshTokenHash: null,
      refreshTokenExpiresAt: null,
    },
  });

  clearAuthCookies(res);
  return res.json({ message: 'Senha redefinida com sucesso.' });
});

router.post('/refresh', async (req, res) => {
  const refreshToken = req.cookies?.midori_refresh;
  if (!refreshToken) {
    return res.status(401).json({ error: 'Sessão expirada.' });
  }

  try {
    const payload = jwt.verify(refreshToken, getRefreshTokenSecret());
    if (payload.type !== 'refresh') {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Token de sessão inválido.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        role: true,
        refreshTokenHash: true,
        refreshTokenExpiresAt: true,
      },
    });

    if (!user || user.role === 'BANNED') {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Sessão inválida.' });
    }

    const isHashMatch = user.refreshTokenHash === hashRefreshToken(refreshToken);
    const isNotExpired = user.refreshTokenExpiresAt && new Date(user.refreshTokenExpiresAt).getTime() > Date.now();

    if (!isHashMatch || !isNotExpired) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          refreshTokenHash: null,
          refreshTokenExpiresAt: null,
        },
      });
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Sessão expirada.' });
    }

    await startSession(res, user);
    return res.json({ ok: true });
  } catch {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Sessão inválida.' });
  }
});

router.post('/logout', async (req, res) => {
  const refreshToken = req.cookies?.midori_refresh;
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, getRefreshTokenSecret());
      if (payload?.userId) {
        await prisma.user.update({
          where: { id: payload.userId },
          data: {
            refreshTokenHash: null,
            refreshTokenExpiresAt: null,
          },
        });
      }
    } catch {
    }
  }

  clearAuthCookies(res);
  return res.status(204).send();
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
