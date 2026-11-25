import { Module } from '@nestjs/common';
import { SupportPublicController } from './support-public.controller.js';
import { SupportService } from './support.service.js';

@Module({
  controllers: [SupportPublicController],
  providers: [SupportService],
})
export class SupportModule {}