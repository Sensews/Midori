const express = require('express');

const prisma = require('../prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(requireRole('SUPERADMIN'));

router.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
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

module.exports = router;
