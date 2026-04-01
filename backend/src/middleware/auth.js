const jwt = require('jsonwebtoken');
const prisma = require('../prisma');

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não informado.' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
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
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
}

async function authenticateOptional(req, _res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
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
