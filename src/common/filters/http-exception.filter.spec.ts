import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter.js';

describe('HttpExceptionFilter', () => {
  it('returns the stable API error shape for HttpException', () => {
    const filter = new HttpExceptionFilter('test');
    const json = vi.fn();
    const response = {
      status: vi.fn().mockReturnValue({ json }),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ method: 'GET', url: '/api/v1/missing' }),
      }),
    };

    filter.catch(new NotFoundException('Resource not found'), host as never);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Resource not found',
      details: [],
    });
  });

  it('maps validation arrays into details without exposing stacks', () => {
    const filter = new HttpExceptionFilter('production');
    const json = vi.fn();
    const response = {
      status: vi.fn().mockReturnValue({ json }),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ method: 'POST', url: '/api/v1/example' }),
      }),
    };

    filter.catch(
      new BadRequestException({
        message: ['name must be a string', 'property secret should not exist'],
        error: 'Bad Request',
      }),
      host as never,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      code: 'BAD_REQUEST',
      message: 'Validation failed',
      details: ['name must be a string', 'property secret should not exist'],
    });
  });

  it('hides unexpected error details', () => {
    const filter = new HttpExceptionFilter('production');
    const json = vi.fn();
    const response = {
      status: vi.fn().mockReturnValue({ json }),
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ method: 'GET', url: '/api/v1/health' }),
      }),
    };

    filter.catch(new Error('secret database password leaked'), host as never);

    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      details: [],
    });
  });
});
