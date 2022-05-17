import { SubscribeMessage, WebSocketGateway, MessageBody, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from "socket.io";
import { GameService } from "./game.service";
import { AppService, ClientState } from "src/app.service";
// import { EngineService } from "src/game/engine.service";

import * as THREE from 'three';
import { cli } from 'webpack';

@WebSocketGateway({ cors: { origin: "http://localhost:4200" }, namespace: "game" })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
//   constructor(private appService : AppService, private gameService: GameService, private engineService: EngineService) {}
  constructor(private appService : AppService, private gameService: GameService) {}
  private logger: Logger = new Logger('GameGateway');

	async handleConnection(client: Socket, ...args: any[]) {
		// await this.chatService.registerConnection(this.appService, client);
		this.logger.log('LALAILALIOY : ', client.id);
		if (!await this.gameService.registerClient(this.appService, client)) {
			client.disconnect(true);
			return false;
		}

	}

	handleDisconnect(client: Socket) {
		if (!this.gameService.unregisterClient(this.appService, client)) { }
	}

	@SubscribeMessage('searchGame')
	handleSearch(@ConnectedSocket() client: Socket) { }

	@SubscribeMessage('cancelSearch')
	handleCancelSearch(@ConnectedSocket() client: Socket) { }

	@SubscribeMessage('throwBall')
	handleThrowBall(@ConnectedSocket() client: Socket) {
		this.gameService.throwBall(client);
	}

	// TO DO :
	// - Define which player send that
	// - Control the position
	// - Communicate to the other player
	// - update state
	// - ASYNC
	@SubscribeMessage('playerPosition')
	handlePlayerPosition(@ConnectedSocket() client: Socket, @MessageBody() payload: THREE.Vector3) {
		// this.engineService.updatePlayer(client, payload);
		this.gameService.updatePlayer(client, payload);
	}

	@SubscribeMessage('ballClient')
	handleBallPosition(@ConnectedSocket() client: Socket, @MessageBody() payload: THREE.Vector3) {
		if (client.id === this.gameService.newsocket1.id) {
			this.gameService.ballP1Received = true;
			this.gameService.ballP1Pos = payload;
		}
		else if (client.id === this.gameService.newsocket2.id) {
			this.gameService.ballP2Received = true;
			this.gameService.ballP2Pos = payload;
		}
		// Logger.log('handleBallPosition');
		if (this.gameService.ballP1Received && this.gameService.ballP2Received)
			this.gameService.updateBallPosition();
	}
}
