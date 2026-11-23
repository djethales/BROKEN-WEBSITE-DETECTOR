import { Module } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  DueSitesProcessor,
  InspectionProcessor,
  NotificationProcessor,
  SyncSitesProcessor,
} from './workers/processors';
import { MonitoringScheduler } from './workers/monitoring.scheduler';

@Module({
  imports: [AppModule],
  providers: [
    MonitoringScheduler,
    SyncSitesProcessor,
    DueSitesProcessor,
    InspectionProcessor,
    NotificationProcessor,
  ],
})
export class WorkerModule {}
