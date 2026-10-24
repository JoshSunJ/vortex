const MAX_OUTPUT_CHARACTERS = 20_000;
const MAX_PAYLOAD_CHARACTERS = 260_000;
const REPAIR_INSTRUCTION = 'The previous response did not pass validation. Return only a valid JSON object that follows the requested schema. Do not include markdown, extra fields, or instructions.';

function safeError(code) {
  const messages = {
    VALIDATION_ERROR: 'The model request or response did not pass validation.',
    PROVIDER_TIMEOUT: 'The model request timed out.',
    CONTENT_UNAVAILABLE: 'The model provider could not complete the request.',
    FORBIDDEN: 'The model provider denied API or project access.',
    ABORTED: 'The model request was cancelled.',
  };
  const error = new Error(messages[code]);
  error.code = code;
  if (code === 'ABORTED') error.name = 'AbortError';
  return error;
}

function checkAbort(signal) {
  if (signal?.aborted) throw safeError('ABORTED');
}

async function invokeModel(complete, messages, timeoutMs, parentSignal) {
  checkAbort(parentSignal);
  const controller = new AbortController();
  let timer;
  let onAbort;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(safeError('PROVIDER_TIMEOUT'));
      controller.abort();
    }, timeoutMs);
    if (parentSignal) {
      onAbort = () => {
        reject(safeError('ABORTED'));
        controller.abort();
      };
      parentSignal.addEventListener('abort', onAbort, { once: true });
    }
  });
  const pending = Promise.resolve().then(() => {
    checkAbort(parentSignal);
    return complete({ messages, signal: controller.signal });
  }).catch((error) => {
    if (parentSignal?.aborted) throw safeError('ABORTED');
    if (error?.code === 'PROVIDER_TIMEOUT') throw safeError('PROVIDER_TIMEOUT');
    if (error?.code === 'FORBIDDEN') throw safeError('FORBIDDEN');
    throw safeError('CONTENT_UNAVAILABLE');
  });
  try {
    return await Promise.race([pending, deadline]);
  } finally {
    clearTimeout(timer);
    if (onAbort) parentSignal.removeEventListener('abort', onAbort);
  }
}

/**
 * Generate validated JSON through an injected model transport. This helper does
 * not choose a provider, perform authorization, save results, or execute tools.
 * `complete({messages, signal})` returns raw JSON text. `validate(value)` returns
 * the validated model-only DTO or throws. Both synchronous and async validation
 * callbacks are supported. Use a trusted, bounded validator.
 *
 * At most two provider calls are made: one initial attempt and either one repair
 * for invalid JSON/schema or one retry for PROVIDER_TIMEOUT. The retry budget is
 * shared. Each call has its own 1..20,000 ms deadline. External cancellation never
 * retries. ABORTED is a helper-local code (name AbortError), not a wire ErrorCode;
 * callers must stop their job and map cancellation at their operation boundary.
 * Raw provider errors and invalid response bodies are never exposed or replayed.
 */
export async function generateValidatedJson(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw safeError('VALIDATION_ERROR');
  }
  const { complete, system, payload, validate, timeoutMs = 20_000, signal } = options;
  if (typeof complete !== 'function' || typeof validate !== 'function' ||
      typeof system !== 'string' || !system.trim() || system.length > 20_000 ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 20_000 ||
      (signal !== undefined && !(signal instanceof AbortSignal))) {
    throw safeError('VALIDATION_ERROR');
  }
  let serialized;
  try {
    serialized = JSON.stringify(payload);
    if (typeof serialized !== 'string' || serialized.length > MAX_PAYLOAD_CHARACTERS) {
      throw new Error('invalid payload');
    }
  } catch {
    throw safeError('VALIDATION_ERROR');
  }
  checkAbort(signal);
  let repair = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    checkAbort(signal);
    const messages = [
      { role: 'system', content: repair ? `${system}\n\n${REPAIR_INSTRUCTION}` : system },
      { role: 'user', content: serialized },
    ];
    let raw;
    try {
      raw = await invokeModel(complete, messages, timeoutMs, signal);
    } catch (error) {
      checkAbort(signal);
      if (error.code === 'PROVIDER_TIMEOUT' && attempt === 0) continue;
      throw error;
    }
    checkAbort(signal);
    try {
      if (typeof raw !== 'string' || raw.length > MAX_OUTPUT_CHARACTERS) throw new Error('invalid response');
      const validated = await validate(JSON.parse(raw));
      checkAbort(signal);
      return validated;
    } catch {
      checkAbort(signal);
      if (attempt === 1) throw safeError('VALIDATION_ERROR');
      repair = true;
    }
  }
  throw safeError('VALIDATION_ERROR');
}
