const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const uploadRoot = path.join(__dirname, '..', '..', 'uploads');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function saveCompressedImage(file, folder, options = {}) {
  const {
    width = 1600,
    quality = 78,
  } = options;

  const safeFolder = folder || 'posts';
  const targetDir = path.join(uploadRoot, safeFolder);
  await ensureDir(targetDir);

  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.webp`;
  const absolutePath = path.join(targetDir, fileName);

  await sharp(file.buffer)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toFile(absolutePath);

  return `/uploads/${safeFolder}/${fileName}`;
}

module.exports = {
  saveCompressedImage,
};
