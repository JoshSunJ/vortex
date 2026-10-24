import { createGeminiModel, DEFAULT_GEMINI_MODEL } from './src/gemini.mjs';
import { generateValidatedJson } from './src/model-json.mjs';

const args = new Set(process.argv.slice(2));
if ([...args].some((arg) => !['--live', '--confirm-free-tier'].includes(arg))) {
  console.error('Usage: node gemini-check.mjs [--live --confirm-free-tier]');
  process.exitCode = 1;
} else {
  const modelId = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const keyConfigured = typeof process.env.GEMINI_API_KEY === 'string' && process.env.GEMINI_API_KEY.length > 0;
  console.log(`Provider: google-gemini\nModel: ${modelId === DEFAULT_GEMINI_MODEL ? modelId : 'UNSUPPORTED_MODEL'}`);
  console.log(`API key: ${keyConfigured ? 'configured (value hidden)' : 'missing'}`);
  console.log('No billing changes or paid model fallback are implemented.');
  if (!args.has('--live')) {
    console.log('Readiness check only. No network request was made.');
    console.log('Before a live check, verify that this key belongs to a Google AI Studio Free-tier project.');
  } else if (!args.has('--confirm-free-tier')) {
    console.error('Live check skipped. Verify the project Free tier, then add --confirm-free-tier.');
    process.exitCode = 1;
  } else if (!keyConfigured) {
    console.error('Live check skipped. Set GEMINI_API_KEY locally; never paste it in chat or commit it.');
    process.exitCode = 1;
  } else {
    try {
      const model = createGeminiModel({ apiKey: process.env.GEMINI_API_KEY, modelId });
      const sourceId = '11111111-1111-4111-8111-111111111111';
      const quote = 'This is synthetic public demo text.';
      const result = await generateValidatedJson({ complete: (request) => model.complete(request),
        system: 'Return JSON only with quotes: an array containing exactly one object with sourceId and quote copied verbatim from the user payload. No other fields.',
        payload: { sourceId, quote },
        validate: (value) => {
          if (!value || Object.keys(value).length !== 1 || !Array.isArray(value.quotes) || value.quotes.length !== 1 ||
              Object.keys(value.quotes[0]).length !== 2 || value.quotes[0].sourceId !== sourceId || value.quotes[0].quote !== quote) {
            throw Error('invalid response');
          }
          return value;
        },
      });
      console.log(`LIVE check passed: ${model.providerId} / ${model.modelId}.`);
      console.log(`Validated synthetic quote count: ${result.quotes.length}. No browsing content was sent.`);
    } catch (caught) {
      const code = ['VALIDATION_ERROR', 'CONTENT_UNAVAILABLE', 'PROVIDER_TIMEOUT', 'FORBIDDEN', 'ABORTED'].includes(caught?.code)
        ? caught.code : 'INTERNAL_ERROR';
      console.error(`LIVE check failed: ${code}. No paid fallback was attempted.`);
      process.exitCode = 1;
    }
  }
}
