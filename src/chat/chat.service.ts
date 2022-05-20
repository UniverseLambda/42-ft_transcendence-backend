import { Injectable, Logger } from '@nestjs/common';
import { AppService, ClientState, UserStatus } from 'src/app.service';
import { Socket } from 'socket.io';
import { parse } from "cookie";

const GENERAL_ROOM_NAME: string = "World_General";
const GENERAL_ROOM_ID: number = -1;

interface MessageReceipient {
	sendMessage(sender: ChatClient, message: string, roomId?: number): ChatResult;
	getId(): number;
}

class ChatClient implements MessageReceipient {
	public rooms: Map<number, ChatRoom> = new Map();
	private blockList: Set<number> = new Set();

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

		this.socket.emit("roomLeaved", {
			roomId: room.getId(), isPublic: !room.isPrivate()
		});
	}

	newRoom(room: ChatRoom) {
		this.socket.emit("newRoom", {roomId: room.getId(), name: room.name});
	}

	disconnected() {
		for (let room of this.rooms.values()) {
			room.userDisconnected(this);
		}
	}

	getId(): number {
		return this.state.getId();
	}

	addBlocked(target: ChatClient) {
		this.blockList.add(target.getId());
	}

	removeBlocked(target: ChatClient) {
		this.blockList.delete(target.getId());
	}

	sendMessage(sender: ChatClient, message: string, where?: number): ChatResult {
		if (where === undefined) {
			where = sender.getId();
		}

		if (this.blockList.has(sender.getId())) {
			return ChatResult.Blocked;
		}

		this.socket.emit("message", {
			senderId: sender.getId(),
			message: message,
			where: where,
			login: sender.state.profile.login
		});
		return ChatResult.Ok;
	}

	hasBlocked(client: ChatClient): boolean {
		return this.blockList.has(client.getId());
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
		return (Date.now() - this.muteStart) <= this.muteDuration;
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
	LastAdmin,
	GeneralRoom,
	NotOnline,
	InGame,
}

class ChatRoom implements MessageReceipient {
	private members: Map<number, ChatRoomClientData> = new Map();
	private adminCount: number = 0;
	private banList: Set<number> = new Set();

	constructor(public readonly roomId: number, public readonly name: string, creator: ChatClient, private roomPrivate: boolean, private password?: string) {
		if (creator !== null) {
			this.addUser(creator, true);
			this.adminCount = 1;
		}
	}

	addUser(user: ChatClient, isAdmin: boolean = false): ChatResult {
		if (this.members.has(user.state.getId())) return ChatResult.AlreadyInRoom;
		if (this.banList.has(user.state.getId())) return ChatResult.Banned;

		this.members.set(user.state.getId(), new ChatRoomClientData(user, isAdmin));

		user.roomJoined(this);

		return ChatResult.Ok;
	}

	addUserNoDispatch(user: ChatClient, isAdmin: boolean = false): ChatResult {
		if (this.members.has(user.state.getId())) return ChatResult.AlreadyInRoom;
		if (this.banList.has(user.state.getId())) return ChatResult.Banned;

		this.members.set(user.state.getId(), new ChatRoomClientData(user, isAdmin));

		user.roomJoined(this, true);

		return ChatResult.Ok;
	}

	removeUser(user: ChatClient): ChatResult {
		if (!this.members.has(user.state.getId())) return ChatResult.NotInRoom;


		let roomClient = this.members.get(user.state.getId());

		if (roomClient.admin && this.adminCount === 1) {
			return ChatResult.LastAdmin;
		}

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

		if (!newValue && this.adminCount === 1) {
			return ChatResult.LastAdmin;
		}

		target.admin = newValue;
		this.adminCount += (newValue ? 1 : -1);

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

		if (sender.isMuted()) {
			return ChatResult.Muted;
		}

		for (let curr of this.members.values()) {
			if (curr.getId() === user.getId()) continue;

			curr.sendMessage(user, message, this.roomId);
		}

		return ChatResult.Ok;
	}

	userDisconnected(user: ChatClient) {
		this.members.delete(user.getId());
	}

