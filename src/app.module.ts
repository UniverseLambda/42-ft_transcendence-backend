import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
// import { BullModule } from '@nestjs/bull';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoginController } from './login/login.controller';
import { SecurityMiddleware } from './security.middleware';
import { ProfileController } from './profile/profile.controller';
import { CacheMiddleware } from './cache.middleware';
import { ChatService } from './chat/chat.service';
import { ChatGateway } from './chat/chat.gateway';
import { GameService } from './game/game.service';
import { GameGateway } from './game/game.gateway';
// import { EngineService } from './game/engine.service';
// import { EngineConsumer } from './game/engine.service'; // update file name

import { MatchmakingGateway } from './game/matchmaking.gateway';

@Module({
  // imports: [
	//   BullModule.forRoot(
	// 	  {redis : {host : 'localhost', port : 6379} }
	//   ),
	//   BullModule.registerQueue(
	// 	  {name : 'gameEngine'},
	// 	  {name : 'updateBall'}
	//   ),
  // ],
  controllers: [AppController, LoginController, ProfileController],
  // providers: [AppService, ChatService, ChatGateway, GameService, GameGateway, MatchmakingGateway, EngineService, EngineConsumer],
  providers: [AppService, ChatService, ChatGateway, GameService, GameGateway, MatchmakingGateway],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CacheMiddleware).forRoutes("*");
    consumer.apply(SecurityMiddleware)
      .exclude("/login/redir_42api", "/login/is_auth", "/login/oauth", "/login/2fa_login")
      .forRoutes("*");
  }
}
