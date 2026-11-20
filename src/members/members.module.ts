import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MembersController],
  providers: [MembersService, RolesGuard],
  exports: [MembersService],
})
export class MembersModule {}