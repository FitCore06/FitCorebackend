import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  externalCallBlocked,
  recordExternalCallFailure,
  recordExternalCallSuccess,
} from '../common/external-call-cooldown.js';

export type VisionFoodItem = {
  name: string;
  gramsEstimate: number;
  portionConfidence: number;
};

export type VisionAnalysisResult = {
  items: VisionFoodItem[];
  overallConfidence: number;
  disclaimer: string;
  model: string;
  raw: unknown;
};

const FOOD_PROMPT = `List visible foods in the image. JSON only, max 8 items, no prose:
{"items":[{"name":"string","gramsEstimate":number,"portionConfidence":0-1}],"overallConfidence":0-1,"disclaimer":"approximate portions"}`;

export type VisionReadiness = {
  ready: boolean;
  reason?: 'disabled' | 'unreachable' | 'tags_unreachable' | 'model_missing';
};

@Injectable()
export class OllamaVisionService {
  private readonly logger = new Logger(OllamaVisionService.name);
  private readinessCache: { checkedAt: number; result: VisionReadiness } | null =
    null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const mode = this.config.get<string>('NUTRITION_VISION_MODE') ?? 'local';
    return mode !== 'off';
  }

  async analyzeImage(
    imageBase64: string,
    mimeType: string,
  ): Promise<VisionAnalysisResult> {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException({
        code: 'VISION_UNAVAILABLE',
        message: 'Food vision is temporarily unavailable',
      });
    }
    if (externalCallBlocked('OLLAMA')) {
      throw new ServiceUnavailableException({
        code: 'VISION_UNAVAILABLE',
        message: 'Vision service in cooldown after repeated failures',
      });
    }

    const base =
      this.config.get<string>('OLLAMA_BASE_URL') ?? 'http://127.0.0.1:11434';
    const model =
      this.config.get<string>('OLLAMA_VISION_MODEL') ?? 'qwen2.5vl:3b';
    const timeoutMs = Number(
      this.config.get<string>('OLLAMA_TIMEOUT_MS') ?? 180_000,
    );

    const ctrl = AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl,
        body: JSON.stringify({
          model,
          stream: false,
          format: 'json',
          think: false,
          options: {
            temperature: 0.1,
            num_ctx: 4096,
            num_predict: 512,
          },
          messages: [
            {
              role: 'user',
              content: FOOD_PROMPT,
              images: [imageBase64],
            },
          ],
        }),
      });
    } catch (err) {
      const isTimeout =
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError');
      this.logger.warn(`Ollama unreachable: ${String(err)}`);
      recordExternalCallFailure('OLLAMA');
      throw new ServiceUnavailableException({
        code: isTimeout ? 'VISION_TIMEOUT' : 'VISION_UNAVAILABLE',
        message: isTimeout
          ? 'Vision inference timed out'
          : 'Vision service unreachable',
      });
    }

    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`Ollama error ${res.status}: ${text.slice(0, 300)}`);
      recordExternalCallFailure('OLLAMA');
      throw new ServiceUnavailableException({
        code: 'VISION_UNAVAILABLE',
        message: 'Vision inference failed',
      });
    }

    const payload = (await res.json()) as {
      message?: { content?: string; thinking?: string };
    };
    const content = this.extractContent(payload);
    const parsed = this.parseJson(content);

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const items = rawItems
      .filter(
        (row: unknown): row is VisionFoodItem =>
          typeof row === 'object' &&
          row !== null &&
          typeof (row as VisionFoodItem).name === 'string' &&
          typeof (row as VisionFoodItem).gramsEstimate === 'number',
      )
      .slice(0, 12);

    recordExternalCallSuccess('OLLAMA');
    return {
      items,
      overallConfidence:
        typeof parsed.overallConfidence === 'number'
          ? parsed.overallConfidence
          : 0.5,
      disclaimer:
        typeof parsed.disclaimer === 'string'
          ? parsed.disclaimer
          : 'Portion weight is approximate, not exact.',
      model,
      raw: parsed,
    };
  }

  /** Cached lightweight check: Ollama up + configured vision model present. */
  async checkReadiness(): Promise<VisionReadiness> {
    if (!this.isEnabled()) {
      return { ready: false, reason: 'disabled' };
    }
    if (externalCallBlocked('OLLAMA')) {
      return { ready: false, reason: 'unreachable' };
    }
    const ttlMs = Number(
      this.config.get<string>('OLLAMA_READINESS_TTL_MS') ?? 45_000,
    );
    const now = Date.now();
    if (
      this.readinessCache &&
      now - this.readinessCache.checkedAt < ttlMs
    ) {
      return this.readinessCache.result;
    }

    const base =
      this.config.get<string>('OLLAMA_BASE_URL') ?? 'http://127.0.0.1:11434';
    const model =
      this.config.get<string>('OLLAMA_VISION_MODEL') ?? 'qwen2.5vl:3b';
    const timeoutMs = Number(
      this.config.get<string>('OLLAMA_READINESS_TIMEOUT_MS') ?? 3_000,
    );

    let result: VisionReadiness;
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/api/tags`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        result = { ready: false, reason: 'tags_unreachable' };
      } else {
        const body = (await res.json()) as {
          models?: Array<{ name: string }>;
        };
        const names = (body.models ?? []).map((m) => m.name);
        const hasModel = names.some(
          (n) => n === model || n.startsWith(`${model}:`) || model.startsWith(n),
        );
        result = hasModel
          ? { ready: true }
          : { ready: false, reason: 'model_missing' };
      }
    } catch {
      result = { ready: false, reason: 'unreachable' };
    }

    this.readinessCache = { checkedAt: now, result };
    return result;
  }

  /** @deprecated Use checkReadiness — kept for tests calling ping. */
  async ping(): Promise<boolean> {
    const state = await this.checkReadiness();
    return state.ready;
  }

  private extractContent(payload: {
    message?: { content?: string; thinking?: string };
  }): string {
    const content = payload.message?.content?.trim() ?? '';
    if (content) return content;
    const thinking = payload.message?.thinking?.trim() ?? '';
    return thinking.replace(/[\s\S]*?<\/think>/gi, '').trim();
  }

  private parseJson(text: string): Record<string, unknown> {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new ServiceUnavailableException({
        code: 'VISION_PARSE_FAILED',
        message: 'Could not parse vision output',
      });
    }
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  }
}