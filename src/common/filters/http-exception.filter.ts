import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export type ApiErrorBody = {
  statusCode: number;
  code: string;
  message: string;
  details: unknown[];
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly nodeEnv = 'development') {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const body = this.toErrorBody(exception);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} failed with ${body.statusCode}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (this.nodeEnv !== 'production') {
      this.logger.warn(
        `${request.method} ${request.url} failed with ${body.statusCode}: ${body.message}`,
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toErrorBody(exception: unknown): ApiErrorBody {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload = exception.getResponse();
      const { message, details } = this.extractMessageAndDetails(payload);

      return {
        statusCode,
        code: this.codeForStatus(statusCode),
        message,
        details,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      details: [],
    };
  }

  private extractMessageAndDetails(payload: string | object): {
    message: string;
    details: unknown[];
  } {
    if (typeof payload === 'string') {
      return { message: payload, details: [] };
    }

    const record = payload as {
      message?: unknown;
      error?: unknown;
    };

    if (Array.isArray(record.message)) {
      return {
        message: 'Validation failed',
        details: record.message,
      };
    }

    if (typeof record.message === 'string' && record.message.length > 0) {
      return { message: record.message, details: [] };
    }

    if (typeof record.error === 'string' && record.error.length > 0) {
      return { message: record.error, details: [] };
    }

    return { message: 'Request failed', details: [] };
  }

  private codeForStatus(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return 'BAD_REQUEST';
      case HttpStatus.UNAUTHORIZED:
        return 'UNAUTHORIZED';
      case HttpStatus.FORBIDDEN:
        return 'FORBIDDEN';
      case HttpStatus.NOT_FOUND:
        return 'NOT_FOUND';
      case HttpStatus.CONFLICT:
        return 'CONFLICT';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'TOO_MANY_REQUESTS';
      case HttpStatus.SERVICE_UNAVAILABLE:
        return 'SERVICE_UNAVAILABLE';
      default:
        if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
          return 'INTERNAL_SERVER_ERROR';
        }
        return 'HTTP_ERROR';
    }
  }
}
