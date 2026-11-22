import { Module } from '@nestjs/common';
import { GymDirectoryAdminController } from './gym-directory-admin.controller.js';
import { GymDirectoryPublicController } from './gym-directory-public.controller.js';
import { GymDirectoryService } from './gym-directory.service.js';

@Module({
  controllers: [GymDirectoryPublicController, GymDirectoryAdminController],
  providers: [GymDirectoryService],
})
export class GymDirectoryModule {}