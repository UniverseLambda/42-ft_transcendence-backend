import { SubscribeMessage, WebSocketGateway, MessageBody, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from "socket.io";
import { GameService } from "./game.service";
import { AppService, ClientState } from "src/app.service";
import { EngineService } from "src/game/engine.service";

import * as THREE from 'three';

@WebSocketGateway({ cors: { origin: "http://localhost:4200" }, namespace: "game" })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private appService : AppService, private gameService: GameService, private engineService: EngineService) {}
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

	@SubscribeMessage('throwBall')
	handleThrowBall(@ConnectedSocket() client: Socket) {
		this.gameService.throwBall(client);
	}

	@SubscribeMessage('ballPosition')
	handleBallPosition(@ConnectedSocket() client: Socket, @MessageBody() payload : THREE.Vector3) {
		this.gameService.calculateBallPosition(client, payload);
	}

	// TO DO :
	// - Define which player send that
	// - Control the position
	// - Communicate to the other player
	// - update state
	// - ASYNC
	@SubscribeMessage('playerPosition')
	handlePlayerPosition(@ConnectedSocket() client: any, @MessageBody() payload: THREE.Vector3) {
		this.engineService.updatePlayer(client, payload);
	}
}
