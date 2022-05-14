import { SubscribeMessage, WebSocketGateway, MessageBody, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from "socket.io";
import { GameService } from "./game.service";
import { AppService, ClientState } from "src/app.service";

import * as THREE from 'three';


@WebSocketGateway({ cors: { origin: "http://localhost:4200" }, namespace: "game" })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private appService : AppService, private gameService: GameService) {}
  private logger: Logger = new Logger('GameGateway');

	async handleConnection(client: Socket, ...args: any[]) {
		// await this.chatService.registerConnection(this.appService, client);
		this.logger.log('LALAILALIOY');
		if (!await this.gameService.registerClient(this.appService, client)) {
			client.disconnect(true);
			return false;
		}

		this.gameService.sendMessage();
	}

	handleDisconnect(client: Socket) {
		if (!this.gameService.unregisterClient(this.appService, client)) {
		}
	}

	// Simple example
	@SubscribeMessage('playerPosition')
	handleMessage(@ConnectedSocket() client: any, @MessageBody() payload: THREE.Vector3) : string {
		this.gameService.updatePlayer(payload);
		return 'Coucou';
	}

	// @SubscribeMessage('search')
	//
	// @SubscribeMessage('cancelSearch')
	//
	// @SubscribeMessage('giveGameInit')
	//
	// // Async
	// @SubscribeMessage('throwBall')
	//
	// @SubscribeMessage('movePaddle')

}
