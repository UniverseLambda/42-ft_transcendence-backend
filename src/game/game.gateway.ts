import { SubscribeMessage, WebSocketGateway, MessageBody, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket } from '@nestjs/websockets';
import { Socket } from "socket.io";
import { GameService } from "./game.service";
import { AppService, ClientState } from "src/app.service";

@WebSocketGateway({ cors: { origin: "http://localhost:4200" }, namespace: "game" })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private appService : AppService, private gameService: GameService) {}

	async handleConnection(client: Socket, ...args: any[]) {
		// await this.chatService.registerConnection(this.appService, client);
		await this.gameService.registerClient(this.appService, client);
	}

	handleDisconnect(client: Socket) {
		this.gameService.unregisterClient(this.appService, client);
	}

	// Simple example
	@SubscribeMessage('hello')
	handleMessage(@ConnectedSocket() client: any, @MessageBody() payload: any) : string {
		return 'Hi mate';
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
