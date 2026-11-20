import {
  type INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { readAppConfig, type AppConfig } from '../config/env.validation.js';
import { HttpExceptionFilter } from './filters/http-exception.filter.js';

type ConfigureAppOptions = {
  swagger?: boolean;
};

/**
 * Express `trust proxy` stays off unless TRUSTED_PROXY_HOPS is 1–5.
 * A numeric hop count trusts only that many proxies closest to this process.
 * It does not trust an arbitrary client-supplied X-Forwarded-For list.
 * Leave it at 0 when the API port is reachable directly, including local
 * development. Set it only when every request arrives through that many proxies
 * and each proxy appends the real peer address. Readiness stays throttled.
 * Liveness does not.
 */
export function isSwaggerEnabled(
  nodeEnv: AppConfig['nodeEnv'],
  options: ConfigureAppOptions = {},
): boolean {
  return options.swagger ?? nodeEnv !== 'production';
}

export function resolveAppConfig(app: INestApplication): AppConfig {
  const configService = app.get(ConfigService);

  return readAppConfig({
    NODE_ENV: configService.get('NODE_ENV'),
    PORT: configService.get('PORT'),
    API_PREFIX: configService.get('API_PREFIX'),
    CORS_ORIGINS: configService.get('CORS_ORIGINS'),
    DATABASE_URL: configService.get('DATABASE_URL'),
    SUPABASE_URL: configService.get('SUPABASE_URL'),
    SUPABASE_ANON_KEY: configService.get('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: configService.get('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_JWT_ISSUER: configService.get('SUPABASE_JWT_ISSUER'),
    SUPABASE_JWT_SECRET: configService.get('SUPABASE_JWT_SECRET'),
    SUPABASE_JWKS_URL: configService.get('SUPABASE_JWKS_URL'),
    SIGNUP_INTENT_SECRET: configService.get('SIGNUP_INTENT_SECRET'),
  });
}

export function configureApp(
  app: INestApplication,
  options: ConfigureAppOptions = {},
): AppConfig {
  const config = resolveAppConfig(app);
  const enableSwagger = isSwaggerEnabled(config.nodeEnv, options);

  if (config.trustedProxyHops > 0) {
    (
      app.getHttpAdapter().getInstance() as {
        set: (key: string, value: number) => void;
      }
    ).set('trust proxy', config.trustedProxyHops);
  }
  app.use(
    helmet({
      contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false,
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        // Query strings must not use Boolean("false") === true.
        // Numeric query fields declare @Type(() => Number) explicitly.
        enableImplicitConversion: false,
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(config.nodeEnv));
  app.setGlobalPrefix(config.apiPrefix, {
    exclude: [{ path: '/', method: RequestMethod.GET }],
  });
  app.enableCors({
    origin: config.corsOrigins,
    credentials: false,
  });

  if (enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('HomelyBlock API')
      .setDescription(
        [
          'HomelyBlock backend API.',
          '',
          'Protected routes expect a Supabase access token.',
          'Click **Authorize**, paste the JWT (without the `Bearer ` prefix), then use **Try it out**.',
        ].join('\n'),
      )
      .setVersion('0.0.1')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Supabase access token (JWT)',
        },
        'bearer',
      )
      .build();
    const documentFactory = () =>
      SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, documentFactory, {
      useGlobalPrefix: false,
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  return config;
}
