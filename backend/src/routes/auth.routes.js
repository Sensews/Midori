const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');

const prisma = require('../prisma');
const { authenticate } = require('../middleware/auth');
const { sendSecurityCodeEmail, sendPasswordResetLinkEmail, sendSecurityNoticeEmail } = require('../utils/mailer');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;
const MFA_CODE_REGEX = /^\d{6}$/;
const BACKUP_CODE_REGEX = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const PRIVILEGED_ACCESS_TOKEN_TTL_SECONDS = 5 * 60;
const REFRESH_TOKEN_TTL_DAYS = 14;
const LOGIN_CODE_TTL_MINUTES = 10;
const PASSWORD_RESET_LINK_TTL_MINUTES = 30;
const PASSWORD_RESET_MFA_BLOCK_HOURS = 24;
const RECOVERY_MIN_DELAY_SECONDS = 45;
const MAX_LOCKOUT_MINUTES = 30;
const BACKUP_CODE_COUNT = 10;
const BACKUP_CODE_TTL_DAYS = 180;

const ipAttemptState = new Map();
const IP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const IP_ATTEMPT_MAX = 20;
const IP_LOCK_MS = 10 * 60 * 1000;

function getLoginChallengeSecret() {
  return process.env.LOGIN_CHALLENGE_SECRET || process.env.JWT_SECRET;
}

function getAccessTokenSecret() {
  return process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
}

function getRefreshTokenSecret() {
  return process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
}

