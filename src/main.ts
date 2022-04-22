import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import * as cors from 'cors';
import * as fs from 'fs';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const httpsOptions = {
    key: fs.readFileSync('./secrets/server.key'),
    cert: fs.readFileSync('./secrets/server.crt')
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {httpsOptions});
  app.enableCors({
    origin: 'http://localhost:4200',
    methods: 'POST,GET',
    credentials: true,
    allowedHeaders: 'Content-Type',
  });
  await app.use(cookieParser()).listen(3000);
}
bootstrap();
