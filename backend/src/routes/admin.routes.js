const express = require('express');

const prisma = require('../prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(requireRole('SUPERADMIN'));

router.get('/reports', async (req, res) => {
  const status = String(req.query.status || '').toUpperCase();
  const username = String(req.query.username || '').trim().toLowerCase();
  const where = {};

  if (status === 'PENDING' || status === 'RESOLVED' || status === 'REJECTED') {
    where.status = status;
  }

  if (username) {
    where.OR = [
      {
        targetUser: {
          username,
        },
      },
      {
        reporter: {
          username,
        },
      },
      {
        post: {
          author: {
            username,
          },
        },
      },
    ];
  }

  const reports = await prisma.report.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      reporter: {
        select: { id: true, username: true, displayName: true, role: true },
      },
      targetUser: {
        select: { id: true, username: true, displayName: true, role: true, avatarUrl: true },
      },
      post: {
        select: {
          id: true,
          title: true,
          description: true,
          imageUrl: true,
          type: true,
          createdAt: true,
          author: {
            select: { id: true, username: true, displayName: true },
          },
          _count: {
            select: { likes: true, comments: true },
          },
        },
      },
      reviewedBy: {
        select: { id: true, username: true, displayName: true },
      },
    },
    take: 200,
  });

  return res.json({ reports });
});

router.patch('/reports/:reportId', async (req, res) => {
  const { reportId } = req.params;
  const { status, adminNote } = req.body || {};
  const nextStatus = String(status || '').toUpperCase();

  if (!['PENDING', 'RESOLVED', 'REJECTED'].includes(nextStatus)) {
    return res.status(400).json({ error: 'status deve ser PENDING, RESOLVED ou REJECTED.' });
  }

  const existing = await prisma.report.findUnique({ where: { id: reportId } });
  if (!existing) {
    return res.status(404).json({ error: 'Denúncia não encontrada.' });
  }

  const updated = await prisma.report.update({
    where: { id: reportId },
    data: {
      status: nextStatus,
      adminNote: adminNote ? String(adminNote).trim().slice(0, 500) : null,
      reviewedById: req.user.userId,
      reviewedAt: nextStatus === 'PENDING' ? null : new Date(),
    },
    include: {
      reporter: {
        select: { id: true, username: true, displayName: true },
      },
      targetUser: {
        select: { id: true, username: true, displayName: true, role: true, avatarUrl: true },
      },
      post: {
        select: { id: true, title: true, imageUrl: true },
      },
      reviewedBy: {
        select: { id: true, username: true, displayName: true },
      },
    },
  });

  return res.json({ report: updated });
});

router.get('/users', async (req, res) => {
  const query = String(req.query.query || '').trim().toLowerCase();
  const where = query
    ? {
      OR: [
        { username: { contains: query } },
        { displayName: { contains: query } },
      ],
    }
    : {};

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      displayName: true,
      email: true,
      role: true,
      createdAt: true,
      _count: {
        select: {
          posts: true,
          comments: true,
        },
      },
    },
  });

  return res.json({ users });
});

router.delete('/posts/:postId', async (req, res) => {
  const { postId } = req.params;
  const { reason } = req.body || {};

  const post = await prisma.post.findUnique({ where: { id: postId } });

  if (!post) {
    return res.status(404).json({ error: 'Post não encontrado.' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.moderationAction.create({
      data: {
        adminId: req.user.userId,
        postId,
        action: 'DELETE_POST',
        reason: reason ? String(reason).trim().slice(0, 300) : null,
      },
    });

    await tx.post.delete({ where: { id: postId } });
  });

  return res.status(204).send();
});

router.post('/users/:userId/ban', async (req, res) => {
  const { userId } = req.params;
  const { reason } = req.body || {};

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  if (user.role === 'SUPERADMIN') {
    return res.status(400).json({ error: 'Não é permitido banir outro SUPERADMIN.' });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: 'BANNED' },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      email: true,
    },
  });

  await prisma.report.updateMany({
    where: {
      targetUserId: userId,
      status: 'PENDING',
    },
    data: {
      status: 'RESOLVED',
      adminNote: reason ? String(reason).trim().slice(0, 500) : 'Usuário banido por moderação.',
      reviewedById: req.user.userId,
      reviewedAt: new Date(),
    },
  });

  return res.json({ user: updated });
});

router.post('/users/:userId/unban', async (req, res) => {
  const { userId } = req.params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado.' });
  }

  if (user.role === 'SUPERADMIN') {
    return res.status(400).json({ error: 'SUPERADMIN não precisa de desbanimento.' });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: 'USER' },
    select: {
      id: true,
      username: true,
      displayName: true,
      role: true,
      email: true,
    },
  });

  return res.json({ user: updated });
});

module.exports = router;