function hashValue(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function hashRefreshToken(token) {
  return hashValue(token);
}

function hashCode(code) {
  return hashValue(code);
}

function generateRandomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function generateSixDigitCode() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

function issueLoginChallengeToken(userId, code, context = {}) {
  return jwt.sign(
    {
      userId,
      type: 'login_challenge',
      codeHash: hashCode(code),
      deviceIdHash: context.deviceIdHash || '',
      ipHash: context.ipHash || '',
      isPrivileged: Boolean(context.isPrivileged),
      riskLevel: context.riskLevel || 'medium',
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

function issueAccessToken(user, sessionId, isPrivileged = false) {
  const ttlSeconds = isPrivileged ? PRIVILEGED_ACCESS_TOKEN_TTL_SECONDS : ACCESS_TOKEN_TTL_SECONDS;
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      type: 'access',
      sessionId,
      isPrivileged: Boolean(isPrivileged),
    },
    getAccessTokenSecret(),
    { expiresIn: `${ttlSeconds}s` }
  );
}

function issueRefreshToken(user, sessionId) {
  return jwt.sign(
    {
      userId: user.id,
      sessionId,
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

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function getDeviceId(req) {
  const headerValue = String(req.headers['x-device-id'] || '').trim();
  if (headerValue) return headerValue;
  const bodyValue = String(req.body?.deviceId || '').trim();
  if (bodyValue) return bodyValue;
  return 'unknown-device';
}

function getUserAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 255) || null;
}

function getNormalizedHour(date = new Date()) {
  return date.getHours();
}

function isSuspiciousHour(hour) {
  return hour < 6 || hour >= 23;
}

function nextLockoutMinutes(failedAttempts) {
  if (failedAttempts < 3) return 0;
  const lock = 2 ** Math.min(failedAttempts - 3, 5);
  return Math.min(lock, MAX_LOCKOUT_MINUTES);
}

function registerIpAttemptFailure(ip) {
  const now = Date.now();
  const key = String(ip || 'unknown');
  const existing = ipAttemptState.get(key) || { count: 0, firstAt: now, lockUntil: 0 };

  if (existing.lockUntil > now) {
    ipAttemptState.set(key, existing);
    return existing;
  }

  if (now - existing.firstAt > IP_ATTEMPT_WINDOW_MS) {
    existing.count = 0;
    existing.firstAt = now;
  }

  existing.count += 1;
  if (existing.count >= IP_ATTEMPT_MAX) {
    existing.lockUntil = now + IP_LOCK_MS;
  }
  ipAttemptState.set(key, existing);
  return existing;
}

function clearIpAttemptState(ip) {
  ipAttemptState.delete(String(ip || 'unknown'));
}

function isIpLocked(ip) {
  const state = ipAttemptState.get(String(ip || 'unknown'));
  if (!state) return false;
  return state.lockUntil > Date.now();
}

async function createAuthEvent(event) {
  try {
    await prisma.authEvent.create({
      data: {
        userId: event.userId || null,
        loginValue: event.loginValue || null,
        eventType: event.eventType,
        ipHash: event.ipHash || null,
        deviceIdHash: event.deviceIdHash || null,
        riskLevel: event.riskLevel || null,
        metadata: event.metadata || null,
      },
    });
  } catch {
  }
}

async function startSession(req, res, user, options = {}) {
  const now = new Date();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const deviceIdHash = options.deviceIdHash || hashValue(getDeviceId(req));
  const ipHash = options.ipHash || hashValue(getClientIp(req));
  const userAgent = options.userAgent || getUserAgent(req);
  const isPrivileged = Boolean(options.isPrivileged);

  const authSession = await prisma.authSession.create({
    data: {
      userId: user.id,
      deviceIdHash,
      ipHash,
      userAgent,
      refreshTokenHash: 'pending',
      expiresAt,
      isPrivileged,
      lastSeenAt: now,
    },
  });

  const refreshToken = issueRefreshToken(user, authSession.id);
  const refreshTokenHash = hashRefreshToken(refreshToken);

  await prisma.$transaction([
    prisma.authSession.update({
      where: { id: authSession.id },
      data: {
        refreshTokenHash,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash,
        refreshTokenExpiresAt: expiresAt,
      },
    }),
  ]);

  const accessToken = issueAccessToken(user, authSession.id, isPrivileged);

  setAuthCookies(res, accessToken, refreshToken);

  return authSession;
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

async function consumeBackupCode(userId, code) {
  const now = new Date();
  const codeHash = hashCode(code);
  const backup = await prisma.backupCode.findFirst({
    where: {
      userId,
      codeHash,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!backup) return false;

  await prisma.backupCode.update({
    where: { id: backup.id },
    data: { consumedAt: now },
  });
  return true;
}

function generateBackupCode() {
  const part = () => crypto.randomBytes(3).toString('hex').slice(0, 4).toUpperCase();
  return `${part()}-${part()}`;
}

async function generateAndStoreBackupCodes(userId) {
  const plainCodes = Array.from({ length: BACKUP_CODE_COUNT }, () => generateBackupCode());
  const now = new Date();
  const expiresAt = new Date(Date.now() + BACKUP_CODE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.backupCode.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: now },
    }),
    prisma.backupCode.createMany({
      data: plainCodes.map((code) => ({
        userId,
        codeHash: hashCode(code),
        expiresAt,
      })),
    }),
  ]);

  return plainCodes;
}

async function evaluateLoginRisk(user, context) {
  const now = new Date();
  const sessions = await prisma.authSession.findMany({
    where: {
      userId: user.id,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: {
      deviceIdHash: true,
      ipHash: true,
    },
    take: 50,
  });

  const seenDevice = sessions.some((session) => session.deviceIdHash === context.deviceIdHash);
  const seenIp = sessions.some((session) => session.ipHash && session.ipHash === context.ipHash);

  const risks = {
    mfaDisabled: true,
    newDevice: !seenDevice,
    newIp: !seenIp,
    suspiciousHour: isSuspiciousHour(context.hour),
    manyAttempts: user.failedLoginAttempts >= 2,
    privilegedRole: user.role === 'SUPERADMIN',
  };

  const requiresStepUp = false;
  const riskLevel = 'low';

  return { requiresStepUp, riskLevel, risks };
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

  await startSession(req, res, user, { isPrivileged: user.role === 'SUPERADMIN' });

  await createAuthEvent({
    userId: user.id,
    eventType: 'REGISTER_SUCCESS',
    ipHash: hashValue(getClientIp(req)),
    deviceIdHash: hashValue(getDeviceId(req)),
    riskLevel: 'low',
  });

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
  const ip = getClientIp(req);
  const ipHash = hashValue(ip);
  const deviceIdHash = hashValue(getDeviceId(req));
  const hour = getNormalizedHour(new Date());

  if (isIpLocked(ip)) {
    await createAuthEvent({
      loginValue: value,
      eventType: 'LOGIN_BLOCKED_IP_LOCK',
      ipHash,
      deviceIdHash,
      riskLevel: 'high',
    });
    return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: value },
        { username: value },
      ],
    },
  });

  if (!user) {
    registerIpAttemptFailure(ip);
    await createAuthEvent({
      loginValue: value,
      eventType: 'LOGIN_FAIL_UNKNOWN_USER',
      ipHash,
      deviceIdHash,
      riskLevel: 'medium',
    });
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  if (user.role === 'BANNED') {
    await createAuthEvent({
      userId: user.id,
      loginValue: value,
      eventType: 'LOGIN_BLOCKED_BANNED',
      ipHash,
      deviceIdHash,
      riskLevel: 'high',
    });
    return res.status(403).json({ error: 'Conta banida. Entre em contato com o suporte.' });
  }

  if (user.lockoutUntil && user.lockoutUntil.getTime() > Date.now()) {
    await createAuthEvent({
      userId: user.id,
      loginValue: value,
      eventType: 'LOGIN_BLOCKED_LOCKOUT',
      ipHash,
      deviceIdHash,
      riskLevel: 'high',
    });
    return res.status(423).json({ error: 'Conta temporariamente bloqueada por múltiplas tentativas.' });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    registerIpAttemptFailure(ip);
    const failedLoginAttempts = user.failedLoginAttempts + 1;
    const lockoutMinutes = nextLockoutMinutes(failedLoginAttempts);
    const lockoutUntil = lockoutMinutes > 0
      ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
      : null;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts,
        lockoutUntil,
      },
    });

    await createAuthEvent({
      userId: user.id,
      loginValue: value,
      eventType: 'LOGIN_FAIL_BAD_PASSWORD',
      ipHash,
      deviceIdHash,
      riskLevel: lockoutMinutes > 0 ? 'high' : 'medium',
      metadata: { failedLoginAttempts, lockoutMinutes },
    });
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  clearIpAttemptState(ip);

  const risk = await evaluateLoginRisk(user, {
    ipHash,
    deviceIdHash,
    hour,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      lockoutUntil: null,
    },
  });

  if (!risk.requiresStepUp) {
    await startSession(req, res, user, {
      deviceIdHash,
      ipHash,
      isPrivileged: false,
    });

    await createAuthEvent({
      userId: user.id,
      loginValue: value,
      eventType: 'LOGIN_SUCCESS_NO_STEP_UP',
      ipHash,
      deviceIdHash,
      riskLevel: risk.riskLevel,
      metadata: risk.risks,
    });

    return res.json({
      requiresMfa: false,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
      message: 'Sessão iniciada com sucesso.',
    });
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
  } catch (error) {
    console.error('Falha ao enviar codigo MFA por email:', error);
    return res.status(503).json({
      error:
        'Serviço de email indisponível no momento. Tente novamente em instantes ou contate o suporte.',
    });
  }

  const challengeToken = issueLoginChallengeToken(user.id, code);

  await createAuthEvent({
    userId: user.id,
    loginValue: value,
    eventType: 'LOGIN_STEP_UP_CHALLENGE_ISSUED',
    ipHash,
    deviceIdHash,
    riskLevel: risk.riskLevel,
    metadata: risk.risks,
  });

  return res.json({
    requiresMfa: true,
    challengeToken: issueLoginChallengeToken(user.id, code, {
      deviceIdHash,
      ipHash,
      riskLevel: risk.riskLevel,
      isPrivileged: user.role === 'SUPERADMIN',
    }),
    message: 'Enviamos um código para o seu email.',
  });
});

