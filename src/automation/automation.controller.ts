import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseExpiryNotifyDays } from './automation-days.js';
import { resolveMembershipExpiryRunParams } from './automation-run-params.js';
import { AutomationSecretGuard } from './automation-secret.guard.js';
import { AutomationService } from './automation.service.js';

@ApiTags('automation')
@Controller('automation')
@UseGuards(AutomationSecretGuard)
@ApiHeader({
  name: 'X-Athra-Automation-Secret',
  description: 'Shared secret (ATHRA_AUTOMATION_SECRET or legacy FITCORE_AUTOMATION_SECRET)',
  required: true,
})
export class AutomationController {
  constructor(
    private readonly automation: AutomationService,
    private readonly config: ConfigService,
  ) {}

  @Get('membership-expiry')
  @ApiOperation({
    summary: 'Members whose membership ends in N days — reminder preview',
  })
  membershipExpiry(
    @Query('gymSlug') gymSlug: string,
    @Query('days') days?: string,
  ) {
    const daysBefore = parseExpiryNotifyDays(
      days?.trim() || this.config.get<string>('FITCORE_EXPIRY_NOTIFY_DAYS')?.trim() || '7,3,1,0',
    );
    return this.automation.listMembershipExpiryCandidates(gymSlug, daysBefore);
  }

  @Post('membership-expiry/run')
  @ApiOperation({
    summary: 'Send membership expiry reminders (in-app + Expo push — cron entrypoint)',
  })
  runMembershipExpiry(
    @Query('gymSlug') gymSlug?: string,
    @Query('days') days?: string,
  ) {
    const { slug, daysBefore } = resolveMembershipExpiryRunParams(this.config, gymSlug, days);
    return this.automation.runMembershipExpiryReminders(slug, daysBefore);
  }

  @Post('membership-expiry/ack')
  @ApiOperation({ summary: 'Record expiry reminders (idempotent dedupe)' })
  ackMembershipExpiry(
    @Query('gymSlug') gymSlug: string,
    @Body() body: { dedupeKeys?: string[] },
  ) {
    return this.automation.ackMembershipExpiryReminders(gymSlug, body.dedupeKeys ?? []);
  }
}