	banUser(client: ChatClient, target: ChatClient) {
		let user: ChatRoomClientData = this.members.get(client.getId());

		if (user === undefined) return ChatResult.NotInRoom;
		if (!user.admin) return ChatResult.NotAdmin;

		this.banList.add(target.getId());

		return ChatResult.Ok;
	}

	unbanUser(client: ChatClient, target: ChatClient) {
		let user: ChatRoomClientData = this.members.get(client.getId());

		if (user === undefined) return ChatResult.NotInRoom;
		if (!user.admin) return ChatResult.NotAdmin;

		this.banList.delete(target.getId());

		return ChatResult.Ok;
	}

	kickUser(userClient: ChatClient, targetClient: ChatClient) {
		let sender: ChatRoomClientData = this.members.get(userClient.state.getId());
		let target: ChatRoomClientData = this.members.get(targetClient.state.getId());

		if (sender === undefined) return ChatResult.NotInRoom;
		if (target === undefined) return ChatResult.TargetNotInRoom;

		if (!sender.admin) return ChatResult.NotAdmin;

		return this.removeUser(targetClient);
	}

	setMute(userClient: ChatClient, targetClient: ChatClient, duration: number) {
		let sender: ChatRoomClientData = this.members.get(userClient.state.getId());
		let target: ChatRoomClientData = this.members.get(targetClient.state.getId());

		if (sender === undefined) return ChatResult.NotInRoom;
		if (target === undefined) return ChatResult.TargetNotInRoom;

		if (!sender.admin) return ChatResult.NotAdmin;

		target.mute(duration);
		return ChatResult.Ok;
	}

	getId(): number {
		return this.roomId;
	}

	isPrivate(): boolean {
		return this.roomPrivate;
	}

	userCount(): number {
		return this.members.size;
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
		this.rooms.set(GENERAL_ROOM_ID, new ChatRoom(GENERAL_ROOM_ID, GENERAL_ROOM_NAME, null, false));
	}

