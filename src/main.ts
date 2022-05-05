import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import * as fs from 'fs';
import { NestExpressApplication } from '@nestjs/platform-express';

import * as util from "./util";
import { NestApplicationOptions } from '@nestjs/common';

async function bootstrap() {
  let nestOptions: NestApplicationOptions = undefined;

  if (util.isLocal()) {
    const httpsOptions = {
      key: fs.readFileSync('./secrets/server.key'),
      cert: fs.readFileSync('./secrets/server.crt')
    };

    nestOptions = {httpsOptions};
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, nestOptions);

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
