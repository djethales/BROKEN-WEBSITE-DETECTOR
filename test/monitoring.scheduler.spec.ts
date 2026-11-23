import { dispatchDueSites } from '../src/workers/dispatch-due-sites';

describe('dispatchDueSites', () => {
  it('replaces failed jobs and skips active jobs', async () => {
    const dueSites = [{ id: 'active-site' }, { id: 'failed-site' }, { id: 'new-site' }];
    const jobs: Record<string, { getState: () => Promise<string>; remove: jest.Mock }> = {
      'inspect-active-site': {
        getState: jest.fn().mockResolvedValue('waiting'),
        remove: jest.fn(),
      },
      'inspect-failed-site': {
        getState: jest.fn().mockResolvedValue('failed'),
        remove: jest.fn().mockResolvedValue(undefined),
      },
    };
    const queue = {
      getJob: jest.fn(async (jobId: string) => jobs[jobId]),
      add: jest.fn().mockResolvedValue(undefined),
    };
    await expect(
      dispatchDueSites(dueSites, {
        getJob: queue.getJob,
        add: (jobId, siteId) => queue.add(jobId, siteId),
      }),
    ).resolves.toEqual({ queued: 2, skipped: 1 });
    expect(jobs['inspect-failed-site']?.remove).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      'inspect-failed-site',
      'failed-site',
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      'inspect-new-site',
      'new-site',
    );
  });
});
