import {
    Injectable,
} from '@nestjs/common';

interface RateLimitEntry {
    count: number;
    resetAt: number;
    touchedAt: number;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
    resetAt: number;
}

@Injectable()
export class SecurityRateLimitService {
    private readonly entries =
        new Map<
            string,
            RateLimitEntry
        >();

    private pruneExpired(
        now: number,
    ) {
        for (const [
            key,
            entry,
        ] of this.entries) {
            if (
                entry.resetAt <=
                now
            ) {
                this.entries.delete(
                    key,
                );
            }
        }
    }

    private enforceCapacity(
        maxEntries: number,
        now: number,
    ) {
        if (
            this.entries.size <
            maxEntries
        ) {
            return;
        }

        this.pruneExpired(now);

        if (
            this.entries.size <
            maxEntries
        ) {
            return;
        }

        // Bảo vệ bộ nhớ trước request tạo vô hạn key. Xóa các bucket ít được
        // chạm nhất; không ảnh hưởng request đang xử lý vì Map chỉ dùng trong
        // một Node process.
        const oldest =
            Array.from(
                this.entries.entries(),
            )
                .sort(
                    (left, right) =>
                        left[1].touchedAt -
                        right[1].touchedAt,
                )
                .slice(
                    0,
                    Math.max(
                        1,
                        Math.ceil(
                            maxEntries *
                            0.05,
                        ),
                    ),
                );

        for (const [key] of oldest) {
            this.entries.delete(key);
        }
    }

    consume(
        key: string,
        maxRequests: number,
        windowMs: number,
        maxEntries: number,
    ): RateLimitResult {
        const now = Date.now();

        this.enforceCapacity(
            maxEntries,
            now,
        );

        const existing =
            this.entries.get(key);

        if (
            !existing ||
            existing.resetAt <=
                now
        ) {
            const resetAt =
                now + windowMs;

            this.entries.set(
                key,
                {
                    count: 1,
                    resetAt,
                    touchedAt: now,
                },
            );

            return {
                allowed: true,
                remaining:
                    Math.max(
                        0,
                        maxRequests - 1,
                    ),
                retryAfterSeconds: 0,
                resetAt,
            };
        }

        existing.touchedAt = now;

        if (
            existing.count >=
            maxRequests
        ) {
            return {
                allowed: false,
                remaining: 0,
                retryAfterSeconds:
                    Math.max(
                        1,
                        Math.ceil(
                            (
                                existing.resetAt -
                                now
                            ) /
                            1000,
                        ),
                    ),
                resetAt:
                    existing.resetAt,
            };
        }

        existing.count += 1;

        return {
            allowed: true,
            remaining:
                Math.max(
                    0,
                    maxRequests -
                    existing.count,
                ),
            retryAfterSeconds: 0,
            resetAt:
                existing.resetAt,
        };
    }
}
