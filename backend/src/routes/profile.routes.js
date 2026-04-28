const express = require('express');

const prisma = require('../prisma');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { saveCompressedImage } = require('../utils/storage');

const router = express.Router();

function normalizeCpf(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits || null;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits || null;
}

router.get('/me', authenticate, async (req, res) => {
  const profile = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      role: true,
      cpf: true,
      phone: true,
      bio: true,
      avatarUrl: true,
      publicKeyJwk: true,
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

router.get('/me/keys', authenticate, async (req, res) => {
  const keys = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      publicKeyJwk: true,
      encryptedPrivateKey: true,
      privateKeySalt: true,
    },
  });

  return res.json({ keys });
});

router.put('/me/keys', authenticate, async (req, res) => {
  const { publicKeyJwk, encryptedPrivateKey, privateKeySalt } = req.body || {};

  if (!publicKeyJwk || typeof publicKeyJwk !== 'object') {
    return res.status(400).json({ error: 'publicKeyJwk é obrigatório.' });
  }

  if (encryptedPrivateKey != null && typeof encryptedPrivateKey !== 'string') {
    return res.status(400).json({ error: 'encryptedPrivateKey deve ser string.' });
  }

  if (privateKeySalt != null && typeof privateKeySalt !== 'string') {
    return res.status(400).json({ error: 'privateKeySalt deve ser string.' });
  }

  const data = {
    publicKeyJwk,
  };

  const body = req.body || {};
  if (Object.prototype.hasOwnProperty.call(body, 'encryptedPrivateKey')) {
    data.encryptedPrivateKey = encryptedPrivateKey || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'privateKeySalt')) {
    data.privateKeySalt = privateKeySalt || null;
  }

  const updated = await prisma.user.update({
    where: { id: req.user.userId },
    data,
    select: {
      publicKeyJwk: true,
      privateKeySalt: true,
    },
  });

  return res.json({ keys: updated });
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
      publicKeyJwk: true,
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
  const { displayName, bio, cpf, phone } = req.body;

  if (!displayName || String(displayName).trim().length < 2) {
    return res.status(400).json({ error: 'displayName deve ter ao menos 2 caracteres.' });
  }

  const shouldUpdateCpf = Object.prototype.hasOwnProperty.call(req.body || {}, 'cpf');
  const shouldUpdatePhone = Object.prototype.hasOwnProperty.call(req.body || {}, 'phone');

  const data = {
    displayName: String(displayName).trim(),
    bio: bio ? String(bio).trim().slice(0, 280) : null,
  };

  if (shouldUpdateCpf) {
    const normalizedCpf = normalizeCpf(cpf);
    if (normalizedCpf && normalizedCpf.length !== 11) {
      return res.status(400).json({ error: 'CPF inválido. Use 11 dígitos.' });
    }

    if (normalizedCpf) {
      const existingCpf = await prisma.user.findFirst({
        where: {
          cpf: normalizedCpf,
          id: { not: req.user.userId },
        },
        select: { id: true },
      });

      if (existingCpf) {
        return res.status(409).json({ error: 'CPF já cadastrado para outro usuário.' });
      }
    }

    data.cpf = normalizedCpf;
  }

  if (shouldUpdatePhone) {
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone && (normalizedPhone.length < 10 || normalizedPhone.length > 13)) {
      return res.status(400).json({ error: 'Telefone inválido. Use entre 10 e 13 dígitos.' });
    }
    data.phone = normalizedPhone;
  }

  const user = await prisma.user.update({
    where: { id: req.user.userId },
    data,
    select: {
      id: true,
      username: true,
      displayName: true,
      cpf: true,
      phone: true,
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
