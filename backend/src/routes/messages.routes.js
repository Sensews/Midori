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
