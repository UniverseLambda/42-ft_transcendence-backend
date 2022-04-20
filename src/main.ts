import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  var cors = require('cors');
  await app.use(cors()).listen(3000);
}
bootstrap();
