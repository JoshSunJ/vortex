export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    quotes: { type: 'array', minItems: 1, maxItems: 5, items: {
      type: 'object', properties: { sourceId: { type: 'string' }, quote: { type: 'string', minLength: 1, maxLength: 600 } },
      required: ['sourceId', 'quote'], additionalProperties: false,
    } },
    nextStep: { type: 'string', minLength: 1, maxLength: 300 },
  },
  required: ['quotes'], additionalProperties: false,
};
const MAX_RESPONSE_BYTES = 128_000;
function failure(code) {
  const messages = {
    VALIDATION_ERROR: 'Gemini configuration or request is invalid.',
    FORBIDDEN: 'Gemini rejected the API credentials or project access.',
    CONTENT_UNAVAILABLE: 'Gemini could not return a complete response. Check free-tier access and quota.',
    PROVIDER_TIMEOUT: 'Gemini did not respond before the request deadline.',
    ABORTED: 'The Gemini request was cancelled.',
  };
  return Object.assign(new Error(messages[code]), { code, retryable: code === 'PROVIDER_TIMEOUT',
    ...(code === 'ABORTED' ? { name: 'AbortError' } : {}) });
}
function assertActive(signal) {
  if (signal?.aborted) throw failure('ABORTED');
}

async function readBody(response, signal) {
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json') ||
      !response.body || Number(response.headers.get('content-length') ?? 0) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw failure('CONTENT_UNAVAILABLE');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      assertActive(signal);
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw failure('CONTENT_UNAVAILABLE');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  assertActive(signal);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw failure('CONTENT_UNAVAILABLE'); }
}

/**
 * Fixed Google Gemini text/JSON transport for the grounded-selection DTO.
 * The default is documented with a free tier, but the adapter cannot inspect
 * Google project billing. Use a verified Free-tier project; paid-enabled projects
 * can incur charges even for this model. No billing setup or paid fallback exists.
 * Use via generateValidatedJson for deadlines, strict parsing, and one retry.
 * Inject fetchImpl only in trusted server code/tests. Never load keys in a renderer.
 */
export function createGeminiModel({ apiKey, modelId = DEFAULT_GEMINI_MODEL, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey || apiKey.length > 256 || /\s/u.test(apiKey) ||
      modelId !== DEFAULT_GEMINI_MODEL || typeof fetchImpl !== 'function') throw failure('VALIDATION_ERROR');
  return Object.freeze({ providerId: 'google-gemini', modelId,
    async complete(request) {
      if (!request || !Array.isArray(request.messages) || request.messages.length < 1 || request.messages.length > 4 ||
          request.messages.some((item) => !item || !['system', 'user', 'assistant'].includes(item.role) ||
            typeof item.content !== 'string' || !item.content.trim()) ||
          request.messages.reduce((size, item) => size + item.content.length, 0) > 280_000 ||
          (request.signal !== undefined && !(request.signal instanceof AbortSignal))) throw failure('VALIDATION_ERROR');
      const { signal } = request;
      assertActive(signal);
      // Forward only supported plain-text fields, never tools, files, or arbitrary URLs.
      const body = { model: modelId, messages: request.messages.map(({ role, content }) => ({ role, content })),
        stream: false, max_tokens: 4096,
        response_format: { type: 'json_schema', json_schema: { name: 'grounded_selection', strict: true, schema: OUTPUT_SCHEMA } } };
      let response;
      try {
        response = await fetchImpl(GEMINI_ENDPOINT, { method: 'POST', redirect: 'error', signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch (caught) {
        assertActive(signal);
        throw failure(caught?.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'CONTENT_UNAVAILABLE');
      }
      assertActive(signal);
      if (!response.ok || response.redirected) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status)) throw failure('FORBIDDEN');
        if ([408, 504].includes(response.status)) throw failure('PROVIDER_TIMEOUT');
        throw failure('CONTENT_UNAVAILABLE');
      }
      let value;
      try { value = await readBody(response, signal); }
      catch (caught) {
        assertActive(signal);
        if (caught?.code === 'ABORTED') throw caught;
        throw failure('CONTENT_UNAVAILABLE');
      }
      const choice = value?.choices?.[0];
      const message = choice?.message;
      if (!Array.isArray(value?.choices) || value.choices.length !== 1 || choice.finish_reason !== 'stop' ||
          typeof message?.content !== 'string' || !message.content.trim() || message.content.length > 20_000 ||
          (message.tool_calls !== undefined && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0)) ||
          (message.refusal !== undefined && message.refusal !== null) || message.function_call !== undefined ||
          (value.model !== undefined && value.model !== modelId)) throw failure('CONTENT_UNAVAILABLE');
      return message.content;
    },
  });
}
