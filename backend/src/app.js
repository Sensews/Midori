require('express-async-errors');

const path = require('node:path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const postRoutes = require('./routes/posts.routes');
const messageRoutes = require('./routes/messages.routes');
const reportRoutes = require('./routes/reports.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api', (_req, res) => {
  return res.status(404).json({ error: 'Rota não encontrada.' });
});

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'JSON inválido.' });
  }

  if (err.message && err.message.includes('Arquivo inválido')) {
    return res.status(400).json({ error: err.message });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Imagem maior que 5MB.' });
  }

  return res.status(500).json({ error: 'Erro interno do servidor.' });
});

module.exports = app;
