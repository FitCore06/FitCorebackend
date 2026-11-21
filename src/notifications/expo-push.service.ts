import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

export type ExpoPushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type ExpoPushSendResult = {
  userId: string;
  deviceCount: number;
  tickets: number;
  ok: boolean;
  detail?: string;
};

@Injectable()
export class ExpoPushService {
  private readonly log = new Logger(ExpoPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async sendToUser(
    userId: string,
    message: ExpoPushPayload,
    fetchImpl: typeof fetch = fetch,
  ): Promise<ExpoPushSendResult> {
    const tokens = await this.prisma.pushDeviceToken.findMany({
      where: { userId },
      select: { token: true },
    });

    if (!tokens.length) {
      return {
        userId,
        deviceCount: 0,
        tickets: 0,
        ok: false,
        detail: 'no_device_tokens',
      };
    }

    const body = message.body.length > 240 ? `${message.body.slice(0, 237)}...` : message.body;
    const expoMessages = tokens.map((row) => ({
      to: row.token,
      sound: 'default' as const,
      title: message.title,
      body,
      data: message.data,
    }));

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    };
    const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN')?.trim();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    try {
      const res = await fetchImpl('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(expoMessages),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { status?: string; message?: string }[];
        errors?: { message?: string }[];
      };

      if (!res.ok) {
        const detail = json.errors?.[0]?.message ?? `Expo HTTP ${res.status}`;
        this.log.warn(`Expo push failed user=${userId}: ${detail}`);
        return {
          userId,
          deviceCount: tokens.length,
          tickets: 0,
          ok: false,
          detail,
        };
      }

      const tickets = json.data?.length ?? 0;
      const errorTicket = json.data?.find((t) => t.status === 'error');
      if (errorTicket) {
        this.log.warn(`Expo push ticket error user=${userId}: ${errorTicket.message}`);
        return {
          userId,
          deviceCount: tokens.length,
          tickets,
          ok: false,
          detail: errorTicket.message ?? 'expo_ticket_error',
        };
      }

      this.log.log(`Expo push queued user=${userId} devices=${tokens.length}`);
      return {
        userId,
        deviceCount: tokens.length,
        tickets,
        ok: true,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.log.error(`Expo push request failed user=${userId}: ${detail}`);
      return {
        userId,
        deviceCount: tokens.length,
        tickets: 0,
        ok: false,
        detail,
      };
    }
  }
}