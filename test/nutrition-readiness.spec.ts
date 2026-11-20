import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { OllamaVisionService } from '../src/nutrition/ollama-vision.service.js';

function configStub(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    NUTRITION_VISION_MODE: 'local',
    OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
    OLLAMA_VISION_MODEL: 'qwen2.5vl:3b',
    OLLAMA_READINESS_TIMEOUT_MS: '3000',
    OLLAMA_READINESS_TTL_MS: '60000',
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
  } as ConfigService;
}

describe('Ollama vision readiness', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('reports ready when tags include configured model', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: 'qwen2.5vl:3b' }],
      }),
    }) as typeof fetch;

    const svc = new OllamaVisionService(configStub());
    const state = await svc.checkReadiness();
    expect(state).toEqual({ ready: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('reports model_missing when vision model absent', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'llama3.2:latest' }] }),
    }) as typeof fetch;

    const svc = new OllamaVisionService(configStub());
    const state = await svc.checkReadiness();
    expect(state).toEqual({ ready: false, reason: 'model_missing' });
  });

  it('reports unreachable on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const svc = new OllamaVisionService(configStub());
    const state = await svc.checkReadiness();
    expect(state).toEqual({ ready: false, reason: 'unreachable' });
  });

  it('caches readiness within TTL', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: 'qwen2.5vl:3b' }] }),
    }) as typeof fetch;

    const svc = new OllamaVisionService(configStub());
    await svc.checkReadiness();
    await svc.checkReadiness();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('reports disabled when vision mode is off', async () => {
    global.fetch = vi.fn();
    const svc = new OllamaVisionService(
      configStub({ NUTRITION_VISION_MODE: 'off' }),
    );
    const state = await svc.checkReadiness();
    expect(state).toEqual({ ready: false, reason: 'disabled' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});