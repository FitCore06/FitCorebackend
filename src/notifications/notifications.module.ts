import { Module } from '@nestjs/common';
import { ExpoPushService } from './expo-push.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, ExpoPushService],
  exports: [NotificationsService, ExpoPushService],
})
export class NotificationsModule {}