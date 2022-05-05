import { Injectable } from '@nestjs/common';
import { AppService, ClientState } from 'src/app.service';
import { Socket } from 'socket.io';
import { parse } from "cookie";

class ChatClient {
	public socket: Socket;
	public state: ClientState;
}

@Injectable()
export class ChatService {
	private clients: Map<string, ChatClient> = new Map();
	private clientsSID: Map<number, string> = new Map();


	async registerConnection(appService: AppService, socket: Socket) {
		const cookie: string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
		let client: ClientState = await appService.getSessionDataToken(cookie);

		return true;
	}

	unregisterConnection(appService: AppService, client: Socket) {
		let clientState = this.clients.get(client.id).state;
		this.clients.delete(client.id);
		this.clientsSID.delete(clientState.getId());
	}
}
