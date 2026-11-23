export const QUEUE_SYNC = 'sync-sites';
export const QUEUE_BATCH = 'schedule-checks';
export const QUEUE_INSPECT = 'inspect';
export const QUEUE_ANALYZE = 'analyze';
export const QUEUE_JUDGE = 'judge';
export const QUEUE_CALIBRATE = 'calibrate';
export const QUEUE_NOTIFY = 'notify';

export const QUEUE_NAMES = [
  QUEUE_SYNC,
  QUEUE_BATCH,
  QUEUE_INSPECT,
  QUEUE_ANALYZE,
  QUEUE_JUDGE,
  QUEUE_CALIBRATE,
  QUEUE_NOTIFY,
] as const;

export const EVENTS_CHANNEL = 'monitor:events';
export const WORKER_HEARTBEAT_KEY = 'monitor:worker:heartbeat';

export const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: true,
  removeOnFail: { count: 100 },
};
