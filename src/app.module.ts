import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoginController } from './login/login.controller';
import { SecurityMiddleware } from './security.middleware';
import { ProfileController } from './profile/profile.controller';
import { CacheMiddleware } from './cache.middleware';
import { ChatService } from './chat/chat.service';
import { ChatGateway } from './chat/chat.gateway';
import { GameService } from './game/game.service';
import { GameController } from './game/game.controller';
import { GameGateway } from './game/game.gateway';

@Module({
  imports: [],
  controllers: [AppController, LoginController, ProfileController, GameController],
  providers: [AppService, ChatService, ChatGateway, GameService, GameGateway],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CacheMiddleware).forRoutes("*");
    consumer.apply(SecurityMiddleware)
      .exclude("/login/redir_42api", "/login/is_auth", "/login/oauth", "/login/2fa_login")
      .forRoutes("*");
  }
}
