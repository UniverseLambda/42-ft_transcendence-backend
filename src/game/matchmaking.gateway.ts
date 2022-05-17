import { SubscribeMessage, WebSocketGateway, MessageBody, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from "socket.io";
import { GameService, PendingClient } from "./game.service";
import { AppService, ClientState } from "src/app.service";

@WebSocketGateway({ cors: { origin: "http://localhost:4200" }, namespace: "matchmaking" })
export class MatchmakingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private appService : AppService, private gameService: GameService) {}
  private logger: Logger = new Logger('MatchmakingGateway');

	async handleConnection(client: Socket, ...args: any[]) {
		this.logger.log('front connected : ', client.id);
		try { this.gameService.registerMatchmaking(this.appService, client); }
		catch (e) { this.logger.log(e.name + e.message); }
	}

	handleDisconnect(client: Socket) {
		try { this.gameService.unregisterPending(client); }
		catch (e) { this.logger.log(e.name + e.message); }
	}

	@SubscribeMessage('search')
	handleSearchMatch(@ConnectedSocket() client: Socket, @MessageBody() payload : PendingClient) {
		try { this.gameService.searchGame(client, payload); }
		catch (e) { this.logger.log(e.name + e.message); }
	}

	@SubscribeMessage('cancel')
	handleCancelMatch(@ConnectedSocket() client: Socket, @MessageBody() payload : PendingClient) {
		try { this.gameService.unregisterPending(client); }
		catch (e) { this.logger.log(e.name + e.message); }
	}

}
