import { SubscribeMessage, WebSocketGateway, MessageBody, OnGatewayConnection, OnGatewayDisconnect, ConnectedSocket } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket } from "socket.io";
import { GameService, PendingClient } from "./game.service";
import { AppService } from "src/app.service";

@WebSocketGateway({ cors: { origin: "http://localhost:4200" }, namespace: "matchmaking" })
export class MatchmakingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private appService : AppService, private gameService: GameService) {}
  private logger: Logger = new Logger(MatchmakingGateway.name);

	async handleConnection(client: Socket, ...args: any[]) {
		this.logger.log('front connected : ', client.id);
		try { await this.gameService.registerMatchmaking(this.appService, client); }
		catch (e) {
			this.logger.error("handleConnection: " + e.name + " " + e.message);
			client.disconnect(true);
		}
	}

	handleDisconnect(client: Socket) {
		try { this.gameService.unregisterPending(client, this.appService); }
		catch (e) { this.logger.error("handleDisconnect: " + e.name + " " + e.message); }
	}

	@SubscribeMessage('search')
	handleSearchMatch(@ConnectedSocket() client: Socket, @MessageBody() payload : PendingClient) {
		try { this.gameService.searchGame(client, payload); }
		catch (e) {
			this.logger.error("handleSearchMatch: " + e.name + " " + e.message);
			client.disconnect(true);
		}
	}

	@SubscribeMessage('invite')
	handleInvite(@ConnectedSocket() client: Socket, @MessageBody() payload : PendingClient) {
		try { this.gameService.inviteUser(client, payload); }
		catch (e) { this.logger.error("handleInvite: " + e.name + " " + e.message); }
	}

	@SubscribeMessage('accept')
	handleAccept(@ConnectedSocket() client: Socket, @MessageBody() payload : PendingClient) {
		try { this.gameService.inviteAccepted(client); }
		catch (e) { this.logger.error("handleAccept: " + e.name + " " + e.message); }
	}

	@SubscribeMessage('refuse')
	handleRefuse(@ConnectedSocket() client: Socket, @MessageBody() payload : PendingClient) {
		try { this.gameService.inviteRefused(client); }
		catch (e) { this.logger.error("handleRefuse: " + e.name + " " + e.message); }
	}

	@SubscribeMessage('cancel')
	handleCancelMatch(@ConnectedSocket() client: Socket, @MessageBody() payload : PendingClient) {
		try { client.disconnect(true); }
		catch (e) { this.logger.error("handleCancelMatch: " + e.name + " " + e.message); }
	}
}
