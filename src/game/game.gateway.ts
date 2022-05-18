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
  // constructor(private appService : AppService, private gameService: GameService, private engineService: EngineService) {}
  constructor(private appService : AppService, private gameService: GameService) {}
  private logger: Logger = new Logger('GameGateway');

	async handleConnection(client: Socket, ...args: any[]) {
		// await this.chatService.registerConnection(this.appService, client);
		this.logger.log('CONNECTION : ', client.id);
		if (!await this.gameService.registerClient(this.appService, client)) {
			client.disconnect(true);
			return false;
		}
	}

	handleDisconnect(client: Socket) {
		this.logger.log('DISCONNECTION : ', client.id);
		this.gameService.unregisterClient(client);
	}

	// Need implementation client side
	@SubscribeMessage('ready')
	handleReady(@ConnectedSocket() client : Socket) {
		this.gameService.readyToStart(client);
	}

	@SubscribeMessage('throwBall')
	handleThrowBall(@ConnectedSocket() client: Socket) {
		this.gameService.throwBall(client);
	}

	@SubscribeMessage('ballClient')
	handleBallPosition(@ConnectedSocket() client: Socket, @MessageBody() payload : THREE.Vector3) {
		//to launch job :
		this.gameService.updateBallPosition(client, payload);
		//to launch in another job :
		this.gameService.sendBallPosition(this.gameService.getGame(client.id));
	}

	// TO DO :
	// - Define which player send that
	// - Control the position
	// - Communicate to the other player
	// - update state
	// - ASYNC
	@SubscribeMessage('playerPosition')
	handlePlayerPosition(@ConnectedSocket() client: any, @MessageBody() payload: THREE.Vector3) {
		this.gameService.updatePlayer(client, payload);
	}
}
