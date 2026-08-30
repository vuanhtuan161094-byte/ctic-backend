import {
    NotificationSchedulerService,
} from './notification-scheduler.service';

describe('NotificationSchedulerService', () => {
    it('evaluates assignment delivery without waiting for wall-clock time', async () => {
        const engine = {
            evaluateAssignments:
                jest.fn()
                    .mockResolvedValue({}),
            evaluateNotifications:
                jest.fn(),
        };
        const scheduler =
            new NotificationSchedulerService(
                engine as never,
            );

        await scheduler
            .evaluateAssignmentsEveryMinute();

        expect(engine.evaluateAssignments)
            .toHaveBeenCalledWith(
                expect.any(Date),
            );
    });

    it('evaluates the complete SLA/expiry cycle independently', async () => {
        const engine = {
            evaluateAssignments:
                jest.fn(),
            evaluateNotifications:
                jest.fn()
                    .mockResolvedValue({}),
        };
        const scheduler =
            new NotificationSchedulerService(
                engine as never,
            );

        await scheduler.evaluateHourly();

        expect(engine.evaluateNotifications)
            .toHaveBeenCalledWith(
                expect.any(Date),
            );
    });

    it('awaits owned work during shutdown and starts no new database callback', async () => {
        let release!: () => void;
        const pending = new Promise<void>((resolve) => {
            release = resolve;
        });
        const engine = {
            evaluateAssignments: jest.fn().mockReturnValue(pending),
            evaluateNotifications: jest.fn().mockResolvedValue({}),
        };
        const scheduler = new NotificationSchedulerService(engine as never);

        const running = scheduler.evaluateAssignmentsEveryMinute();
        await Promise.resolve();
        let shutdownFinished = false;
        const shutdown = scheduler.onModuleDestroy().then(() => {
            shutdownFinished = true;
        });
        await Promise.resolve();

        expect(shutdownFinished).toBe(false);
        await scheduler.evaluateHourly();
        expect(engine.evaluateNotifications).not.toHaveBeenCalled();

        release();
        await Promise.all([running, shutdown]);
        expect(shutdownFinished).toBe(true);
    });

    it('explicitly disables only the P09 cron callbacks while engine APIs remain callable elsewhere', async () => {
        const previousNodeEnv = process.env.NODE_ENV;
        const previousDisable = process.env.P09_DISABLE_NOTIFICATION_SCHEDULER;
        process.env.NODE_ENV = 'test';
        process.env.P09_DISABLE_NOTIFICATION_SCHEDULER = '1';
        try {
            const engine = {
                evaluateAssignments: jest.fn().mockResolvedValue({}),
                evaluateNotifications: jest.fn().mockResolvedValue({}),
            };
            const scheduler = new NotificationSchedulerService(engine as never);

            await scheduler.evaluateAssignmentsEveryMinute();
            await scheduler.evaluateHourly();

            expect(engine.evaluateAssignments).not.toHaveBeenCalled();
            expect(engine.evaluateNotifications).not.toHaveBeenCalled();
        } finally {
            if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = previousNodeEnv;
            if (previousDisable === undefined) delete process.env.P09_DISABLE_NOTIFICATION_SCHEDULER;
            else process.env.P09_DISABLE_NOTIFICATION_SCHEDULER = previousDisable;
        }
    });
});
