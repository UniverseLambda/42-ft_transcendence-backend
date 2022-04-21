import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import * as cors from 'cors';
import * as fs from 'fs';

async function bootstrap() {
  const httpsOptions = {
    key: fs.readFileSync('./secrets/server.key'),
    cert: fs.readFileSync('./secrets/server.crt')
  }

  const app = await NestFactory.create(AppModule, {httpsOptions});

  await app.use(cors({origin: "http://localhost:4200"})).use(cookieParser()).listen(3000);
}
bootstrap();
