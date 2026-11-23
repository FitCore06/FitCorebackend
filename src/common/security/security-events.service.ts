import { Injectable } from '@nestjs/common';

export type SecurityEventKind =
  | 'waf_block'
  | 'rate_limit'
  | 'auth_failure'
  | 'auth_success';

export type SecurityEvent = {
  at: string;
  kind: SecurityEventKind;
  ip?: string;
  path?: string;
  requestId?: string;
  detail?: string;
};

const MAX_EVENTS = 500;

@Injectable()
export class SecurityEventsService {
  private readonly events: SecurityEvent[] = [];
  readonly counters = {
    wafBlock: 0,
    rateLimit: 0,
    authFailure: 0,
    authSuccess: 0,
  };

  record(kind: SecurityEventKind, partial: Omit<SecurityEvent, 'at' | 'kind'>) {
    if (kind === 'waf_block') this.counters.wafBlock++;
    if (kind === 'rate_limit') this.counters.rateLimit++;
    if (kind === 'auth_failure') this.counters.authFailure++;
    if (kind === 'auth_success') this.counters.authSuccess++;

    this.events.push({
      at: new Date().toISOString(),
      kind,
      ...partial,
    });
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
  }

  snapshot(limit = 50) {
    return {
      counters: { ...this.counters },
      recent: this.events.slice(-limit).reverse(),
    };
  }
}