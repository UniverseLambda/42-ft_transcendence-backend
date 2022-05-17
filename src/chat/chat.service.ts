import { Injectable, Logger } from '@nestjs/common';
import { AppService, ClientState } from 'src/app.service';
import { Socket } from 'socket.io';
import { parse } from "cookie";

interface MessageReceipient {
	sendMessage(sender: ChatClient, message: string, roomId?: number): ChatResult;
	getId(): number;
}

class ChatClient implements MessageReceipient {
	private rooms: Map<number, ChatRoom> = new Map();

	constructor(
		public socket: Socket,
		public state: ClientState
	) {}

	roomJoined(room: ChatRoom, doNotEmit: boolean = false) {
		this.rooms.set(room.getId(), room);

		if (!doNotEmit)
			this.socket.emit("roomJoined", {roomId: room.getId(), name: room.name});
	}

	roomLeaved(room: ChatRoom) {
		this.rooms.delete(room.getId());

		this.socket.emit("roomLeaved", {roomId: room.getId()});
	}

	disconnected() {
		for (let room of this.rooms.values()) {
			room.userDisconnected(this);
		}
	}

	getId(): number {
		return this.state.getId();
	}

	sendMessage(sender: ChatClient, message: string, where?: number): ChatResult {
		if (where === undefined) {
			where = this.getId();
		}

		this.socket.emit("message", {
			senderId: sender.getId(),
			message: message,
			where: where,
			login: sender.state.login
		});
		return ChatResult.Ok;
	}
}

class ChatRoomClientData implements MessageReceipient {
	private muteStart: number = 0;
	private muteDuration: number = 0;

	constructor(public client: ChatClient, public admin: boolean) {}

	sendMessage(sender: ChatClient, message: string, roomId?: number): ChatResult {
		return this.client.sendMessage(sender, message, roomId);
	}

	getId(): number {
		return this.client.getId();
	}

	isMuted(): boolean {
		return (this.muteStart + this.muteDuration) > Date.now();
	}

	mute(muteDuration: number /* in secs */) {
		this.muteDuration = muteDuration * 1000 /* converting to ms */;
		this.muteStart = Date.now();
	}
}

enum ChatResult {
	Ok,
	NotRegistered,
	TargetNotFound,
	InvalidValue,
	AlreadyInRoom,
	PasswordRequired,
	WrongPassword,
	NotInRoom,
	TargetNotInRoom,
	NotAdmin,
	Blocked,
	Muted,
	Banned,
}

class ChatRoom implements MessageReceipient {
	private members: Map<number, ChatRoomClientData> = new Map<number, ChatRoomClientData>();

	constructor(public readonly roomId: number, public readonly name: string, creator: ChatClient, private roomPrivate: boolean, private password?: string) {
		if (creator !== null) {
			this.addUser(creator, true);
		}
	}

	addUser(user: ChatClient, doNotEmit: boolean = false): ChatResult {
		if (this.members.has(user.state.getId())) return ChatResult.AlreadyInRoom;

		this.members.set(user.state.getId(), new ChatRoomClientData(user, false));

		user.roomJoined(this, doNotEmit);

		return ChatResult.Ok;
	}

	removeUser(user: ChatClient): ChatResult {
		if (this.members.has(user.state.getId())) return ChatResult.NotInRoom;

		this.members.delete(user.state.getId());

		user.roomLeaved(this);

		return ChatResult.Ok;
	}

	setAdmin(userClient: ChatClient, targetClient: ChatClient, newValue: boolean): ChatResult {
		let sender: ChatRoomClientData = this.members.get(userClient.state.getId());
		let target: ChatRoomClientData = this.members.get(targetClient.state.getId());

		if (sender === undefined) return ChatResult.NotInRoom;
		if (target === undefined) return ChatResult.TargetNotInRoom;

		if (!sender.admin) return ChatResult.NotAdmin;

		target.admin = newValue;
		return ChatResult.Ok;
	}

