require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('../src/prisma');

const DEMO_PASSWORD = 'SenhaForte123!';

const demoUsers = [
  {
    email: 'alice.mori@midori.test',
    username: 'alice_mori',
    displayName: 'Alice Mori',
    bio: 'Apaixonada por plantas de sombra 🌿',
    avatarUrl: 'https://api.dicebear.com/9.x/bottts/svg?seed=alice-mori',
  },
  {
    email: 'bruno.verde@midori.test',
    username: 'bruno_verde',
    displayName: 'Bruno Verde',
    bio: 'Cultivo urbano em apartamento.',
    avatarUrl: 'https://api.dicebear.com/9.x/bottts/svg?seed=bruno-verde',
  },
  {
    email: 'carla.flor@midori.test',
    username: 'carla_flor',
    displayName: 'Carla Flor',
    bio: 'Trocas, doações e muita jardinagem ✨',
    avatarUrl: 'https://api.dicebear.com/9.x/bottts/svg?seed=carla-flor',
  },
  {
    email: 'diego.raiz@midori.test',
    username: 'diego_raiz',
    displayName: 'Diego Raiz',
    bio: 'Orquídeas e suculentas para todos.',
    avatarUrl: 'https://api.dicebear.com/9.x/bottts/svg?seed=diego-raiz',
  },
];

const demoPostCatalog = [
  { title: 'Jiboia saudável para doação', description: 'Muda grande, já enraizada, ideal para sala.', type: 'DONATION', imageUrl: 'https://picsum.photos/id/1011/1200/800' },
  { title: 'Coleção de suculentas', description: 'Exposição com mini suculentas coloridas.', type: 'EXHIBITION', imageUrl: 'https://picsum.photos/id/1025/1200/800' },
  { title: 'Samambaia pronta para adoção', description: 'Muito volumosa, precisa de espaço e carinho.', type: 'DONATION', imageUrl: 'https://picsum.photos/id/103/1200/800' },
  { title: 'Vaso decorativo com lavanda', description: 'Perfume natural e flores lindas no fim da tarde.', type: 'EXHIBITION', imageUrl: 'https://picsum.photos/id/1040/1200/800' },
  { title: 'Muda de costela-de-adão', description: 'Muda nova, ótima para ambiente interno.', type: 'DONATION', imageUrl: 'https://picsum.photos/id/106/1200/800' },
  { title: 'Bromélia em destaque', description: 'Postagem para admirar as cores vibrantes.', type: 'EXHIBITION', imageUrl: 'https://picsum.photos/id/1074/1200/800' },
  { title: 'Begônia para replantio', description: 'Já adaptada, fácil manutenção.', type: 'DONATION', imageUrl: 'https://picsum.photos/id/1084/1200/800' },
  { title: 'Terrário fechado artesanal', description: 'Projeto em vidro, visual moderno.', type: 'EXHIBITION', imageUrl: 'https://picsum.photos/id/1080/1200/800' },
];

function pickPostsForUser(startIndex, amount) {
  const result = [];
  for (let i = 0; i < amount; i += 1) {
    const base = demoPostCatalog[(startIndex + i) % demoPostCatalog.length];
    result.push({
      ...base,
      title: `${base.title} #${i + 1}`,
    });
  }
  return result;
}

async function main() {
  const email = process.env.SUPERADMIN_EMAIL;
  const username = process.env.SUPERADMIN_USERNAME;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !username || !password) {
    throw new Error('Defina SUPERADMIN_EMAIL, SUPERADMIN_USERNAME e SUPERADMIN_PASSWORD no .env.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {
      username,
      passwordHash,
      role: 'SUPERADMIN',
      displayName: 'Super Admin',
    },
    create: {
      email,
      username,
      passwordHash,
      role: 'SUPERADMIN',
      displayName: 'Super Admin',
    },
  });

  const demoPasswordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  for (const userData of demoUsers) {
    await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        username: userData.username,
        displayName: userData.displayName,
        bio: userData.bio,
        avatarUrl: userData.avatarUrl,
        passwordHash: demoPasswordHash,
      },
      create: {
        email: userData.email,
        username: userData.username,
        displayName: userData.displayName,
        bio: userData.bio,
        avatarUrl: userData.avatarUrl,
        passwordHash: demoPasswordHash,
      },
    });
  }

  const allDemoUsers = await prisma.user.findMany({
    where: {
      email: {
        in: demoUsers.map((userItem) => userItem.email),
      },
    },
    select: {
      id: true,
      email: true,
      username: true,
    },
  });

  const demoUserIds = allDemoUsers.map((userItem) => userItem.id);

  await prisma.post.deleteMany({
    where: {
      authorId: {
        in: demoUserIds,
      },
    },
  });

  const createdPosts = [];

  for (let index = 0; index < allDemoUsers.length; index += 1) {
    const demoUser = allDemoUsers[index];
    const posts = pickPostsForUser(index * 2, 5);

    for (const postData of posts) {
      const createdPost = await prisma.post.create({
        data: {
          authorId: demoUser.id,
          title: postData.title,
          description: postData.description,
          type: postData.type,
          imageUrl: postData.imageUrl,
        },
      });
      createdPosts.push(createdPost);
    }
  }

  for (let postIndex = 0; postIndex < createdPosts.length; postIndex += 1) {
    const postItem = createdPosts[postIndex];
    const likeUserA = allDemoUsers[postIndex % allDemoUsers.length];
    const likeUserB = allDemoUsers[(postIndex + 1) % allDemoUsers.length];

    if (likeUserA.id !== postItem.authorId) {
      await prisma.like.create({
        data: {
          userId: likeUserA.id,
          postId: postItem.id,
        },
      });
    }

    if (likeUserB.id !== postItem.authorId && likeUserB.id !== likeUserA.id) {
      await prisma.like.create({
        data: {
          userId: likeUserB.id,
          postId: postItem.id,
        },
      });
    }

    const commentAuthor = allDemoUsers[(postIndex + 2) % allDemoUsers.length];
    if (commentAuthor.id !== postItem.authorId) {
      await prisma.comment.create({
        data: {
          userId: commentAuthor.id,
          postId: postItem.id,
          content: `Post lindo! Quero saber mais sobre essa planta (${postIndex + 1}).`,
        },
      });
    }
  }

  console.log('Superadmin criado/atualizado com sucesso.');
  console.log(`Perfis de teste criados: ${allDemoUsers.length}`);
  console.log(`Postagens de teste criadas: ${createdPosts.length}`);
  console.log(`Senha padrão dos perfis de teste: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
