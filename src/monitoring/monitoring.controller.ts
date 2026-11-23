import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AutomationSecretGuard } from '../automation/automation-secret.guard.js';
import { SecurityEventsService } from '../common/security/security-events.service.js';

@ApiTags('monitoring')
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly securityEvents: SecurityEventsService) {}

  @Get('security')
  @SkipThrottle()
  @UseGuards(AutomationSecretGuard)
  @ApiOperation({
    summary: 'Security counters and recent events (automation secret required)',
  })
  securityDashboard() {
    return {
      service: 'athra-api',
      ...this.securityEvents.snapshot(100),
    };
  }
}