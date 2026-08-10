import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
} from '@nestjs/common';

import type {
    Response,
} from 'express';

import type {
    SecurityRequest,
} from '../../security/security-request';

interface ErrorResponse {
    statusCode: number;
    error: string;
    message: string | string[];
    path: string;
    timestamp: string;
    request_id?: string;
}

interface MappedError {
    status: number;
    error: string;
    message: string;
}

@Catch()
export class GlobalExceptionFilter
    implements ExceptionFilter {
    catch(
        exception: unknown,
        host: ArgumentsHost,
    ): void {
        const context =
            host.switchToHttp();

        const response =
            context.getResponse<Response>();

        const request =
            context.getRequest<SecurityRequest>();

        const path =
            request.originalUrl ??
            request.url;

        if (
            exception instanceof
            HttpException
        ) {
            this.handleHttpException(
                exception,
                response,
                path,
                request.requestId,
            );

            return;
        }

        const errorCode =
            this.findErrorCode(
                exception,
            );

        const mappedError =
            this.mapErrorCode(
                errorCode,
            );

        if (mappedError) {
            response
                .status(
                    mappedError.status,
                )
                .json({
                    statusCode:
                        mappedError.status,

                    error:
                        mappedError.error,

                    message:
                        mappedError.message,

                    path,

                    timestamp:
                        new Date()
                            .toISOString(),

                    request_id:
                        request.requestId,
                } satisfies ErrorResponse);

            return;
        }

        console.error(
            '[GlobalExceptionFilter]',
            exception,
        );

        response
            .status(
                HttpStatus.INTERNAL_SERVER_ERROR,
            )
            .json({
                statusCode:
                    HttpStatus
                        .INTERNAL_SERVER_ERROR,

                error:
                    'Internal Server Error',

                message:
                    'Đã xảy ra lỗi hệ thống',

                path,

                timestamp:
                    new Date()
                        .toISOString(),

                request_id:
                    request.requestId,
            } satisfies ErrorResponse);
    }

    private handleHttpException(
        exception: HttpException,
        response: Response,
        path: string,
        requestId?: string,
    ): void {
        const status =
            exception.getStatus();

        const exceptionResponse =
            exception.getResponse();

        let message:
            string |
            string[] =
            exception.message;

        let error =
            exception.name;

        if (
            typeof exceptionResponse ===
            'string'
        ) {
            message =
                exceptionResponse;
        } else if (
            this.isRecord(
                exceptionResponse,
            )
        ) {
            const responseMessage =
                exceptionResponse.message;

            const responseError =
                exceptionResponse.error;

            if (
                typeof responseMessage ===
                'string' ||
                Array.isArray(
                    responseMessage,
                )
            ) {
                message =
                    responseMessage as
                    | string
                    | string[];
            }

            if (
                typeof responseError ===
                'string'
            ) {
                error =
                    responseError;
            }
        }

        response
            .status(status)
            .json({
                statusCode: status,
                error,
                message,
                path,
                timestamp:
                    new Date()
                        .toISOString(),

                request_id:
                    requestId,
            } satisfies ErrorResponse);
    }

    private mapErrorCode(
        code?: string,
    ): MappedError | undefined {
        if (!code) {
            return undefined;
        }

        const mappings:
            Record<
                string,
                MappedError
            > = {
            P2000: {
                status:
                    HttpStatus.BAD_REQUEST,
                error:
                    'Bad Request',
                message:
                    'Dữ liệu vượt quá độ dài cho phép',
            },

            P2002: {
                status:
                    HttpStatus.CONFLICT,
                error:
                    'Conflict',
                message:
                    'Dữ liệu đã tồn tại',
            },

            P2003: {
                status:
                    HttpStatus.CONFLICT,
                error:
                    'Conflict',
                message:
                    'Không thể thực hiện vì dữ liệu đang được liên kết hoặc vi phạm ràng buộc',
            },

            P2011: {
                status:
                    HttpStatus.BAD_REQUEST,
                error:
                    'Bad Request',
                message:
                    'Thiếu dữ liệu bắt buộc',
            },

            P2014: {
                status:
                    HttpStatus.CONFLICT,
                error:
                    'Conflict',
                message:
                    'Thao tác làm vi phạm quan hệ dữ liệu',
            },

            P2021: {
                status:
                    HttpStatus.SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Cơ sở dữ liệu chưa đồng bộ với phiên bản phần mềm',
            },

            P2022: {
                status:
                    HttpStatus.SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Cơ sở dữ liệu chưa đồng bộ với phiên bản phần mềm',
            },

            P2024: {
                status:
                    HttpStatus.SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Hệ thống đang bận hoặc hết kết nối cơ sở dữ liệu; vui lòng thử lại',
            },

            P2025: {
                status:
                    HttpStatus.NOT_FOUND,
                error:
                    'Not Found',
                message:
                    'Không tìm thấy dữ liệu cần xử lý',
            },

            P2034: {
                status:
                    HttpStatus.CONFLICT,
                error:
                    'Conflict',
                message:
                    'Dữ liệu vừa được thay đổi bởi thao tác khác; vui lòng tải lại và thử lại',
            },

            DB_UNAVAILABLE: {
                status:
                    HttpStatus
                        .SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Cơ sở dữ liệu hiện không sẵn sàng; hệ thống đang thử khôi phục kết nối',
            },

            DB_AUTHENTICATION_FAILED: {
                status:
                    HttpStatus
                        .SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Không thể xác thực kết nối cơ sở dữ liệu',
            },

            P1000: {
                status:
                    HttpStatus
                        .SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Không thể đăng nhập vào cơ sở dữ liệu',
            },

            P1001: {
                status:
                    HttpStatus
                        .SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Không thể kết nối cơ sở dữ liệu',
            },

            P1002: {
                status:
                    HttpStatus
                        .SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Kết nối cơ sở dữ liệu bị quá thời gian',
            },

            ETIMEOUT: {
                status:
                    HttpStatus
                        .SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Kết nối cơ sở dữ liệu bị quá thời gian',
            },

            ELOGIN: {
                status:
                    HttpStatus
                        .SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Không thể đăng nhập vào cơ sở dữ liệu',
            },

            ECONNREFUSED: {
                status:
                    HttpStatus
                        .SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Cơ sở dữ liệu hiện không sẵn sàng',
            },

            ECONNRESET: {
                status:
                    HttpStatus.SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Kết nối cơ sở dữ liệu vừa bị gián đoạn; vui lòng thử lại',
            },

            ECONNCLOSED: {
                status:
                    HttpStatus.SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Kết nối cơ sở dữ liệu đã đóng; vui lòng thử lại',
            },

            EINVALIDSTATE: {
                status:
                    HttpStatus.SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Kết nối cơ sở dữ liệu đang được khôi phục; vui lòng thử lại',
            },

            ESOCKET: {
                status:
                    HttpStatus.SERVICE_UNAVAILABLE,
                error:
                    'Service Unavailable',
                message:
                    'Kết nối mạng tới cơ sở dữ liệu bị gián đoạn; vui lòng thử lại',
            },
        };

        return mappings[code];
    }

    private findErrorCode(
        value: unknown,
        visited =
            new Set<unknown>(),
        depth = 0,
    ): string | undefined {
        if (
            depth > 6 ||
            !this.isRecord(value) ||
            visited.has(value)
        ) {
            return undefined;
        }

        visited.add(value);

        for (
            const key of [
                'code',
                'originalCode',
            ]
        ) {
            const code =
                value[key];

            if (
                typeof code ===
                'string'
            ) {
                return code;
            }
        }

        for (
            const key of [
                'originalError',
                'cause',
                'meta',
                'driverAdapterError',
            ]
        ) {
            const nestedCode =
                this.findErrorCode(
                    value[key],
                    visited,
                    depth + 1,
                );

            if (nestedCode) {
                return nestedCode;
            }
        }

        return undefined;
    }

    private isRecord(
        value: unknown,
    ): value is Record<
        string,
        unknown
    > {
        return (
            typeof value ===
            'object' &&
            value !== null
        );
    }
}