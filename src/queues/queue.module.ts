import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { QUEUE_NAMES } from './queues';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => {
        const url = new URL(env.REDIS_URL);
        const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            username: url.username || undefined,
            password: url.password || undefined,
            db: Number.isInteger(database) ? database : 0,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    BullModule.registerQueue(...QUEUE_NAMES.map((name) => ({ name }))),
  ],
  exports: [BullModule],
})
export class QueueModule {}