	async registerConnection(appService: AppService, socket: Socket): Promise<boolean> {
		let client: ClientState;

		try {
			const cookie: string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
			client = await appService.getSessionDataToken(cookie);
			if (client === undefined) {
				this.logger.error(`registerConnection: client not authed`);
				return false;
			}
		} catch (reason) {
			this.logger.error(`registerConnection: could not read get session data from cookie (${reason})`);
			return false;
		}

		// Second case is VERY unlikely, but we're never too sure (it happened tho)
		if (this.clientsSID.has(client.getId()) || this.clients.has(socket.id)) {
			this.logger.error(`registerConnection: double chat opened for ${client.getId()} (${client.profile.login})`);
			return false;
		}

		this.clientsSID.set(client.getId(), socket.id);
		let chatClient = new ChatClient(socket, client);
		this.clients.set(socket.id, chatClient);

		this.rooms.get(-1).addUserNoDispatch(chatClient);

		this.logger.debug(`registerConnection: user ${client.getId()} (socket: ${socket.id}) joined the chat!`);

		// TODO: check for private rooms in which the user is (db)
		this.sendInitialInformation(socket, chatClient);

		appService.socketConnected(client.getId());

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

		appService.socketDisconnected(clientState.getId());

		client.disconnected();

		this.logger.debug(`unregisterConnection: user ${client.getId()} (socket: ${socket.id}) disconnected`);
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
			|| payload.name === GENERAL_ROOM_NAME
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

		if (payload.password !== undefined && typeof payload.password !== "string") {
			this.logger.error(`createRoom: wrong value for password: ${payload.password}`);
			socket.emit("createRoomError", makeError(ChatResult.InvalidValue));
			return false;
		}

		[name, type, password] = [payload.name, payload.type, payload.password];

		if (password.length === 0)
			password = undefined;

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
				if (c.getId() === client.getId()) continue;

				c.socket.emit("newRoom", {roomId: roomId, name: name});
			}
		}

		// TODO: add room to database

		return true;
	}

	leaveRoom(socket: Socket, payload: any): void {
		let client: ChatClient = this.checkRegistration(socket, "leaveRoomError");
		let room: ChatRoom;

		if (!isValidRoomId(payload.roomId)) {
			this.logger.error(`leaveRoom: invalid roomId value ${payload.roomId}`);
			socket.emit("leaveRoomError", makeError(ChatResult.InvalidValue));
			return;
		}

		if (payload.roomId === GENERAL_ROOM_ID) {
			this.logger.error(`leaveRoom: invalid roomId value ${payload.roomId}`);
			socket.emit("roomError", makeError(ChatResult.GeneralRoom, payload.roomId));
		}

		room = this.checkRoom(socket, payload.roomId, "roomError");

		let result = room.removeUser(client);

		if (result !== ChatResult.Ok) {
			this.logger.error(`leaveRoom: could not leave room: ${ChatResult[result]}`);
			socket.emit("roomError", makeError(result, payload.roomId));
			return;
		}

		// TODO: remove user from the room in database

		// Can't get here if World_General, checked before.
		if (room.userCount() === 0) {
			// TODO: remove room from database

			this.rooms.delete(room.getId());
			if (!room.isPrivate()) {
				socket.emit("roomDeleted", {roomId: room.getId(), name: room.name});
			}
		}
	}

	setRoomPassword(socket: Socket, payload: any): boolean {
		let client: ChatClient = this.checkRegistration(socket, "setRoomPasswordResult");
		let room: ChatRoom;

		if (!isValidRoomId(payload.roomId) || payload.roomId === GENERAL_ROOM_ID) {
			this.logger.error(`setRoomPassword: invalid roomId value ${payload.roomId}`);
			socket.emit("setRoomPasswordResult", makeError(ChatResult.InvalidValue));
			return false;
		}

		if (payload.roomId === GENERAL_ROOM_ID) {
			this.logger.error(`setRoomPassword: invalid roomId value ${payload.roomId}`);
			socket.emit("roomError", makeError(ChatResult.GeneralRoom, payload.roomId));
			return false;
		}

		room = this.checkRoom(socket, payload.roomId, "roomError");

		if ((payload.password !== undefined
			&& typeof payload.password !== "string")
			|| (payload.password !== undefined && payload.password.length === 0)) {
			this.logger.error(`setRoomPassword: invalid password value ${payload.password}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue, payload.roomId));
			return false;
		}

		let result = room.setPassword(client, payload.password);

		if (result === ChatResult.Ok) {
			socket.emit("roomError", {success: true});
		} else {
			this.logger.error(`roomError: could not set password for room: ${ChatResult[result]}`);
			socket.emit("roomError", makeError(result, payload.roomId));
			return false;
		}

		return true;
	}

	joinRoom(socket: Socket, payload: any) {
		let client: ChatClient = this.checkRegistration(socket, "joinRoomError");
		let room: ChatRoom;

		if (!isValidRoomId(payload.roomId) || payload.roomId === GENERAL_ROOM_ID) {
			this.logger.error(`joinRoom: invalid roomId value \`${payload.roomId}\``);
			socket.emit("joinRoomError", makeError(ChatResult.InvalidValue));
			return;
		}

		room = this.checkRoom(socket, payload.roomId, "joinRoomError");

		if (room.hasPassword()) {
			if (typeof payload.password !== "string" || payload.password.length === 0) {
				this.logger.error(`joinRoom: invalid password value \`${payload.password}\``);

				if (room.isPrivate() && payload.toFind) {
					client.newRoom(room);
				}

				socket.emit("joinRoomError", makeError(ChatResult.PasswordRequired));
				return;
			}

			// TODO: joinRoom: use DB to check password

			if (!room.isGoodPassword(payload.password)) {
				this.logger.error(`joinRoom: wrong password ${payload.roomId}`);
				socket.emit("joinRoomError", makeError(ChatResult.WrongPassword));
				return;
			}
		}

		let result = room.addUser(client);

		if (result !== ChatResult.Ok) {
			socket.emit("joinRoomError", makeError(result));
		} else {
			// TODO: joinRoom: add user to room in db
			this.logger.verbose(`joinRoom: user ${client.getId()} joined room ${payload.roomId}`);
		}
	}

	blockUser(socket: Socket, payload: any) {
		let client: ChatClient = this.checkRegistration(socket, "blockUserError");
		let target: ChatClient;

		if (!isValidUserId(payload.targetId)) {
			this.logger.error(`blockUser: invalid targetId value ${payload.targetId}`);
			socket.emit("blockUserError", makeError(ChatResult.InvalidValue));
			return;
		}

		target = this.checkUser(socket, payload.targetId, "blockUserError");

		// TODO: blockUser: add user in the block list in DB
		client.addBlocked(target);

		socket.emit("userBlocked", {id: payload.targetId});
	}

	unblockUser(socket: Socket, payload: any) {
		let client: ChatClient = this.checkRegistration(socket, "unblockUserError");
		let target: ChatClient;

		if (!isValidUserId(payload.targetId)) {
			this.logger.error(`unblockUser: invalid targetId value ${payload.roomId}`);
			socket.emit("unblockUserError", makeError(ChatResult.InvalidValue));
			return;
		}

		target = this.checkUser(socket, payload.targetId, "unblockUserError");

		client.removeBlocked(target);
		// TODO: unblockUser: remove user from the block list in DB
		socket.emit("userUnblocked", {id: payload.targetId});
	}

	setBan(socket: Socket, payload: any) {
		let client: ChatClient = this.checkRegistration(socket, "setBanError");
		let room: ChatRoom;
		let target: ChatClient;

		if (!isValidRoomId(payload.roomId) || payload.roomId === GENERAL_ROOM_ID) {
			this.logger.error(`setBan: invalid roomId value ${payload.roomId}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue));
			return;
		}

		if (!isValidUserId(payload.targetId)) {
			this.logger.error(`setBan: invalid targetId value ${payload.roomId}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue));
			return;
		}

		if (typeof payload.action !== "boolean") {
			this.logger.error(`setBan: invalid action value ${payload.targetId}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue));
			return;
		}

		room = this.checkRoom(socket, payload.roomId, "roomError");
		target = this.checkUser(socket, payload.targetId, "roomError", room.getId());

		let result: ChatResult;

		if (payload.action) {
			result = room.banUser(client, target);
		} else {
			result = room.unbanUser(client, target);
		}

		if (result === ChatResult.Ok) {
			// TODO: setBan: add/remove user from ban list in database

			socket.emit("userBanned", {roomId: payload.roomId, targetId: payload.targetId});
			this.logger.debug(`setBan: user ${target.getId()} banned from ${room.getId()} by ${client.getId()}`);
		} else {
			socket.emit("roomError", makeError(result, room.getId()));
			this.logger.error(`setBan: could not ban user ${target.getId()} from ${room.getId()} (issued by ${client.getId()}, reason: ${ChatResult[result]})`);
		}
	}

	kickUser(socket: Socket, payload: any) {
		let client: ChatClient = this.checkRegistration(socket, "roomError");
		let room: ChatRoom;
		let target: ChatClient;

		if (!isValidRoomId(payload.roomId) || payload.roomId === GENERAL_ROOM_ID) {
			this.logger.error(`kickUser: invalid roomId value ${payload.roomId}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue));
			return;
		}

		if (!isValidUserId(payload.targetId)) {
			this.logger.error(`kickUser: invalid targetId value ${payload.targetId} (typeof: ${typeof payload.targetId})`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue, payload.roomId));
			return;
		}

		room = this.checkRoom(socket, payload.roomId, "roomError");
		target = this.checkUser(socket, payload.targetId, "roomError", payload.roomId);

		let result: ChatResult = room.kickUser(client, target);

		if (result === ChatResult.Ok) {
			this.logger.debug(`kickUser: user ${payload.targetId} kicked from ${payload.roomId} by ${client.getId()})`);
			socket.emit("userKicked", {roomId: payload.roomId, targetId: payload.targetId});
			// TODO: kickUser: add/remove user from ban list in database
		} else {
			this.logger.error(`kickUser: could not kick ${payload.targetId} from ${payload.roomId} (reason: ${ChatResult[result]})`);
			socket.emit("roomError", makeError(result, payload.roomId));
		}
	}

	setMute(socket: Socket, payload: any) {
		let client: ChatClient = this.checkRegistration(socket, "setMuteError");
		let room: ChatRoom;
		let target: ChatClient;

		if (!isValidRoomId(payload.roomId) || payload.roomId === GENERAL_ROOM_ID) {
			this.logger.error(`setMute: invalid roomId value ${payload.roomId}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue));
			return;
		}

		if (!isValidUserId(payload.targetId)) {
			this.logger.error(`setMute: invalid targetId value ${payload.targetId}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue, payload.roomId));
			return;
		}


		if (typeof (payload.duration) !== "number" || !Number.isSafeInteger(payload.duration)) {
			this.logger.error(`setMute: invalid duration value ${payload.duration}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue, payload.roomId));
			return;
		}

		room = this.checkRoom(socket, payload.roomId, "setMuteError");
		target = this.checkUser(socket, payload.targetId, "setMuteError");

		let result: ChatResult = room.setMute(client, target, payload.duration);

		if (result === ChatResult.Ok) {
			this.logger.debug(`setMute: user ${target.getId()} muted on channel ${room.roomId} for ${payload.duration} seconds.`);
			socket.emit("userMuted", {roomId: payload.roomId, targetId: payload.targetId, duration: payload.duration});
		} else {
			this.logger.error(`setMute: could not mute user ${target.getId()} muted on channel ${room.roomId} for ${payload.duration} seconds (${ChatResult[result]}).`);
			socket.emit("roomError", makeError(result, payload.roomId));
		}
	}

	setAdmin(socket: Socket, payload: any) {
		let client: ChatClient = this.checkRegistration(socket, "roomError");
		let room: ChatRoom;
		let target: ChatClient;

		if (!isValidRoomId(payload.roomId) || payload.roomId === GENERAL_ROOM_ID) {
			this.logger.error(`setAdmin: invalid roomId value ${payload.roomId}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue));
			return;
		}

		if (!isValidUserId(payload.targetId)) {
			this.logger.error(`setAdmin: invalid targetId value ${payload.targetId}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue, payload.roomId));
			return;
		}

		if (typeof (payload.action) !== "boolean") {
			this.logger.error(`setAdmin: invalid duration value ${payload.roomId}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue, payload.roomId));
			return;
		}

		room = this.checkRoom(socket, payload.roomId, "roomError");
		target = this.checkUser(socket, payload.targetId, "roomError", payload.roomId);

		let result: ChatResult = room.setAdmin(client, target, payload.action);

		if (result === ChatResult.Ok) {
			// TODO: setAdmin: add/remove from admin list in DB
			socket.emit("setAdminResult", {roomId: payload.roomId, targetId: payload.targetId, action: payload.action});
		} else {
			socket.emit("roomError", makeError(result, payload.roomId));
		}
	}

	openConv(socket: Socket, payload: any) {
		let client: ChatClient = this.checkRegistration(socket, "openConvError");
		let target: ChatClient;

		if (!isValidUserId(payload.targetId)) {
			this.logger.error(`openConv: invalid targetId value ${payload.targetId}`);
			socket.emit("openConvError", makeError(ChatResult.InvalidValue));
			return;
		}

		target = this.checkUser(socket, payload.targetId, "openConvError");

		if (target.hasBlocked(client)) {
			this.logger.error(`openConv: user ${payload.targetId} has blocked ${client.getId()}`);
			socket.emit("openConvError", makeError(ChatResult.Blocked));
			return;
		}

		socket.emit("roomJoined", {roomId: target.getId(), name: target.state.profile.login});
	}

	letInvite(socket: Socket, payload: any) {
		let client: ChatClient = this.checkRegistration(socket, "letInviteError");
		let room: ChatRoom;
		let target: ChatClient;

		if (!isValidRoomId(payload.roomId) || payload.roomId === GENERAL_ROOM_ID) {
			this.logger.error(`setAdmin: invalid roomId value ${payload.roomId}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue));
			return;
		}

		if (!isValidUserId(payload.targetId)) {
			this.logger.error(`letInvite: invalid targetId value ${payload.targetId}`);
			socket.emit("roomError", makeError(ChatResult.InvalidValue, payload.roomId));
			return;
		}

		room = this.checkRoom(socket, payload.targetId, "roomError");
		target = this.checkUser(socket, payload.targetId, "roomError", payload.roomId);

		if (target.state.userStatus !== UserStatus.Online) {
			this.logger.error(`letInvite: user  ${payload.targetId} not online`);
			if (target.state.userStatus === UserStatus.InGame)
				socket.emit("roomError", makeError(ChatResult.InGame, payload.roomId));
				else
				socket.emit("roomError", makeError(ChatResult.NotOnline, payload.roomId));
		}

		payload.id = client.state.getId();
		payload.login = client.state.profile.login;

		target.socket.emit("inviteGame")
	}

	reattach(socket: Socket) {
		let client: ChatClient = this.checkRegistration(socket, "reattachError");

		this.sendInitialInformation(socket, client);
	}

	sendInitialInformation(socket: Socket, chatClient: ChatClient) {
		chatClient.roomJoined(this.rooms.get(GENERAL_ROOM_ID));

		for (let r of this.rooms.values()) {
			if (r.getId() === GENERAL_ROOM_ID) continue;

			if (r.isInRoom(chatClient)) {
				chatClient.roomJoined(r);
			} else if (!r.isPrivate()) {
				chatClient.newRoom(r);
			}
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
			socket.emit(errorEvent, makeError(ChatResult.TargetNotFound, roomId));

			throw `room ${socket.id} not found`;
		}

		return room;
	}

	checkUser(socket: Socket, userId: number, errorEvent?: string, roomId?: number): ChatClient {
		let clientSID: string = this.clientsSID.get(userId);
		let client: ChatClient = this.clients.get(clientSID);

		if (!client && errorEvent !== undefined) {
			socket.emit(errorEvent, makeError(ChatResult.TargetNotFound, roomId));

			throw `user ${userId} not found`;
		}

		return client;
	}
}

function getErrorMessage(res: ChatResult): string {
	switch (res) {
		case ChatResult.Ok:					return "Noice :)";
		case ChatResult.NotRegistered:		return "user not registered";
		case ChatResult.TargetNotFound:		return "target not found";
		case ChatResult.InvalidValue:		return "invalid value";
		case ChatResult.AlreadyInRoom:		return "user already in room";
		case ChatResult.PasswordRequired:	return "password required";
		case ChatResult.WrongPassword:		return "wrong password";
		case ChatResult.NotInRoom:			return "user not in the room";
		case ChatResult.TargetNotInRoom:	return "target user not in the room";
		case ChatResult.NotAdmin:			return "user not admin of the room";
		case ChatResult.Blocked:			return "user blocked by target";
		case ChatResult.Muted:				return "you've been muted";
		case ChatResult.Banned:				return "you've been banned from this channel";
		case ChatResult.LastAdmin:			return "you're the last admin, you cannot perform this action";
		case ChatResult.GeneralRoom:		return "could not execute command in " + GENERAL_ROOM_NAME;
		case ChatResult.NotOnline:			return "user not online";
		case ChatResult.InGame:				return "user in game";
		default: return "unknown error";
	}
}

function makeError(error: ChatResult, roomId?: number): any {
	return {
		error: ChatResult[error],
		message: getErrorMessage(error),
		targetId: roomId,
	};
}

function isValidRoomId(number: unknown): boolean {
	return typeof number === "number" && Number.isSafeInteger(number) && number < 0;
}

function isValidUserId(number: unknown): boolean {
	return typeof number === "number" && Number.isSafeInteger(number) && number > 0;
}
