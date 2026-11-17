import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

async function startServer() {
  // rawBody потрібен для перевірки підпису GitHub вебхуків
  const app = await NestFactory.create(AppModule, { rawBody: true });

  configureApp(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`Server running: http://localhost:${port}/api`);
  console.log(`Swagger: http://localhost:${port}/docs`);
}

void startServer();
