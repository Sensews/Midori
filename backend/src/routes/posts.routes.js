const express = require('express');

const prisma = require('../prisma');
const { authenticate, authenticateOptional } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { saveCompressedImage } = require('../utils/storage');

const router = express.Router();

router.get('/interactions/me', authenticate, async (req, res) => {
  const likedPosts = await prisma.post.findMany({
    where: {
      likes: {
        some: {
          userId: req.user.userId,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      likes: {
        select: {
          userId: true,
        },
      },
      _count: {
        select: {
          likes: true,
          comments: true,
        },
      },
    },
    take: 30,
  });

  const commentedPostsRaw = await prisma.post.findMany({
    where: {
      comments: {
        some: {
          userId: req.user.userId,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      likes: {
        select: {
          userId: true,
        },
      },
      _count: {
        select: {
          likes: true,
          comments: true,
        },
      },
    },
    take: 30,
  });

  const dedupCommentsMap = new Map();
  commentedPostsRaw.forEach((post) => {
    if (!dedupCommentsMap.has(post.id)) {
      dedupCommentsMap.set(post.id, post);
    }
  });

  const withLikedByMe = (post) => ({
    ...post,
    likedByMe: post.likes.some((like) => like.userId === req.user.userId),
  });

  return res.json({
    likedPosts: likedPosts.map(withLikedByMe),
    commentedPosts: [...dedupCommentsMap.values()].map(withLikedByMe),
  });
});

router.get('/', authenticateOptional, async (req, res) => {
  const { type, author } = req.query;

  const where = {};

  if (type === 'DONATION' || type === 'EXHIBITION') {
    where.type = type;
  }

  if (author) {
    where.author = {
      username: String(author).toLowerCase(),
    };
  }

  const posts = await prisma.post.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      likes: {
        select: {
          userId: true,
        },
      },
      _count: {
        select: {
          likes: true,
          comments: true,
        },
      },
    },
  });

  const mappedPosts = posts.map((post) => {
    const likedByMe = req.user ? post.likes.some((like) => like.userId === req.user.userId) : false;
    return {
      ...post,
      likedByMe,
    };
  });

  return res.json({ posts: mappedPosts });
});

router.get('/:postId', authenticateOptional, async (req, res) => {
  const { postId } = req.params;

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      likes: {
        select: {
          userId: true,
        },
      },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
            },
          },
        },
      },
    },
  });

  if (!post) {
    return res.status(404).json({ error: 'Post não encontrado.' });
  }

  const likedByMe = req.user ? post.likes.some((like) => like.userId === req.user.userId) : false;

  return res.json({
    post: {
      ...post,
      likedByMe,
    },
  });
});

router.post('/', authenticate, upload.single('image'), async (req, res) => {
  const { title, description, type } = req.body;

  if (!title || !description || !type) {
    return res.status(400).json({ error: 'Campos obrigatórios: title, description, type.' });
  }

  if (type !== 'DONATION' && type !== 'EXHIBITION') {
    return res.status(400).json({ error: 'type deve ser DONATION ou EXHIBITION.' });
  }

  let imageUrl = null;
  if (req.file) {
    imageUrl = await saveCompressedImage(req.file, 'posts', {
      width: 1800,
      quality: 75,
    });
  }

  const post = await prisma.post.create({
    data: {
      authorId: req.user.userId,
      title: String(title).trim(),
      description: String(description).trim(),
      type,
      imageUrl,
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
  });

  return res.status(201).json({ post });
});

router.put('/:postId', authenticate, upload.single('image'), async (req, res) => {
  const { postId } = req.params;
  const { title, description, isDonationCompleted } = req.body;

  const post = await prisma.post.findUnique({ where: { id: postId } });

  if (!post) {
    return res.status(404).json({ error: 'Post não encontrado.' });
  }

  const canEdit = post.authorId === req.user.userId || req.user.role === 'SUPERADMIN';
  if (!canEdit) {
    return res.status(403).json({ error: 'Sem permissão para editar esse post.' });
  }

  const data = {};
  if (typeof title === 'string') data.title = title.trim();
  if (typeof description === 'string') data.description = description.trim();
  if (typeof isDonationCompleted !== 'undefined') {
    data.isDonationCompleted = String(isDonationCompleted) === 'true' || isDonationCompleted === true;
  }

  if (req.file) {
    data.imageUrl = await saveCompressedImage(req.file, 'posts', {
      width: 1800,
      quality: 75,
    });
  }

  const updated = await prisma.post.update({
    where: { id: postId },
    data,
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
      _count: {
        select: {
          likes: true,
          comments: true,
        },
      },
    },
  });

  return res.json({ post: updated });
});

router.delete('/:postId', authenticate, async (req, res) => {
  const { postId } = req.params;
  const { reason } = req.body || {};

  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) {
    return res.status(404).json({ error: 'Post não encontrado.' });
  }

  const isOwner = post.authorId === req.user.userId;
  const isSuperadmin = req.user.role === 'SUPERADMIN';

  if (!isOwner && !isSuperadmin) {
    return res.status(403).json({ error: 'Sem permissão para remover esse post.' });
  }

  await prisma.$transaction(async (tx) => {
    if (isSuperadmin && !isOwner) {
      await tx.moderationAction.create({
        data: {
          adminId: req.user.userId,
          postId,
          action: 'DELETE_POST',
          reason: reason ? String(reason).trim().slice(0, 300) : null,
        },
      });
    }

    await tx.post.delete({ where: { id: postId } });
  });

  return res.status(204).send();
});

router.post('/:postId/likes', authenticate, async (req, res) => {
  const { postId } = req.params;

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) {
    return res.status(404).json({ error: 'Post não encontrado.' });
  }

  const existing = await prisma.like.findUnique({
    where: {
      userId_postId: {
        userId: req.user.userId,
        postId,
      },
    },
  });

  if (existing) {
    await prisma.like.delete({
      where: {
        userId_postId: {
          userId: req.user.userId,
          postId,
        },
      },
    });
  } else {
    await prisma.like.create({
      data: {
        userId: req.user.userId,
        postId,
      },
    });
  }

  const totalLikes = await prisma.like.count({ where: { postId } });

  return res.json({
    liked: !existing,
    totalLikes,
  });
});

router.post('/:postId/comments', authenticate, async (req, res) => {
  const { postId } = req.params;
  const { content } = req.body;

  if (!content || !String(content).trim()) {
    return res.status(400).json({ error: 'Comentário vazio.' });
  }

  const post = await prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
  if (!post) {
    return res.status(404).json({ error: 'Post não encontrado.' });
  }

  const comment = await prisma.comment.create({
    data: {
      postId,
      userId: req.user.userId,
      content: String(content).trim().slice(0, 600),
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
    },
  });

  return res.status(201).json({ comment });
});

router.delete('/comments/:commentId', authenticate, async (req, res) => {
  const { commentId } = req.params;

  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) {
    return res.status(404).json({ error: 'Comentário não encontrado.' });
  }

  const canDelete = comment.userId === req.user.userId || req.user.role === 'SUPERADMIN';
  if (!canDelete) {
    return res.status(403).json({ error: 'Sem permissão para remover esse comentário.' });
  }

  await prisma.comment.delete({ where: { id: commentId } });

  return res.status(204).send();
});

module.exports = router;
