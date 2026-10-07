import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ACCESS_COOKIE } from './auth/auth.cookies.js';
import { configureApp } from './app.setup.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  const config = new DocumentBuilder()
    .setTitle('API')
    .setDescription("Api documentation v1")
    .setVersion('1.0')
    .addCookieAuth(ACCESS_COOKIE)
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, document)

  configureApp(app)
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
