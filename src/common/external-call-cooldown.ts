type GateState = { consecutiveFailures: number; openUntilMs: number };

const gates = new Map<string, GateState>();

const failThreshold = Math.max(
  1,
  Number(process.env.EXTERNAL_CALL_FAIL_THRESHOLD ?? 3),
);
const cooldownMs = Math.max(
  1_000,
  Number(process.env.EXTERNAL_CALL_COOLDOWN_MS ?? 60_000),
);

export function externalCallBlocked(service: string): boolean {
  const gate = gates.get(service);
  if (!gate) return false;
  if (Date.now() >= gate.openUntilMs) {
    gates.delete(service);
    return false;
  }
  return true;
}

export function recordExternalCallSuccess(service: string): void {
  gates.delete(service);
}

export function recordExternalCallFailure(service: string): void {
  const gate = gates.get(service) ?? { consecutiveFailures: 0, openUntilMs: 0 };
  gate.consecutiveFailures += 1;
  if (gate.consecutiveFailures >= failThreshold) {
    gate.openUntilMs = Date.now() + cooldownMs;
    gate.consecutiveFailures = 0;
  }
  gates.set(service, gate);
}