import { NestFactory } from '@nestjs/core';
import { configureApp } from './common/configure-app.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = configureApp(app);
  app.enableShutdownHooks();

  await app.listen(config.port);
}
await bootstrap();
