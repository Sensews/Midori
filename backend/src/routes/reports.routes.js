const express = require('express');

const prisma = require('../prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, async (req, res) => {
  const { targetUserId, postId, reason, details } = req.body || {};

  if (req.user.role === 'SUPERADMIN') {
    return res.status(403).json({ error: 'SUPERADMIN não pode abrir denúncias.' });
  }

  const cleanReason = String(reason || '').trim();
  const cleanDetails = String(details || '').trim();

  if (!cleanReason || cleanReason.length < 4) {
    return res.status(400).json({ error: 'Informe um motivo da denúncia (mín. 4 caracteres).' });
  }

  if (!targetUserId && !postId) {
    return res.status(400).json({ error: 'A denúncia deve referenciar um usuário ou uma postagem.' });
  }

  let resolvedPost = null;
  if (postId) {
    resolvedPost = await prisma.post.findUnique({
      where: { id: String(postId) },
      select: { id: true, authorId: true },
    });

    if (!resolvedPost) {
      return res.status(404).json({ error: 'Postagem não encontrada para denúncia.' });
    }
  }

  const finalTargetUserId = targetUserId || resolvedPost?.authorId || null;

  if (!finalTargetUserId) {
    return res.status(400).json({ error: 'Não foi possível identificar o usuário denunciado.' });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: String(finalTargetUserId) },
    select: { id: true },
  });

  if (!targetUser) {
    return res.status(404).json({ error: 'Usuário denunciado não encontrado.' });
  }

  if (finalTargetUserId === req.user.userId) {
    return res.status(400).json({ error: 'Você não pode denunciar a si mesmo.' });
  }

  const report = await prisma.report.create({
    data: {
      reporterId: req.user.userId,
      targetUserId: finalTargetUserId,
      postId: resolvedPost?.id || null,
      reason: cleanReason.slice(0, 120),
      details: cleanDetails ? cleanDetails.slice(0, 500) : null,
    },
    include: {
      reporter: {
        select: { id: true, username: true, displayName: true },
      },
      targetUser: {
        select: { id: true, username: true, displayName: true },
      },
      post: {
        select: { id: true, title: true, imageUrl: true },
      },
    },
  });

  return res.status(201).json({ report });
});

module.exports = router;
