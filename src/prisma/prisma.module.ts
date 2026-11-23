import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaRlsInterceptor } from './prisma-rls.interceptor.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    {
      provide: APP_INTERCEPTOR,
      useClass: PrismaRlsInterceptor,
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}