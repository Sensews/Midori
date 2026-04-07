# Midori

Projeto web do Midori com front-end em HTML/CSS/JS e backend Node.js + Prisma (SQLite).

## Estrutura

- Front-end estático na raiz (`index.html`, `perfil.html`, `mensagens.html`, etc.)
- Backend em [backend/src/server.js](backend/src/server.js)
- Banco relacional com Prisma em [backend/prisma/schema.prisma](backend/prisma/schema.prisma)

## Banco e API (completo)

O backend implementa:

- Cadastro/login com hash de senha (`bcrypt`)
- JWT para autenticação
- Perfis de usuário
- Posts (doação/exposição)
- Compressão de imagem no upload (`sharp` → `webp`)
- Likes e comentários relacionais
- Mensagens entre usuários (conversas + mensagens)
- Solicitação de mensagem por post (com aceite do dono)
- Permissões por papel (`USER` e `SUPERADMIN`)
- Moderação de postagens por superadmin

## Home (feed principal)

- Página: [home.html](home.html)
- Exibe postagens no centro em formato swipe
- `←` pula para próxima postagem
- `→` curte e avança
- Clique no card abre detalhes para curtir, comentar e enviar solicitação de mensagem ao dono

## Como rodar

1. Entre na pasta backend:

```bash
cd backend
```

2. Instale dependências:

```bash
npm install
```

3. Crie o arquivo `.env` com base no `.env.example`.

	Campos mínimos:
	- `DATABASE_URL`
	- `JWT_SECRET`
	- `SUPERADMIN_EMAIL`
	- `SUPERADMIN_USERNAME`
	- `SUPERADMIN_PASSWORD`
	- `DEMO_USER_PASSWORD`

	> Use valores fortes e únicos. Nunca commite o arquivo `.env`.

4. Gere o cliente Prisma e aplique migração:

```bash
npm run prisma:generate
npm run prisma:migrate
```

5. Crie/atualize o superadmin:

```bash
npm run seed
```

6. Suba a API:

```bash
npm run dev
```

API padrão em `http://localhost:4000`.

## Segurança de segredos

- Se um segredo vazar em commit/PR, **revogue e gere outro** imediatamente.
- Atualize os valores no `.env` local (ou cofre de segredos do deploy).
- O seed lê credenciais apenas de variáveis de ambiente; não mantenha senhas fixas no código.
- Recomenda-se rodar scanner de segredos no pre-commit (ex.: `ggshield` ou `gitleaks`).

## Principais rotas

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Perfil

- `GET /api/profile/me`
- `PUT /api/profile/me`
- `POST /api/profile/me/avatar` (multipart campo `avatar`)
- `GET /api/profile/:username`

### Posts / likes / comentários

- `GET /api/posts`
- `GET /api/posts/:postId`
- `POST /api/posts` (multipart campo opcional `image`)
- `PUT /api/posts/:postId` (autor ou superadmin)
- `DELETE /api/posts/:postId` (autor ou superadmin)
- `POST /api/posts/:postId/likes`
- `POST /api/posts/:postId/comments`
- `DELETE /api/posts/comments/:commentId`

### Mensagens

- `POST /api/messages/threads`
- `GET /api/messages/threads`
- `GET /api/messages/threads/:threadId/messages`
- `POST /api/messages/threads/:threadId/messages`
- `POST /api/messages/requests` (solicitar conversa a partir de um post)
- `GET /api/messages/requests/incoming` (solicitações pendentes para o dono)
- `POST /api/messages/requests/:requestId/respond` (aceitar/recusar)

### Admin

- `GET /api/admin/users` (somente `SUPERADMIN`)
- `DELETE /api/admin/posts/:postId` (somente `SUPERADMIN`)

## Permissões

- Usuário comum (`USER`) pode gerenciar seu próprio perfil, posts, likes e comentários.
- `SUPERADMIN` pode remover postagens de qualquer perfil.
- Toda remoção administrativa de post gera registro em `ModerationAction`.

## Observações

- Arquivos enviados ficam em `backend/uploads` e são ignorados no Git.
- Banco local (`SQLite`) fica em `backend/dev.db` e também é ignorado no Git.

## Escalabilidade (rede maior no futuro)

O front usa [api-client.js](api-client.js) e aceita trocar a URL da API sem alterar código de tela:

- Em runtime, defina `window.MIDORI_API_BASE` antes dos scripts de página.
- Ou grave `localStorage.setItem('midori.api.base', 'https://seu-dominio/api')`.

Exemplo de evolução futura:

- Hoje: API local em `http://localhost:4000/api` (SQLite).
- Amanhã: API atrás de WAF/DMZ com banco gerenciado (PostgreSQL/MySQL), mantendo o mesmo frontend.