router.post('/login/verify', async (req, res) => {
  const { challengeToken, code } = req.body || {};

  if (!challengeToken || !code) {
    return res.status(400).json({ error: 'Informe challengeToken e código.' });
  }

  const cleanCode = String(code || '').trim().toUpperCase();

  let payload;
  try {
    payload = verifyLoginChallengeToken(String(challengeToken));
  } catch {
    return res.status(401).json({ error: 'Desafio de login expirado ou inválido.' });
  }

  if (payload.type !== 'login_challenge') {
    return res.status(401).json({ error: 'Desafio de login inválido.' });
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

  let validatedBy = 'MFA_EMAIL_CODE';
  if (MFA_CODE_REGEX.test(cleanCode)) {
    if (!payload.codeHash || payload.codeHash !== hashCode(cleanCode)) {
      await createAuthEvent({
        userId: user.id,
        loginValue: user.email,
        eventType: 'MFA_FAIL_INVALID_CODE',
        ipHash: hashValue(getClientIp(req)),
        deviceIdHash: payload.deviceIdHash || hashValue(getDeviceId(req)),
        riskLevel: payload.riskLevel || 'medium',
      });
      return res.status(401).json({ error: 'Código inválido ou expirado.' });
    }
  } else {
    if (!BACKUP_CODE_REGEX.test(cleanCode)) {
      return res.status(400).json({ error: 'Código inválido.' });
    }
    const acceptedBackupCode = await consumeBackupCode(user.id, cleanCode);
    if (!acceptedBackupCode) {
      await createAuthEvent({
        userId: user.id,
        loginValue: user.email,
        eventType: 'MFA_FAIL_INVALID_BACKUP_CODE',
        ipHash: hashValue(getClientIp(req)),
        deviceIdHash: payload.deviceIdHash || hashValue(getDeviceId(req)),
        riskLevel: payload.riskLevel || 'high',
      });
      return res.status(401).json({ error: 'Backup code inválido ou expirado.' });
    }
    validatedBy = 'MFA_BACKUP_CODE';
  }

  await startSession(req, res, user, {
    deviceIdHash: payload.deviceIdHash || hashValue(getDeviceId(req)),
    ipHash: payload.ipHash || hashValue(getClientIp(req)),
    isPrivileged: Boolean(payload.isPrivileged),
  });

  await createAuthEvent({
    userId: user.id,
    loginValue: user.email,
    eventType: 'LOGIN_SUCCESS_STEP_UP',
    ipHash: payload.ipHash || hashValue(getClientIp(req)),
    deviceIdHash: payload.deviceIdHash || hashValue(getDeviceId(req)),
    riskLevel: payload.riskLevel || 'medium',
    metadata: { validatedBy },
  });

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

      await createAuthEvent({
        userId: user.id,
        loginValue: email,
        eventType: 'PASSWORD_RESET_LINK_ISSUED',
        ipHash: hashValue(getClientIp(req)),
        deviceIdHash: hashValue(getDeviceId(req)),
        riskLevel: 'medium',
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
      createdAt: true,
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

  const ageSeconds = Math.floor((Date.now() - authToken.createdAt.getTime()) / 1000);
  if (ageSeconds < RECOVERY_MIN_DELAY_SECONDS) {
    return res.status(429).json({ error: 'Aguarde alguns segundos antes de concluir a redefinição.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  const nowBlockUntil = new Date(Date.now() + PASSWORD_RESET_MFA_BLOCK_HOURS * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: authToken.userId },
      data: {
        passwordHash,
        refreshTokenHash: null,
        refreshTokenExpiresAt: null,
        failedLoginAttempts: 0,
        lockoutUntil: null,
        lastPasswordResetAt: new Date(),
        mfaChangeBlockedUntil: nowBlockUntil,
      },
    }),
    prisma.authSession.updateMany({
      where: {
        userId: authToken.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokeReason: 'PASSWORD_RESET',
      },
    }),
    prisma.authCode.update({
      where: { id: authToken.id },
      data: {
        consumedAt: new Date(),
      },
    }),
  ]);

  const resetUser = await prisma.user.findUnique({
    where: { id: authToken.userId },
    select: { email: true },
  });

  if (resetUser?.email) {
    try {
      await sendSecurityNoticeEmail({
        to: resetUser.email,
        subject: 'Midori | Alerta de segurança da conta',
        heading: 'Senha alterada com sucesso',
        message: 'Sua senha foi redefinida e todas as sessões anteriores foram encerradas por segurança.',
      });
    } catch {
    }
  }

  await createAuthEvent({
    userId: authToken.userId,
    loginValue: resetUser?.email || null,
    eventType: 'PASSWORD_RESET_SUCCESS',
    ipHash: hashValue(getClientIp(req)),
    deviceIdHash: hashValue(getDeviceId(req)),
    riskLevel: 'high',
  });

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
  const now = new Date();
  const nowBlockUntil = new Date(Date.now() + PASSWORD_RESET_MFA_BLOCK_HOURS * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        refreshTokenHash: null,
        refreshTokenExpiresAt: null,
        failedLoginAttempts: 0,
        lockoutUntil: null,
        lastPasswordResetAt: now,
        mfaChangeBlockedUntil: nowBlockUntil,
      },
    }),
    prisma.authSession.updateMany({
      where: {
        userId: user.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
        revokeReason: 'PASSWORD_RESET',
      },
    }),
  ]);

  const resetUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true },
  });

  if (resetUser?.email) {
    try {
      await sendSecurityNoticeEmail({
        to: resetUser.email,
        subject: 'Midori | Alerta de segurança da conta',
        heading: 'Senha alterada com sucesso',
        message: 'Sua senha foi redefinida e todas as sessões anteriores foram encerradas por segurança.',
      });
    } catch {
    }
  }

  await createAuthEvent({
    userId: user.id,
    loginValue: resetUser?.email || email,
    eventType: 'PASSWORD_RESET_SUCCESS',
    ipHash: hashValue(getClientIp(req)),
    deviceIdHash: hashValue(getDeviceId(req)),
    riskLevel: 'high',
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
    if (payload.type !== 'refresh' || !payload.sessionId) {
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

    const session = await prisma.authSession.findFirst({
      where: {
        id: payload.sessionId,
        userId: user.id,
      },
    });

    const isHashMatch = session && session.refreshTokenHash === hashRefreshToken(refreshToken);
    const isNotExpired = session && session.expiresAt && new Date(session.expiresAt).getTime() > Date.now();
    const isRevoked = session?.revokedAt != null;

    if (!isHashMatch || !isNotExpired || isRevoked) {
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

    await prisma.authSession.update({
      where: { id: session.id },
      data: {
        revokedAt: new Date(),
        revokeReason: 'REFRESH_ROTATION',
      },
    });

    await startSession(req, res, user, {
      deviceIdHash: session.deviceIdHash,
      ipHash: session.ipHash || hashValue(getClientIp(req)),
      userAgent: session.userAgent,
      isPrivileged: Boolean(session.isPrivileged),
    });
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
        if (payload.sessionId) {
          await prisma.authSession.updateMany({
            where: {
              id: payload.sessionId,
              userId: payload.userId,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
              revokeReason: 'LOGOUT',
            },
          });
        }
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

router.get('/sessions', authenticate, async (req, res) => {
  const sessions = await prisma.authSession.findMany({
    where: {
      userId: req.user.userId,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
      revokedAt: true,
      revokeReason: true,
      userAgent: true,
      isPrivileged: true,
    },
  });

  return res.json({
    sessions: sessions.map((session) => ({
      ...session,
      isCurrent: req.user.sessionId === session.id,
    })),
  });
});

router.delete('/sessions/:sessionId', authenticate, async (req, res) => {
  const sessionId = String(req.params.sessionId || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'Sessão inválida.' });

  const updated = await prisma.authSession.updateMany({
    where: {
      id: sessionId,
      userId: req.user.userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
      revokeReason: 'USER_REVOKE_SINGLE',
    },
  });

  if (!updated.count) return res.status(404).json({ error: 'Sessão não encontrada.' });
  if (req.user.sessionId === sessionId) {
    clearAuthCookies(res);
  }

  await createAuthEvent({
    userId: req.user.userId,
    eventType: 'SESSION_REVOKED_SINGLE',
    ipHash: hashValue(getClientIp(req)),
    deviceIdHash: hashValue(getDeviceId(req)),
    riskLevel: 'medium',
    metadata: { sessionId },
  });

  return res.status(204).send();
});

router.post('/sessions/revoke-all', authenticate, async (req, res) => {
  const keepCurrent = Boolean(req.body?.keepCurrent);
  const where = {
    userId: req.user.userId,
    revokedAt: null,
  };

  if (keepCurrent && req.user.sessionId) {
    where.id = { not: req.user.sessionId };
  }

  const result = await prisma.authSession.updateMany({
    where,
    data: {
      revokedAt: new Date(),
      revokeReason: 'USER_REVOKE_ALL',
    },
  });

  if (!keepCurrent) clearAuthCookies(res);

  await createAuthEvent({
    userId: req.user.userId,
    eventType: 'SESSION_REVOKED_ALL',
    ipHash: hashValue(getClientIp(req)),
    deviceIdHash: hashValue(getDeviceId(req)),
    riskLevel: 'high',
    metadata: { keepCurrent, revokedCount: result.count },
  });

  return res.json({ revokedCount: result.count, keepCurrent });
});

router.post('/mfa/backup-codes/regenerate', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { mfaChangeBlockedUntil: true },
  });

  if (user?.mfaChangeBlockedUntil && user.mfaChangeBlockedUntil.getTime() > Date.now()) {
    return res.status(423).json({ error: 'Alterações de MFA estão temporariamente bloqueadas após recuperação de conta.' });
  }

  const backupCodes = await generateAndStoreBackupCodes(req.user.userId);

  await createAuthEvent({
    userId: req.user.userId,
    eventType: 'MFA_BACKUP_CODES_REGENERATED',
    ipHash: hashValue(getClientIp(req)),
    deviceIdHash: hashValue(getDeviceId(req)),
    riskLevel: 'medium',
  });

  return res.json({ backupCodes });
});

router.get('/events', authenticate, async (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit || 50), 100));
  const events = await prisma.authEvent.findMany({
    where: {
      userId: req.user.userId,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      eventType: true,
      riskLevel: true,
      createdAt: true,
      metadata: true,
    },
  });
  return res.json({ events });
});

module.exports = router;
