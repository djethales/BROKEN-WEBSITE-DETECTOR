import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queues/queue.module';
import { MailModule } from './mail/mail.module';
import { RulesService } from './rules/rules.service';
import { CollectorService } from './agents/collector/collector.service';
import { BrowserService } from './agents/inspector/browser.service';
import { InspectorService } from './agents/inspector/inspector.service';
import { StateMachineService } from './orchestrator/state-machine.service';
import { HealthController } from './health.controller';

@Module({
  imports: [AppConfigModule, PrismaModule, RedisModule, QueueModule, MailModule],
  controllers: [HealthController],
  providers: [
    RulesService,
    CollectorService,
    BrowserService,
    InspectorService,
    StateMachineService,
  ],
  exports: [
    QueueModule,
    MailModule,
    CollectorService,
    InspectorService,
    RulesService,
    StateMachineService,
  ],
})
export class AppModule {}
