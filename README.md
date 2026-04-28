# Midori

Projeto acadêmico em desenvolvimento (trabalho de faculdade), com foco em evolução contínua e revisão de segurança ao longo do semestre.

Este README foi escrito para onboarding do grupo e configuração local, sem expor detalhes sensíveis de implementação.

## Status do projeto

- Em desenvolvimento ativo.
- Estrutura e regras podem mudar conforme novas entregas.
- O banco pode ser recriado do zero a qualquer momento no ambiente local.

## Estrutura geral

- Front-end estático na raiz do repositório.
- Backend em [backend](backend).
- Modelo de dados Prisma em [backend/prisma/schema.prisma](backend/prisma/schema.prisma).
- Script SQL base para MySQL em [backend/prisma/mysql-init.sql](backend/prisma/mysql-init.sql).
- Deploy do frontend no laboratorio: [docs/deploy-frontend-34.md](docs/deploy-frontend-34.md).

## Pré-requisitos

- Node.js 20+ e `npm`.
- MySQL Server 8+.
- DBeaver (ou outro cliente SQL).

## Configuração do banco (MySQL + DBeaver)

1. No MySQL, crie um banco vazio (ex.: `midori`).
2. No DBeaver, conecte no seu servidor MySQL.
3. Execute o script [backend/prisma/mysql-init.sql](backend/prisma/mysql-init.sql) no banco criado.
4. Crie um usuário local com permissão nesse banco (recomendado para desenvolvimento).

## Configuração do backend

1. Entre na pasta do backend:

```bash
cd backend
```

2. Instale as dependências:

```bash
npm install
```

3. Crie o `.env` a partir de [backend/.env.example](backend/.env.example).

4. Preencha os campos obrigatórios no `.env`:

- `DATABASE_URL`
- `JWT_SECRET`
- `ACCESS_TOKEN_SECRET`
- `REFRESH_TOKEN_SECRET`
- `LOGIN_CHALLENGE_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `SUPERADMIN_EMAIL`
- `SUPERADMIN_USERNAME`
- `SUPERADMIN_PASSWORD`
- `DEMO_USER_PASSWORD`

5. Gere o client Prisma:

```bash
npm run prisma:generate
```

6. Rode o seed (cria/atualiza dados iniciais, como usuário administrativo):

```bash
npm run seed
```

7. Suba a API:

```bash
npm run dev
```

API local padrão: `http://localhost:4000`.

## Exemplo de `DATABASE_URL`

Use no `.env` (ajuste usuário/senha/host conforme sua máquina):

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/midori?connection_limit=10"
```

## Boas práticas para o grupo

- Nunca subir `.env` para Git.
- Nunca compartilhar senha/token em print, commit, issue ou README.
- Cada integrante usa credenciais locais próprias.
- Se algum segredo vazar, revogar e gerar novo imediatamente.
- Antes de abrir PR, validar que não há credenciais hardcoded.

## Fluxo recomendado para novos integrantes

1. Clonar o repositório.
2. Configurar banco MySQL local e executar o SQL base.
3. Configurar `.env` local.
4. Rodar `npm install`, `npm run prisma:generate`, `npm run seed`.
5. Rodar `npm run dev` e validar funcionamento básico.

## Observações finais

- Este documento evita descrever rotas internas, payloads e regras detalhadas para reduzir exposição desnecessária.
- Para desenvolvimento interno do grupo, alinhem detalhes técnicos em canais privados (reunião, documento interno privado ou pair programming).
