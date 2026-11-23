export interface DueSite {
  id: string;
}

interface ExistingInspectionJob {
  getState(): Promise<string>;
  remove(): Promise<unknown>;
}

interface InspectionQueueAdapter {
  getJob(jobId: string): Promise<ExistingInspectionJob | undefined>;
  add(jobId: string, siteId: string): Promise<unknown>;
}

export async function dispatchDueSites(
  sites: DueSite[],
  queue: InspectionQueueAdapter,
): Promise<{ queued: number; skipped: number }> {
  let queued = 0;
  let skipped = 0;
  for (const site of sites) {
    const jobId = `inspect-${site.id}`;
    const existing = await queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state !== 'completed' && state !== 'failed') {
        skipped += 1;
        continue;
      }
      await existing.remove();
    }

    await queue.add(jobId, site.id);
    queued += 1;
  }
  return { queued, skipped };
}
