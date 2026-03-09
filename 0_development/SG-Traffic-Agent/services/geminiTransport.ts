const API_KEYS_FILE = './gemma_code.jsonl';
const XOR_SEED = '20250710';
const ROTATE_EVERY_N = 5;
const RATE_LIMIT_MAX_RETRIES = 5;
const RATE_LIMIT_BASE_DELAY = 1000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let apiKeys: string[] = [];
let currentKeyIndex = 0;
let keyUseCount = 0;
let loadPromise: Promise<string[]> | null = null;

interface GenerateContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GenerateContentRequest {
  model: string;
  parts: GenerateContentPart[];
  generationConfig?: Record<string, unknown>;
  systemInstruction?: string;
  primaryKeys?: string[];
  fallbackKeys?: string[];
}

interface GeminiPart {
  text?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
}

function decryptKey(ciphertext: string, key: string): string {
  let decodedMessage = '';
  for (let i = 0; i < ciphertext.length; i += 3) {
    const encryptedChar = parseInt(ciphertext.slice(i, i + 3), 10);
    const keyChar = key.charCodeAt((i / 3) % key.length);
    decodedMessage += String.fromCharCode(encryptedChar ^ keyChar);
  }
  return decoder.decode(new Uint8Array(encoder.encode(decodedMessage)));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  for (let retry = 0; retry <= RATE_LIMIT_MAX_RETRIES; retry++) {
    const response = await fetch(url, options);

    if (response.status === 429 || response.status === 500) {
      if (retry === RATE_LIMIT_MAX_RETRIES) return response;

      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : RATE_LIMIT_BASE_DELAY * Math.pow(2, retry);

      await sleep(Number.isFinite(delay) ? delay : RATE_LIMIT_BASE_DELAY);
      continue;
    }

    return response;
  }

  throw new Error('Gemini request retry loop exited unexpectedly.');
}

function normalizeKeys(keys: Array<string | undefined | null>): string[] {
  return keys
    .filter((key): key is string => typeof key === 'string')
    .map(key => key.trim())
    .filter(key => key.length > 10 && key !== 'PLACEHOLDER_API_KEY' && key !== 'undefined');
}

function rotateKey(keys: string[]) {
  if (keys.length === 0) return;
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
}

function getCurrentKey(keys: string[]): string {
  if (keys.length === 0) {
    throw new Error('No Gemini API keys available. Add encrypted keys to gemma_code.jsonl or provide a fallback key.');
  }

  if (keyUseCount > 0 && keyUseCount % ROTATE_EVERY_N === 0 && keys.length > 1) {
    rotateKey(keys);
  }

  const key = keys[currentKeyIndex];
  keyUseCount++;
  return key;
}

async function readJsonlKeys(): Promise<string[]> {
  try {
    const response = await fetch(API_KEYS_FILE, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load gemma_code.jsonl: ${response.status}`);
    }

    const text = await response.text();
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        try {
          const encryptedKey = JSON.parse(line).key;
          if (typeof encryptedKey !== 'string' || encryptedKey.length === 0) return null;
          return decryptKey(encryptedKey, XOR_SEED);
        } catch {
          return null;
        }
      })
      .filter((key): key is string => typeof key === 'string' && key.length > 0);
  } catch (error) {
    console.warn('[GeminiTransport] Unable to load gemma_code.jsonl', error);
    return [];
  }
}

export async function loadApiKeys(): Promise<string[]> {
  if (!loadPromise) {
    loadPromise = readJsonlKeys().then(keys => {
      apiKeys = keys;
      currentKeyIndex = 0;
      keyUseCount = 0;
      return apiKeys;
    }).finally(() => {
      loadPromise = null;
    });
  }

  return loadPromise;
}

function getResponseText(result: GeminiResponse): string {
  const parts = result.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map(part => part.text ?? '')
    .join('\n')
    .trim();
}

export async function callGeminiAPI({
  model,
  parts,
  generationConfig,
  systemInstruction,
  primaryKeys = [],
  fallbackKeys = [],
}: GenerateContentRequest): Promise<GeminiResponse> {
  if (apiKeys.length === 0) {
    await loadApiKeys();
  }

  const keys = normalizeKeys([...primaryKeys, ...fallbackKeys, ...apiKeys]);
  const maxAttempts = keys.length || 1;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = getCurrentKey(keys);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    try {
      const response = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig,
          ...(systemInstruction
            ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
            : {}),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(
          `Gemini API error ${response.status} (key #${currentKeyIndex + 1}): ${errorText.slice(0, 200)}`
        );
        rotateKey(keys);
        continue;
      }

      const result = await response.json() as GeminiResponse;
      if (!getResponseText(result)) {
        throw new Error('No response from Gemini API.');
      }
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Gemini API error')) {
        lastError = error;
        continue;
      }

      lastError = error instanceof Error ? error : new Error('Unknown Gemini API error.');
      rotateKey(keys);
    }
  }

  if (apiKeys.length === 0 && fallbackKeys.length === 0) {
    throw new Error('Gemini API keys are unavailable. Add encrypted keys to gemma_code.jsonl.');
  }

  throw lastError ?? new Error('All Gemini API keys failed.');
}

export function extractGeminiText(result: GeminiResponse): string {
  return getResponseText(result);
}
