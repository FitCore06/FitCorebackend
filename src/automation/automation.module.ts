import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AutomationController } from './automation.controller.js';
import { AutomationSecretGuard } from './automation-secret.guard.js';
import { AutomationService } from './automation.service.js';
import { MembershipExpiryScheduler } from './membership-expiry.scheduler.js';

@Module({
  imports: [NotificationsModule],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationSecretGuard, MembershipExpiryScheduler],
})
export class AutomationModule {}