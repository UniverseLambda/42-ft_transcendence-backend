import { SubscribeMessage, WebSocketGateway, MessageBody, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from "socket.io";
import { GameService } from "./game.service";
import { AppService } from "src/app.service";
import { Vector3 } from 'three';

@WebSocketGateway({ cors: { origin: "http://localhost:4200" }, namespace: "game" })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  // constructor(private appService : AppService, private gameService: GameService, private engineService: EngineService) {}
  constructor(private appService : AppService, private gameService: GameService) {}
  private logger: Logger = new Logger('GameGateway');

	async handleConnection(client: Socket, ...args: any[]) {
		try { await this.gameService.registerClient(this.appService, client); }
		catch (e) {
			this.logger.error("handleConnection: " + e.name + " " + e.message);
			client.disconnect(true);
		}
	}

	handleDisconnect(client: Socket) {
		try { this.gameService.unregisterClient(client); }
		catch (e) { this.logger.error("handleDisconnect: " + e.name + " " + e.message); }
	}

	// Need implementation client side
	@SubscribeMessage('ready')
	handleReady(@ConnectedSocket() client : Socket) {
		try {this.gameService.readyToStart(client);}
		catch (e) { this.logger.error("handleReady: " + e.name + " " + e.message); }
	}

	@SubscribeMessage('throwBall')
	handleThrowBall(@ConnectedSocket() client: Socket) {
		this.gameService.throwBall(client);
	}

	@SubscribeMessage('playerPosition')
	handlePlayerPosition(@ConnectedSocket() client: any, @MessageBody() payload: number) {
		// this.logger.debug("************* playerPosition");

		if (typeof payload !== "number") {
			this.logger.error(`handlePlayerPosition: invalid payload: ${payload}`);
			return;
		}

		this.gameService.updatePlayer(client, payload);
	}
	@SubscribeMessage('ballClientPosition')
	handleBallPosition(@ConnectedSocket() client: any, @MessageBody() payload: Vector3) {
		// this.logger.debug("************* ballClientPosition");

		this.gameService.updateBallPosition(client, payload);
	}
	@SubscribeMessage('sendScores')
	handlePlayersScore(@ConnectedSocket() client: any, @MessageBody() payload: {score1:number, score2:number}) {
		// this.logger.debug("************* ballClientPosition");

		this.gameService.updatePlayersScore(client, payload);
	}
}
