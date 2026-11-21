import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { resolveMembershipExpiryRunParams } from './automation-run-params.js';
import { AutomationService } from './automation.service.js';

/** 03:30 UTC = 09:00 Asia/Kolkata */
const DAILY_9AM_IST_CRON = '30 3 * * *';

@Injectable()
export class MembershipExpiryScheduler {
  private readonly logger = new Logger(MembershipExpiryScheduler.name);

  constructor(
    private readonly automation: AutomationService,
    private readonly config: ConfigService,
  ) {}

  @Cron(DAILY_9AM_IST_CRON, { timeZone: 'UTC' })
  async runScheduledMembershipExpiryReminders(): Promise<void> {
    const enabled = this.config.get<string>('FITCORE_MEMBERSHIP_EXPIRY_CRON_ENABLED')?.trim();
    if (enabled !== 'true') {
      return;
    }
    const { slug, daysBefore } = resolveMembershipExpiryRunParams(this.config);
    const result = await this.automation.runMembershipExpiryReminders(slug, daysBefore);
    this.logger.log(
      `membership expiry gym=${result.gymSlug} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`,
    );
  }
}