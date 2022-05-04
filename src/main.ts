import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import * as fs from 'fs';
import { NestExpressApplication } from '@nestjs/platform-express';

import * as util from "./util";

async function bootstrap() {
  const httpsOptions = {
    key: fs.readFileSync('./secrets/server.key'),
    cert: fs.readFileSync('./secrets/server.crt')
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {httpsOptions});

  if (util.isLocal()) {
    app.enableCors({
      origin: 'http://localhost:4200',
      methods: 'POST,GET',
      credentials: true,
      allowedHeaders: 'Content-Type',
    });
  }

  await app.use(cookieParser()).listen(util.getBackendPort());
}

if (util.isLocal()) {
  console.warn("Starting server locally with CORS enabled");
}

bootstrap();
