import fetch from 'node-fetch';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_IMAGE_MODEL = process.env.OPENAI_MODEL_IMAGE || 'gpt-4.1-mini';
const OPENAI_AUDIO_MODEL = process.env.OPENAI_MODEL_AUDIO || 'gpt-4o-mini-transcribe';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

function ensureOpenAIConfig() {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }
}

async function fetchAsBase64(fileUrl) {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Could not download media: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  return {
    base64,
    contentType,
    buffer: Buffer.from(arrayBuffer),
  };
}

async function openAIJsonRequest(endpoint, body) {
  ensureOpenAIConfig();

  const response = await fetch(`${OPENAI_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

function extractTextFromResponse(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (Array.isArray(data.output)) {
    const parts = [];
    for (const item of data.output) {
      if (!Array.isArray(item.content)) continue;
      for (const content of item.content) {
        if (typeof content.text === 'string') {
          parts.push(content.text);
        }
      }
    }

    return parts.join('\n').trim();
  }

  return '';
}

function parseJsonObject(text) {
  if (!text) {
    throw new Error('Empty model response');
  }

  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const candidate = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;

  return JSON.parse(candidate);
}

export function normalizeCandidateTitle(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let normalized = text.trim();

  normalized = normalized
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(titulo|título|title)\s*[:\-]\s*/i, '')
    .replace(/^(filme|série|serie)\s*[:\-]\s*/i, '')
    .replace(/^(o nome (do filme|da série|da serie)?\s*(é|eh)|é|eh|acho que é|acho que eh|quero registrar|eu assisti)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  normalized = normalized
    .replace(/[.?!,;:]+$/g, '')
    .trim();

  if (normalized.length > 120) {
    normalized = normalized.slice(0, 120).trim();
  }

  return normalized;
}

export async function identifyTitleFromImage({ fileUrl, mediaType = 'image/jpeg', tipo }) {
  const { base64, contentType } = await fetchAsBase64(fileUrl);
  const instruction = [
    `Identifique o nome de um ${tipo === 'Série' ? 'serie' : 'filme'} a partir de uma capa ou poster.`,
    'Responda somente com JSON válido no formato {"title":"...","confidence":0.0}.',
    'Se não conseguir identificar com boa confiança, use {"title":"","confidence":0}.',
    'Não inclua explicações adicionais.',
  ].join(' ');

  const data = await openAIJsonRequest('/responses', {
    model: OPENAI_IMAGE_MODEL,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: instruction },
          {
            type: 'input_image',
            image_url: `data:${mediaType || contentType};base64,${base64}`,
          },
        ],
      },
    ],
  });

  const rawText = extractTextFromResponse(data);
  const parsed = parseJsonObject(rawText);
  const title = normalizeCandidateTitle(parsed.title);
  const confidence = Number(parsed.confidence) || 0;

  return {
    title,
    confidence,
    source: 'image',
  };
}

export async function transcribeTitleFromAudio({ fileUrl, mediaType = 'audio/ogg', tipo }) {
  ensureOpenAIConfig();

  const { buffer } = await fetchAsBase64(fileUrl);
  const formData = new FormData();
  formData.append('model', OPENAI_AUDIO_MODEL);
  formData.append(
    'file',
    new Blob([buffer], { type: mediaType }),
    mediaType.includes('mpeg') ? 'title.mp3' : 'title.ogg'
  );
  formData.append(
    'prompt',
    `Transcreva somente o nome de um ${tipo === 'Série' ? 'serie' : 'filme'} dito em portugues.`
  );
  formData.append('response_format', 'json');

  const response = await fetch(`${OPENAI_BASE_URL}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI audio API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const title = normalizeCandidateTitle(data.text);

  return {
    title,
    confidence: title ? 0.9 : 0,
    source: 'audio',
  };
}
