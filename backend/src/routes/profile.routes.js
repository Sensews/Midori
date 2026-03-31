const express = require('express');

const prisma = require('../prisma');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { saveCompressedImage } = require('../utils/storage');

const router = express.Router();

router.get('/me', authenticate, async (req, res) => {
  const profile = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      role: true,
      bio: true,
      avatarUrl: true,
      createdAt: true,
      _count: {
        select: {
          posts: true,
          comments: true,
        },
      },
    },
  });

  return res.json({ profile });
});

router.get('/:username', async (req, res) => {
  const username = String(req.params.username || '').toLowerCase();

  const profile = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      createdAt: true,
      _count: {
        select: {
          posts: true,
          comments: true,
          likes: true,
        },
      },
    },
  });

  if (!profile) {
    return res.status(404).json({ error: 'Perfil não encontrado.' });
  }

  return res.json({ profile });
});

router.put('/me', authenticate, async (req, res) => {
  const { displayName, bio } = req.body;

  if (!displayName || String(displayName).trim().length < 2) {
    return res.status(400).json({ error: 'displayName deve ter ao menos 2 caracteres.' });
  }

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: {
      displayName: String(displayName).trim(),
      bio: bio ? String(bio).trim().slice(0, 280) : null,
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
    },
  });

  return res.json({ user });
});

router.post('/me/avatar', authenticate, upload.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Envie uma imagem para avatar.' });
  }

  const avatarUrl = await saveCompressedImage(req.file, 'avatars', {
    width: 600,
    quality: 76,
  });

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data: { avatarUrl },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  });

  return res.json({ user });
});

module.exports = router;
