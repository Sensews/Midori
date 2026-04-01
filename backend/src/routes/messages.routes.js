const express = require('express');

const prisma = require('../prisma');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

async function ensureParticipant(conversationId, userId) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
  });

  return Boolean(participant);
}

async function findDirectConversation(userA, userB) {
  const conversations = await prisma.conversation.findMany({
    where: {
      participants: {
        some: {
          userId: userA,
        },
      },
    },
    include: {
      participants: {
        select: {
          userId: true,
        },
      },
    },
  });

  return conversations.find((conversation) => {
    if (conversation.participants.length !== 2) return false;
    const userIds = conversation.participants.map((item) => item.userId);
    return userIds.includes(userA) && userIds.includes(userB);
  }) || null;
}

router.post('/requests', async (req, res) => {
  const { postId, introMessage } = req.body;

  if (!postId) {
    return res.status(400).json({ error: 'postId é obrigatório.' });
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      title: true,
    },
  });

  if (!post) {
    return res.status(404).json({ error: 'Post não encontrado.' });
  }

  if (post.authorId === req.user.userId) {
    return res.status(400).json({ error: 'Você não pode abrir solicitação para seu próprio post.' });
  }

  const existingPending = await prisma.messageRequest.findFirst({
    where: {
      requesterId: req.user.userId,
      recipientId: post.authorId,
      postId,
      status: 'PENDING',
    },
    select: { id: true },
  });

  if (existingPending) {
    return res.status(409).json({ error: 'Você já enviou uma solicitação para esse post.' });
  }

  const request = await prisma.messageRequest.create({
    data: {
      requesterId: req.user.userId,
      recipientId: post.authorId,
      postId,
      introMessage: typeof introMessage === 'string' ? introMessage.trim().slice(0, 300) : null,
    },
    include: {
      requester: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
      post: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  return res.status(201).json({ request });
});

router.get('/requests/incoming', async (req, res) => {
  const requests = await prisma.messageRequest.findMany({
    where: {
      recipientId: req.user.userId,
      status: 'PENDING',
    },
    orderBy: { createdAt: 'desc' },
    include: {
      requester: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      post: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
        },
      },
    },
  });

  return res.json({ requests });
});

router.post('/requests/:requestId/respond', async (req, res) => {
  const { requestId } = req.params;
  const { accept } = req.body;

  const request = await prisma.messageRequest.findUnique({
    where: { id: requestId },
    include: {
      requester: {
        select: {
          id: true,
          username: true,
          displayName: true,
        },
      },
      post: {
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  if (!request) {
    return res.status(404).json({ error: 'Solicitação não encontrada.' });
  }

  if (request.recipientId !== req.user.userId) {
    return res.status(403).json({ error: 'Você não pode responder essa solicitação.' });
  }

  if (request.status !== 'PENDING') {
    return res.status(400).json({ error: 'Solicitação já respondida.' });
  }

  if (!accept) {
    const declined = await prisma.messageRequest.update({
      where: { id: requestId },
      data: { status: 'DECLINED' },
    });

    return res.json({
      accepted: false,
      request: declined,
    });
  }

  const directConversation = await findDirectConversation(request.requesterId, request.recipientId);
  const intro = request.introMessage || `Olá! Vim através da sua postagem: ${request.post.title}`;

  let conversationId = directConversation?.id || null;

  await prisma.$transaction(async (tx) => {
    if (!conversationId) {
      const created = await tx.conversation.create({
        data: {
          participants: {
            create: [
              { userId: request.requesterId },
              { userId: request.recipientId },
            ],
          },
        },
      });
      conversationId = created.id;
    }

    await tx.messageRequest.update({
      where: { id: requestId },
      data: {
        status: 'ACCEPTED',
      },
    });

    await tx.message.create({
      data: {
        conversationId,
        senderId: request.requesterId,
        content: intro,
      },
    });

    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  });

  return res.json({
    accepted: true,
    conversationId,
    requester: request.requester,
  });
});

router.post('/threads', async (req, res) => {
  const { participantUserId } = req.body;

  if (!participantUserId || participantUserId === req.user.userId) {
    return res.status(400).json({ error: 'participantUserId inválido.' });
  }

  const participant = await prisma.user.findUnique({
    where: { id: participantUserId },
    select: { id: true },
  });

  if (!participant) {
    return res.status(404).json({ error: 'Usuário alvo não encontrado.' });
  }

  const myConversations = await prisma.conversation.findMany({
    where: {
      participants: {
        some: {
          userId: req.user.userId,
        },
      },
    },
    include: {
      participants: {
        select: {
          userId: true,
        },
      },
    },
  });

  const existing = myConversations.find((conversation) => {
    if (conversation.participants.length !== 2) return false;
    const userIds = conversation.participants.map((item) => item.userId);
    return userIds.includes(req.user.userId) && userIds.includes(participantUserId);
  });

  if (existing) {
    return res.json({ conversationId: existing.id, existing: true });
  }

  const conversation = await prisma.conversation.create({
    data: {
      participants: {
        create: [
          { userId: req.user.userId },
          { userId: participantUserId },
        ],
      },
    },
  });

  return res.status(201).json({ conversationId: conversation.id, existing: false });
});

router.get('/threads', async (req, res) => {
  const threads = await prisma.conversation.findMany({
    where: {
      participants: {
        some: {
          userId: req.user.userId,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      participants: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  const mapped = threads.map((thread) => ({
    id: thread.id,
    participants: thread.participants
      .map((p) => p.user)
      .filter((p) => p.id !== req.user.userId),
    lastMessage: thread.messages[0] || null,
    updatedAt: thread.updatedAt,
  }));

  return res.json({ threads: mapped });
});

router.get('/threads/:threadId/messages', async (req, res) => {
  const { threadId } = req.params;

  const isParticipant = await ensureParticipant(threadId, req.user.userId);
  if (!isParticipant) {
    return res.status(403).json({ error: 'Acesso negado a esta conversa.' });
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId: threadId,
    },
    orderBy: { createdAt: 'asc' },
    include: {
      sender: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });

  return res.json({ messages });
});

router.post('/threads/:threadId/messages', async (req, res) => {
  const { threadId } = req.params;
  const { content } = req.body;

  if (!content || !String(content).trim()) {
    return res.status(400).json({ error: 'Mensagem vazia.' });
  }

  const isParticipant = await ensureParticipant(threadId, req.user.userId);
  if (!isParticipant) {
    return res.status(403).json({ error: 'Acesso negado a esta conversa.' });
  }

  const cleanContent = String(content).trim().slice(0, 2000);

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: threadId,
        senderId: req.user.userId,
        content: cleanContent,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    }),
    prisma.conversation.update({
      where: { id: threadId },
      data: { updatedAt: new Date() },
    }),
  ]);

  return res.status(201).json({ message });
});

module.exports = router;
