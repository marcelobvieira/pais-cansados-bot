const TELEGRAM_FILE_BASE = 'https://api.telegram.org/file';

function ensureTelegramToken() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not configured');
  }
}

function getLargestPhoto(photos = []) {
  if (!Array.isArray(photos) || photos.length === 0) {
    return null;
  }

  return [...photos].sort((a, b) => {
    const areaA = (a.width || 0) * (a.height || 0);
    const areaB = (b.width || 0) * (b.height || 0);
    return areaB - areaA;
  })[0];
}

async function buildTelegramFileUrl(telegram, fileId) {
  ensureTelegramToken();

  const file = await telegram.getFile(fileId);
  if (!file?.file_path) {
    throw new Error('Telegram file path not available');
  }

  return `${TELEGRAM_FILE_BASE}/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
}

export async function extractMediaFromMessage(ctx) {
  const message = ctx.message || {};

  if (Array.isArray(message.photo) && message.photo.length > 0) {
    const bestPhoto = getLargestPhoto(message.photo);
    return {
      kind: 'photo',
      mediaType: 'image/jpeg',
      fileId: bestPhoto.file_id,
      fileUrl: await buildTelegramFileUrl(ctx.telegram, bestPhoto.file_id),
    };
  }

  if (message.voice?.file_id) {
    return {
      kind: 'voice',
      mediaType: message.voice.mime_type || 'audio/ogg',
      fileId: message.voice.file_id,
      fileUrl: await buildTelegramFileUrl(ctx.telegram, message.voice.file_id),
    };
  }

  if (message.audio?.file_id) {
    return {
      kind: 'audio',
      mediaType: message.audio.mime_type || 'audio/mpeg',
      fileId: message.audio.file_id,
      fileUrl: await buildTelegramFileUrl(ctx.telegram, message.audio.file_id),
    };
  }

  return null;
}
