import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller.js';

@Module({
  controllers: [MonitoringController],
})
export class MonitoringModule {}