	isAdmin(client: ChatClient): boolean {
		let data = this.members.get(client.getId());

		return data !== undefined && data.admin;
	}

	isInRoom(client: ChatClient): boolean {
		return this.members.has(client.getId());
	}

	hasPassword(): boolean {
		return this.password !== undefined;
	}

	isGoodPassword(password: string): boolean {
		return this.password === password;
	}

	setPassword(client: ChatClient, password?: string): ChatResult {
		let user: ChatRoomClientData = this.members.get(client.getId());

		if (user === undefined) return ChatResult.NotInRoom;
		if (!user.admin) return ChatResult.NotAdmin;

		this.password = password;

		return ChatResult.Ok;
	}

	sendMessage(user: ChatClient, message: string): ChatResult {
		let sender: ChatRoomClientData = this.members.get(user.state.getId());

		if (sender === undefined) {
			return ChatResult.NotInRoom;
		}

		// TODO: sendMessage: check for muting

		for (let curr of this.members.values()) {
			// TODO: sendMessage: Checking if the user is blocked
			curr.sendMessage(user, message, this.roomId);
		}

		return ChatResult.Ok;
	}

	userDisconnected(user: ChatClient) {
		this.members.delete(user.getId());
	}

	getId(): number {
		return this.roomId;
	}
}

@Injectable()
export class ChatService {
	private readonly logger: Logger = new Logger(ChatService.name);

	private clients: Map<string, ChatClient> = new Map();
	private clientsSID: Map<number, string> = new Map();
	private rooms: Map<number, ChatRoom> = new Map();
	private roomId: number = 2;

	constructor() {
		this.rooms.set(-1, new ChatRoom(-1, "General", null, false));
	}

	async registerConnection(appService: AppService, socket: Socket): Promise<boolean> {
		let client: ClientState;

		try {
			const cookie: string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
			client = await appService.getSessionDataToken(cookie);
		} catch (reason) {
			this.logger.error(`registerConnection: could not read get session data from cookie ${reason}`);
			return false;
		}

		// Second case is VERY unlikely, but we're never too sure
		if (this.clientsSID.has(client.getId()) || this.clients.has(socket.id)) {
			this.logger.error(`registerConnection: double chat opened for ${client.getId()} (${client.login})`);
			return false;
		}

		this.clientsSID.set(client.getId(), socket.id);
		let chatClient = new ChatClient(socket, client);
		this.clients.set(socket.id, chatClient);

		this.rooms.get(-1).addUser(chatClient);

		this.logger.debug(`registerConnection: user ${client.getId()} joined the chat!`);

		return true;
	}

	unregisterConnection(appService: AppService, socket: Socket) {
		if (!this.clients.has(socket.id)) {
			this.logger.warn(`unregisterConnection: no socket found for ${socket.id}`);
			return;
		}

		let client = this.clients.get(socket.id);
		let clientState = client.state;
		this.clients.delete(socket.id);
		this.clientsSID.delete(clientState.getId());

		client.disconnected();
	}

	onMessage(socket: Socket, payload: any): boolean {
		let client: ChatClient = this.checkRegistration(socket, "messageError");

		if (typeof payload.targetId !== "number" || !Number.isSafeInteger(payload.targetId)) {
			this.logger.error(`onMessage: invalid field targetId value: ${payload.targetId}`)
			socket.emit("messageError", makeError(ChatResult.InvalidValue));
			return false;
		}

		if (typeof payload.message !== "string") {
			this.logger.error(`onMessage: invalid field message type: ${typeof payload.message}`)
			socket.emit("messageError", makeError(ChatResult.InvalidValue));
			return false;
		}

		let targetId: number = payload.targetId;
		let message: string = payload.message;

		let target: MessageReceipient;

		if (targetId <= 0) {
			target = this.rooms.get(targetId);
		} else {
			target = this.clients.get(this.clientsSID.get(targetId));
		}

		if (!target) {
			this.logger.error(`onMessage: could not find receipient ${targetId}`);
			socket.emit("messageError", makeError(ChatResult.TargetNotFound));
			return false;
		}

		let result = target.sendMessage(client, message);

		if (result == ChatResult.Ok) {
			this.logger.debug(`onMessage: received message from ${client.getId()} to ${targetId}: "${message}"`);
			client.socket.emit("messageSent", { targetId: target.getId() });
		} else {
			let error = makeError(result);
			error.targetId = target.getId();

			client.socket.emit("messageError", error);
			this.logger.error(`onMessage: error while sending message from ${client.getId()} to ${target.getId()}: ${getErrorMessage(result)} (${ChatResult[result]})`);
			return false;
		}

		return true;
	}

