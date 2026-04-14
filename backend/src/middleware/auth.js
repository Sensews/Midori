const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

function getAccessTokenSecret() {
  return process.env.ACCESS_TOKEN_SECRET || process.env.JWT_SECRET;
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  if (req.cookies?.midori_access) {
    return req.cookies.midori_access;
  }

  return '';
}

async function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Token não informado.' });
  }

  try {
    const payload = jwt.verify(token, getAccessTokenSecret());
    if (payload.type && payload.type !== 'access') {
      return res.status(401).json({ error: 'Token inválido ou expirado.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }

    if (user.role === 'BANNED') {
      return res.status(403).json({ error: 'Conta banida.' });
    }

    req.user = {
      userId: user.id,
      role: user.role,
      sessionId: payload.sessionId || null,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

async function authenticateOptional(req, _res, next) {
  const token = extractToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, getAccessTokenSecret());
    if (payload.type && payload.type !== 'access') {
      req.user = null;
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true },
    });

    if (!user || user.role === 'BANNED') {
      req.user = null;
      return next();
    }

    req.user = {
      userId: user.id,
      role: user.role,
      sessionId: payload.sessionId || null,
    };
  } catch {
    req.user = null;
  }

  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado.' });
    }

    if (req.user.role !== role) {
      return res.status(403).json({ error: 'Permissão insuficiente.' });
    }

    return next();
  };
}

module.exports = {
  authenticate,
  authenticateOptional,
  requireRole,
};
