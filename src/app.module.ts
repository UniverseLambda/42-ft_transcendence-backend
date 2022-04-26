import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoginController } from './login/login.controller';
import { SecurityMiddleware } from './security.middleware';
import { SocketGateway } from './socket.gateway';
import { ProfileController } from './profile/profile.controller';

@Module({
  imports: [],
  controllers: [AppController, LoginController, ProfileController],
  providers: [AppService, SocketGateway],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SecurityMiddleware)
      .exclude("/login/redir_42api", "/login/is_auth", "/login/oauth")
      .forRoutes("*");
  }
}