	createRoom(socket: Socket, payload: any): boolean {
		let client: ChatClient = this.checkRegistration(socket, "createRoomError");

		let name: string;
		let type: string;
		let password: string;

		if (!payload.name
				|| typeof payload.name !== "string"
				|| payload.name === "General"
				|| payload.name.length === 0
				|| payload.name.length > 15
				|| payload.name.match(/[ .\/\\\-*]/)) {
			this.logger.error(`createRoom: wrong value for name: ${payload.name}`);
			socket.emit("createRoomError", makeError(ChatResult.InvalidValue));
			return false;
		}

		if (!payload.type || typeof payload.type !== "string") {
			this.logger.error(`createRoom: wrong value for type: ${payload.type}`);
			socket.emit("createRoomError", makeError(ChatResult.InvalidValue));
			return false;
		}

		if (payload.password !== undefined && typeof payload.password !== "string" || payload.password.length === 0) {
			this.logger.error(`createRoom: wrong value for password: ${payload.password}`);
			socket.emit("createRoomError", makeError(ChatResult.InvalidValue));
			return false;
		}

		[name, type, password] = payload;

		let startTime = Date.now();
		let roomId: number;
		let timedout = false;

		do {
			roomId = -(this.roomId);
			this.roomId = (this.roomId + 1) % Number.MAX_VALUE;
		} while (this.rooms.has(roomId) && !(timedout = (Date.now() - startTime) >= (2 /* s */ * 1000 /* ms */)));

		if (timedout) {
			this.logger.error("createRoom: could not find an available ID in reasonable time");
			socket.emit("createRoomError", makeError(ChatResult.InvalidValue));
			return false;
		}

		let room: ChatRoom = new ChatRoom(roomId, name, client, type === "private", password);
		this.rooms.set(room.getId(), room);

		if (type !== "private") {
			for (let c of this.clients.values()) {
				if (c.socket === socket) continue;

				c.socket.send("newRoom", {roomId: roomId, name: name});
			}
		}

		return true;
	}

	leaveRoom(socket: Socket, payload: any): void {
		let client: ChatClient = this.checkRegistration(socket, "leaveRoomError");
		let roomId: number;
		let room: ChatRoom;

		if (isValidRoomId(payload.roomId)) {
			this.logger.error(`leaveRoom: invalid roomId value ${payload.roomId}`);
			socket.emit("leaveRoomError", makeError(ChatResult.InvalidValue));
			return;
		}

		room = this.checkRoom(socket, roomId, "leaveRoomError");

		let result = room.removeUser(client);

		if (result !== ChatResult.Ok) {
			this.logger.error(`leaveRoom: could not leave room: ${ChatResult[result]}`);
			socket.emit("leaveRoomError", makeError(result));
			return;
		}
	}

