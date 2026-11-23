import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    if (process.env.DEV_AUTH_STUB === 'true') {
      return;
    }
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}