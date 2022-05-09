import { Injectable, Logger } from '@nestjs/common';
import { AppService, ClientState } from 'src/app.service';
import { Socket } from 'socket.io';
import { parse } from "cookie";

class ChatClient {
	constructor(
		public socket: Socket,
		public state: ClientState
	) {}
}

@Injectable()
export class ChatService {
	private readonly logger: Logger = new Logger(ChatService.name);

	private clients: Map<string, ChatClient> = new Map();
	private clientsSID: Map<number, string> = new Map();


	async registerConnection(appService: AppService, socket: Socket): Promise<boolean> {
		const cookie: string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
		let client: ClientState = await appService.getSessionDataToken(cookie);

		// Second case is VERY unlikely, but we're never too sure
		if (this.clientsSID.has(client.getId()) || this.clients.has(socket.id)) {
			this.logger.error(`registerConnection: double chat opened for ${client.getId()} (${client.login})`);
			return false;
		}

		this.clientsSID.set(client.getId(), socket.id);
		this.clients.set(socket.id, new ChatClient(socket, client));

		return true;
	}

	unregisterConnection(appService: AppService, client: Socket) {
		if (!this.clients.has(client.id)) {
			this.logger.warn(`unregisterConnection: no socket found for ${client.id}`);
			return;
		}

		let clientState = this.clients.get(client.id).state;
		this.clients.delete(client.id);
		this.clientsSID.delete(clientState.getId());
	}

	onMessage(senderId: string, payload: any): boolean {
		let client: ChatClient = this.clients.get(senderId);

		if (typeof payload.targetId !== "number") {
			this.logger.error(`onMessage: invalid field targetId type: ${typeof payload.targetId}`)
			return false;
		}

		if (typeof payload.message !== "string") {
			this.logger.error(`onMessage: invalid field message type: ${typeof payload.message}`)
			return false;
		}

		let targetId: number = payload.targetId;
		let message: string = payload.message;

		if (!Number.isSafeInteger(targetId) || targetId <= 0) {
			this.logger.error(`onMessage: invalid field targetId value: ${targetId}`)
			return false;
		}

		// Assuming type, checking only for truthy/falsy value
		let isRoom: boolean = payload.isRoom;

		if (isRoom) {
			// TODO: Room support
		} else {
			let targetSID: string;
			let target: ChatClient;

			if ((targetSID = this.clientsSID.get(targetId)) === undefined) {
				this.logger.error(`onMessage: user not connected: ${targetId} (disc 0)`);
				return false;
			}

			if ((target = this.clients.get(targetSID)) === undefined) {
				this.logger.error(`onMessage: user not connected: ${targetId} (disc 1)`);
				return false;
			}

			// TODO: Check for blocked folks
			target.socket.emit("message", {
				senderId: client.state.getId(),
				message: message
			});
		}

		return true;
	}
}
