import { SubscribeMessage, WebSocketGateway, MessageBody, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from "socket.io";
import { GameService } from "./game.service";
import { AppService } from "src/app.service";
// import { EngineService } from "src/game/engine.service";

import * as THREE from 'three';
// import { cli } from 'webpack';

@WebSocketGateway({ cors: { origin: "http://localhost:4200" }, namespace: "game" })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  // constructor(private appService : AppService, private gameService: GameService, private engineService: EngineService) {}
  constructor(private appService : AppService, private gameService: GameService) {}
  private logger: Logger = new Logger('GameGateway');

	async handleConnection(client: Socket, ...args: any[]) {
		try { await this.gameService.registerClient(this.appService, client); }
		catch (e) {
			this.logger.error(e.name + e.message);
			client.disconnect(true);
		}
	}

	handleDisconnect(client: Socket) {
		try { this.gameService.unregisterClient(client); }
		catch (e) { this.logger.error(e.name + e.message); }
	}

	// Need implementation client side
	@SubscribeMessage('ready')
	handleReady(@ConnectedSocket() client : Socket) {
		try {this.gameService.readyToStart(client);}
		catch (e) { this.logger.error(e.name + e.message); }
	}

	@SubscribeMessage('throwBall')
	handleThrowBall(@ConnectedSocket() client: Socket) {
		this.gameService.throwBall(client);
	}

	@SubscribeMessage('ballClient')
	handleBallPosition(@ConnectedSocket() client: Socket, @MessageBody() payload : THREE.Vector3) {
		//to launch job :
		this.gameService.updateBallPosition(client, payload);
	}

	@SubscribeMessage('playerPosition')
	handlePlayerPosition(@ConnectedSocket() client: any, @MessageBody() payload: THREE.Vector3) {
		this.gameService.updatePlayer(client, payload);
	}
}
