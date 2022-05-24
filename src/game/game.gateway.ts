import { SubscribeMessage, WebSocketGateway, MessageBody, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from "socket.io";
import { GameService } from "./game.service";
import { AppService } from "src/app.service";
import { Vector3 } from 'three';

@WebSocketGateway({ cors: { origin: "http://localhost:4200" }, namespace: "back/game" })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  // constructor(private appService : AppService, private gameService: GameService, private engineService: EngineService) {}
  constructor(private appService : AppService, private gameService: GameService) {}
  private logger: Logger = new Logger('GameGateway');

	async handleConnection(client: Socket, ...args: any[]) {
		try { await this.gameService.registerClient(this.appService, client); }
		catch (e) {
			this.logger.error("handleConnection: " + e.name + " " + e.message);
			client.emit('disconnectInGame', []);
			client.disconnect(true);
		}
	}

	handleDisconnect(client: Socket) {
		try { this.gameService.unregisterClient(client, this.appService); }
		catch (e) { this.logger.error("handleDisconnect: " + e.name + " " + e.message); }
	}

	// Need implementation client side
	@SubscribeMessage('ready')
	handleReady(@ConnectedSocket() client : Socket) {
		try {
			if (!this.gameService.readyToSpectate(client, this.appService))
				this.gameService.readyToStart(client, this.appService);
		}
		catch (e) { this.logger.error("handleReady: " + e.name + " " + e.message); }
	}

	@SubscribeMessage('throwBall')
	handleThrowBall(@ConnectedSocket() client: Socket) {
		this.gameService.throwBall(client);
	}

	@SubscribeMessage('playerPosition')
	handlePlayerPosition(@ConnectedSocket() client: any, @MessageBody() payload: number) {
		if (typeof payload !== "number") {
			this.logger.error(`handlePlayerPosition: invalid payload: ${payload}`);
			return;
		}

		this.gameService.updatePlayer(client, payload);
	}

	@SubscribeMessage('ballClientPosition')
	handleBallPosition(@ConnectedSocket() client: any, @MessageBody() payload: Vector3) {
		this.gameService.updateBallPosition(client, payload);
	}

	@SubscribeMessage('scored')
	handlePlayersScore(@ConnectedSocket() client: any, @MessageBody() payload:string) {
		this.logger.log('[GAME] A player scored');
		this.gameService.updatePlayersScore(client, payload, this.appService);
	}

	@SubscribeMessage('endGame')
	handleEndGame(@ConnectedSocket() client: any) {
		try { this.gameService.unregisterClient(client, this.appService); }
		catch (e) { this.logger.error("endGame: " + e.name + " " + e.message); }
		this.gameService.endGame(client, this.appService);
	}

}
