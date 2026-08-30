import {
    Injectable,
    Logger,
    OnModuleDestroy,
} from '@nestjs/common';
import {
    Cron,
} from '@nestjs/schedule';

import {
    NotificationEngineService,
} from './notification-engine.service';

@Injectable()
export class NotificationSchedulerService implements OnModuleDestroy {
    private readonly logger =
        new Logger(
            NotificationSchedulerService
                .name,
        );
    private readonly disabledForP09 =
        process.env.NODE_ENV === 'test' &&
        process.env.P09_DISABLE_NOTIFICATION_SCHEDULER === '1';
    private readonly inFlight =
        new Set<Promise<void>>();
    private shuttingDown = false;
    private lastSuccessfulRunAt: Date | null = null;
    private lastFailedRunAt: Date | null = null;
    private lastFailureLabel: string | null = null;

    constructor(
        private readonly engine:
            NotificationEngineService,
    ) { }

    private runOwned(
        label: string,
        operation: () => Promise<unknown>,
    ): Promise<void> {
        if (
            this.disabledForP09 ||
            this.shuttingDown
        ) {
            return Promise.resolve();
        }

        const work = (async () => {
            try {
                await operation();
                this.lastSuccessfulRunAt = new Date();
            } catch (error) {
                this.lastFailedRunAt = new Date();
                this.lastFailureLabel = label;
                this.logger.error(
                    label,
                    error instanceof Error
                        ? error.stack
                        : String(error),
                );
            }
        })();
        this.inFlight.add(work);
        void work.finally(() => {
            this.inFlight.delete(work);
        });
        return work;
    }

    getStatus() {
        return {
            enabled: !this.disabledForP09,
            environment_disabled: this.disabledForP09,
            shutting_down: this.shuttingDown,
            in_flight: this.inFlight.size,
            last_success_at: this.lastSuccessfulRunAt,
            last_failure_at: this.lastFailedRunAt,
            last_failure_category: this.lastFailureLabel,
        };
    }

    async onModuleDestroy(): Promise<void> {
        this.shuttingDown = true;
        await Promise.all(Array.from(this.inFlight));
    }

    @Cron(
        '0 * * * * *',
        {
            timeZone:
                'Asia/Ho_Chi_Minh',
        },
    )
    evaluateAssignmentsEveryMinute() {
        return this.runOwned(
            'Work assignment notification evaluation failed',
            () => this.engine.evaluateAssignments(new Date()),
        );
    }

    @Cron(
        '0 0 * * * *',
        {
            timeZone:
                'Asia/Ho_Chi_Minh',
        },
    )
    evaluateHourly() {
        return this.runOwned(
            'Notification/SLA evaluation failed',
            async () => {
                const result = await this.engine.evaluateNotifications(new Date());
                this.logger.log(
                    `Notification/SLA evaluation completed: ${JSON.stringify(result)}`,
                );
            },
        );
    }
}
