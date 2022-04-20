import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoginController } from './login/login.controller';
import { SocketGateway } from './socket.gateway';

@Module({
  imports: [],
  controllers: [AppController, LoginController],
  providers: [AppService, SocketGateway],
})
export class AppModule {}