	setRoomPassword(socket: Socket, payload: any): boolean {
		let client: ChatClient = this.checkRegistration(socket, "setRoomPasswordResult");
		let roomId: number;
		let room: ChatRoom;

		if (isValidRoomId(payload.roomId)) {
			this.logger.error(`setRoomPassword: invalid roomId value ${payload.roomId}`);
			socket.emit("setRoomPasswordResult", makeError(ChatResult.InvalidValue));
			return false;
		}

		room = this.checkRoom(socket, roomId, "setRoomPasswordResult");

		if (payload.password !== undefined
			|| typeof payload.password !== "string"
			|| (payload.password !== undefined && payload.password.length === 0)) {
			this.logger.error(`setRoomPassword: invalid password value ${payload.roomId}`);
			socket.emit("setRoomPasswordResult", makeError(ChatResult.InvalidValue));
			return false;
		}

		let result = room.setPassword(client, payload.password);

		if (result === ChatResult.Ok) {
			socket.emit("setRoomPasswordResult", {success: true});
		} else {
			this.logger.error(`setRoomPasswordResult: could not set password for room: ${ChatResult[result]}`);
			socket.emit("setRoomPasswordResult", makeError(result));
			return false;
		}

		return true;
	}

	joinRoom(socket: Socket, payload: any) {
		let client: ChatClient = this.checkRegistration(socket, "joinRoomError");
		let roomId: number;
		let room: ChatRoom;

		if (isValidRoomId(payload.roomId)) {
			this.logger.error(`joinRoomError: invalid roomId value ${payload.roomId}`);
			socket.emit("joinRoomError", makeError(ChatResult.InvalidValue));
			return;
		}

		room = this.checkRoom(socket, roomId, "joinRoomError");

		if (room.hasPassword()) {
			if (typeof payload.password !== "string") {
				this.logger.error(`joinRoomError: invalid password value ${payload.roomId}`);
				socket.emit("joinRoomError", makeError(ChatResult.PasswordRequired));
				return;
			}

			if (!room.isGoodPassword(payload.password)) {
				this.logger.error(`joinRoomError: wrong password ${payload.roomId}`);
				socket.emit("joinRoomError", makeError(ChatResult.WrongPassword));
				return;
			}
		}

		let result = room.addUser(client);

		if (result !== ChatResult.Ok) {
			socket.emit("joinRoomError", makeError(result));
		}
	}

	checkRegistration(socket: Socket, errorEvent?: string): ChatClient {
		let clientId = socket.id;
		let client: ChatClient = this.clients.get(clientId);

		if (!client && errorEvent !== undefined) {
			socket.emit(errorEvent, makeError(ChatResult.NotRegistered));

			throw `socket ${socket.id} not registered`;
		}

		return client;
	}

	checkRoom(socket: Socket, roomId: number, errorEvent?: string): ChatRoom {
		let room: ChatRoom = this.rooms.get(roomId);

		if (!room && errorEvent !== undefined) {
			socket.emit(errorEvent, makeError(ChatResult.TargetNotFound));

			throw `room ${socket.id} not found`;
		}

		return room;
	}
}

function getErrorMessage(res: ChatResult): string {
	switch (res) {
		case ChatResult.Ok: return "Noice :)";
		case ChatResult.NotRegistered: return "client not registered";
		case ChatResult.TargetNotFound: return "target not found";
		case ChatResult.InvalidValue: return "invalid value";
		case ChatResult.AlreadyInRoom: return "client already in room";
		case ChatResult.PasswordRequired: return "password required";
		case ChatResult.WrongPassword: return "wrong password";
		case ChatResult.NotInRoom: return "client not in the room";
		case ChatResult.TargetNotInRoom: return "target client not in the room";
		case ChatResult.NotAdmin: return "client not admin of the room";
		case ChatResult.Blocked: return "client blocked by target";
		default: return "unknown error";
	}
}

function makeError(error: ChatResult): any {
	return {
		error: ChatResult[error],
		message: getErrorMessage(error)
	};
}

function isValidRoomId(number: unknown, acceptGeneral: boolean = false): boolean {
	return typeof number === "number" && Number.isSafeInteger(number) && (number < 0 || (number == 0 && acceptGeneral));
}
