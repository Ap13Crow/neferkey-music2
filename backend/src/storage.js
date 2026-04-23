const fs = require('fs');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

const isGcsEnabled = Boolean(process.env.GCS_UPLOAD_BUCKET);
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');
const gcsBucketName = process.env.GCS_UPLOAD_BUCKET || '';
const gcsPrefix = (process.env.GCS_UPLOAD_PREFIX || 'uploads').replace(/^\/+|\/+$/g, '');

const storage = isGcsEnabled ? new Storage() : null;
const bucket = storage ? storage.bucket(gcsBucketName) : null;

function makeFilename(originalname) {
  const ext = path.extname(originalname || '').toLowerCase();
  return `${crypto.randomUUID()}${ext}`;
}

const crypto = require('crypto');

function buildObjectKey(subfolder, filename) {
  return `${gcsPrefix}/${subfolder}/${filename}`;
}

function toPublicGcsUrl(objectKey) {
  const encodedPath = objectKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://storage.googleapis.com/${gcsBucketName}/${encodedPath}`;
}

async function storeUpload({ file, subfolder, filename }) {
  if (isGcsEnabled) {
    const objectKey = buildObjectKey(subfolder, filename);
    const gcsFile = bucket.file(objectKey);
    await gcsFile.save(file.buffer, {
      resumable: false,
      metadata: {
        contentType: file.mimetype || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    return {
      filePath: objectKey,
      publicUrl: toPublicGcsUrl(objectKey),
    };
  }

  const dir = path.join(uploadsDir, subfolder);
  fs.mkdirSync(dir, { recursive: true });
  const targetPath = path.join(dir, filename);
  fs.writeFileSync(targetPath, file.buffer);

  return {
    filePath: `${subfolder}/${filename}`,
    publicUrl: `/uploads/${subfolder}/${filename}`,
  };
}

module.exports = {
  isGcsEnabled,
  makeFilename,
  storeUpload,
};
