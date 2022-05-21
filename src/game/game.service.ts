import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io'
import { AppService, ClientState } from 'src/app.service';
import { parse } from "cookie";
import * as path from "path";
// import { game } from "src/game/game.server"
// import { shape } from "src/game/game.shape"
// import { logic } from "src/game/game.logic"

// import { EngineService } from "src/game/engine.service"
// import { Job, JobId } from "bull"

// import { Vector3 } from 'three';

// import * as THREE from 'three';
import { Vector3 } from 'three';
// import { cli } from 'webpack';

// import { Worker } from "worker_threads";

export class Position { constructor(public posx : number, public posy : number, public posz : number) {}; }
export class Players { constructor(public p1 : string, public p2 : string) {} }
export class Scores { constructor(public p1 : number, public p2 : number) {} }
export class Emit { constructor(public givenBall : Position, public id : number, ) { } }

export class PendingClient { constructor(public id : number, public map : string, public difficulty : number) { } }

export class Client {
	private inGame : boolean = true;
	private gameId : number = 0;
	constructor(private socket : Socket,
		private authentified : boolean,
		private state : ClientState,
		private map : string,
		private difficulty : number) {}

	sendMessage(event : string, payload : any) {
		this.socket.emit(event, payload);
	}

	public get isInGame() : boolean { return this.inGame; }
	public set isInGame(status : boolean) { this.inGame = status; }

	public get isAuthentified() : boolean { return this.authentified; }

	public get getGameId() : number { return this.gameId; }
	public set getGameId(id : number) { this.gameId = id; }

	public get getSocket() : Socket { return this.socket; }
	public set getSocket(status : Socket) { this.socket = status; }

	public get getMap() : string { return this.map; }
	public set getMap(map : string) { this.map = map; }

	public get getDifficulty() : number { return this.difficulty; }
	public set getDifficulty(difficulty : number) { this.difficulty = difficulty; }

	public get getId() : number { return this.state.getId(); }

	public disconnect() {
		Logger.log(`Client ${this.socket.id} disconnected`);
		this.socket.disconnect();
	}
}

export class GameSession {
	private scores : Scores;
	private ballPosition : THREE.Vector3;
	private readyStatus : [p1 : boolean, p2 : boolean] = [false, false];
	private id : number;

	constructor(private player1 : Client, private player2 : Client) {
		this.id = player1.getId + player2.getId;
	}

	public notifyPlayers() {
		this.player1.getGameId = this.id;
		this.player2.getGameId = this.id;
	}

	public get getDifficulty() : number { return this.player1.getDifficulty; }

	public get getBallPosition() : THREE.Vector3 { return this.ballPosition; }
	public set getBallPosition(position : THREE.Vector3) { this.ballPosition = position; }

	public get getScores() : Scores { return this.scores; }
	public set getScores(newScores : Scores) { this.scores = newScores; }

	public get getPlayer1() : Client { return this.player1; }
	public get getPlayer2() : Client { return this.player2; }

	public isPlayer1(socket : Socket) : boolean { return socket.id === this.player1.getSocket.id; }

	public get getReady() : [p1 : boolean, p2 : boolean] { return this.readyStatus; }
	public set getReady(status : [p1 : boolean, p2 : boolean]) { this.readyStatus = status; }

	public get getId() : number { return this.id; }

	public launchGame() {
		this.player1.isInGame = true;
		this.player2.isInGame = true;
		this.player1.sendMessage('launch', 'player1');
		this.player2.sendMessage('launch', 'player2');
		Logger.log(`[GAME] Game session ${this.id} launched.`);
	}

	// Start Set Phase : the period between the ball throwing
	// and the next goal.
	public startSet() {
		this.player1.sendMessage('startGame', []);
		this.player2.sendMessage('startGame', []);
		Logger.log(`[GAME] Set of game session ${this.id} started!`);
	}

	public sendBallPosition() {
		//// LERP
		// let x = THREE.MathUtils.lerp(this.ballP1Pos.x, this.ballP2Pos.x, 0.5);
		// let y = THREE.MathUtils.lerp(this.ballP1Pos.y, this.ballP2Pos.y, 0.5);
		// let z = THREE.MathUtils.lerp(this.ballP1Pos.z, this.ballP2Pos.z, 0.5);
		// let ballPos = new THREE.Vector3(x, y, z);
		// this.ballP1Pos.x *= -1;
		this.player1.sendMessage('ballServer', this.ballPosition);
		this.player2.sendMessage('ballServer', this.ballPosition);
	}
}

export function ExceptionUser (message : string) {
	return {
		name: "ExceptionUser : ",
		message: message,
	}
}

export function ExceptionUserNotRegister (message : string) {
	Logger.error(`[GAME] Client is not registered.`);
	return {
		name: "ExceptionUserNotRegister : ",
		message: message,
	}
}

export function ExceptionSocketConnection (message : string) {
	return {
		name: "ExceptionSocketConnection : ",
		message: message,
	}
}

export function ExceptionGameSession (message : string) {
	return {
		name: "ExceptionGameSession : ",
		message: message,
	}
}

@Injectable()
export class GameService {
	private logger : Logger = new Logger(GameService.name);

	private worker: Worker;

	private clientList : Map<string, Client> = new Map();
	private clientIDList : Map<number, Client> = new Map();
	private pendingList : Map<string, Client> = new Map();
	private gameList : Map<number, GameSession> = new Map();
	private inviteList: Map<number, GameSession> = new Map();


	constructor() {}

	/////////////////////////////////
	// REMOVE IT WHEN OPERATIONNAL //
	// private nbClient : number = 0;
	/////////////////////////////////

	// Took either a socket.id or ClientState.id
	// Return Client class
	public findClientSocket(id : string) {
		if (!this.clientList.has(id)) {
			throw ExceptionUserNotRegister("findClientSocket");
		}
		return this.clientList.get(id);
	}

	//////////////////////////////////////////////////
	///////////////// MATCHMAKING
	// Game phase : searching, starting and end game session

	async registerMatchmaking(appService : AppService, socket : Socket) {
		this.logger.log(`[MATCHMAKING] New client -${socket.id}- connected.`);
		try {
			var cookie : string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
			var state = await appService.getSessionDataToken(cookie);
		}
		catch {
			this.logger.error(`[MATCHMAKING] Failed to authentify socket -${socket.id}-.`);
			throw ExceptionSocketConnection('registerMatchmaking');
		}
		// If already registered, recreate it in Client List
		// and update his socket.
		var clientSession : Client;
		if (this.clientIDList.has(state.getId())) {
			clientSession = this.clientIDList.get(state.getId());
			clientSession.getSocket = socket;
			this.clientList.set(socket.id, clientSession);
			this.logger.log(`[MATCHMAKING] Client -${socket.id}- reconnected.`);
		}
		else {
			clientSession = new Client(socket, true, state, '', 0);
			this.clientIDList.set(state.getId(), clientSession);
			this.logger.log(`[MATCHMAKING] New client -${socket.id}- is registered.`);
		}
		this.clientList.set(socket.id, clientSession);
		if (!socket.connected) {
			this.logger.error(`[MATCHMAKING] Socket -${socket.id}- suddenly disconnect.`);
			throw ExceptionSocketConnection('registerFront');
		}
		appService.socketConnected(state.getId());
		return true;
	}

	inviteUser(socket : Socket, payload : any) {
		if (!this.clientList.has(socket.id) || !this.clientIDList.has(payload.id)
				|| !this.clientIDList.has(payload.targetId))
			throw ExceptionUserNotRegister("inviteUser");
		this.logger.log(`[MATCHMAKING] Client -${socket.id}- invited someone...`);

		var player = this.clientIDList.get(payload.id);
		var opponent = this.clientIDList.get(payload.targetId);
		var newGame = new GameSession(player, opponent);
		var newGameTryError = new GameSession(opponent, player);

		// If the game is already registered, cancel process and return an error.
		if (this.inviteList.has(newGame.getId) || this.inviteList.has(newGameTryError.getId)
			|| this.gameList.has(newGame.getId) || this.gameList.has(newGameTryError.getId)) {
			throw ExceptionGameSession(`inviteUser : game with ID ${newGame.getId} already stored.`)
		}
		//// Alternative to game found
		// Define player informations
		player.getMap = payload.map;
		player.getDifficulty = payload.difficulty;
		newGame.notifyPlayers();
		// Notify opponent, send the login of the sender
		newGame.getPlayer2.sendMessage('recvInvite', payload.login);
		// Add game to pending invite list
		this.inviteList.set(newGame.getId, newGame);
	}

	inviteAccepted(socket : Socket) {
		if (!this.clientList.has(socket.id))
			throw ExceptionUserNotRegister("inviteAccepted");

		var player = this.clientList.get(socket.id);
		// Check if the invite list is pending
		if (!this.inviteList.has(player.getGameId))
			throw ExceptionGameSession("inviteAccepted : player not invited");
		var game = this.inviteList.get(player.getGameId);
		if (game.getPlayer2.getId !== player.getId)
			throw ExceptionGameSession("inviteAccepted : this is not his invitation!");
		this.logger.log(`[MATCHMAKING] Client -${player.getId}- accepted invitiation...`);

		// Set opponent parameters
		game.getPlayer2.getMap = game.getPlayer1.getMap;
		game.getPlayer2.getDifficulty = game.getPlayer1.getDifficulty;

		this.logger.log(`[MATCHMAKING] Players ${game.getPlayer1.getId} | ${game.getPlayer2.getId} launch duel.`);
		// Notify players that a game has been found
		game.getPlayer1.sendMessage('found', []);
		game.getPlayer2.sendMessage('found', []);
		this.gameList.set(game.getId, game);
		this.inviteList.delete(game.getId);
	}

	inviteRefused(socket : Socket) {
		if (!this.clientList.has(socket.id))
			throw ExceptionUserNotRegister("inviteAccepted");

		var player = this.clientList.get(socket.id);

		// Check if the invite list is pending
		if (!this.inviteList.has(player.getGameId))
			throw ExceptionGameSession("inviteRefused : player not invited");
		var game = this.inviteList.get(player.getGameId);
		if (game.getPlayer2.getId !== player.getId)
			throw ExceptionGameSession("inviteRefused : this is not his invitation!");
		this.logger.log(`[MATCHMAKING] Players ${player.getId} refused to play.`);

		game.getPlayer1.disconnect();
		game.getPlayer2.disconnect();
		this.inviteList.delete(game.getId);
	}

	searchGame(socket : Socket, playerInfo : PendingClient) {
		if (!this.clientList.has(socket.id) || !this.clientIDList.has(playerInfo.id))
			throw ExceptionUserNotRegister("searchGame");
		this.logger.log(`[MATCHMAKING] Client -${socket.id}- is looking for an opponent...`);

		var player = this.clientIDList.get(playerInfo.id);
		player.getMap = playerInfo.map;
		player.getDifficulty = playerInfo.difficulty;

		for (let element of this.pendingList.values()) {
			if (element.getDifficulty === player.getDifficulty) {
				this.gameFound(element, player);
				return;
			}
		}

		this.pendingList.set(socket.id, player);
		this.logger.log(`[MATCHMAKING] Client -${this.findClientSocket(socket.id).getId}- entered a pool.`);
	}

	// Send the message to the player then delete it from data
	gameFound(player1 : Client, player2 : Client) {
		this.logger.log(`[MATCHMAKING] Players ${player1.getId} | ${player2.getId} found a game.`);

		player1.sendMessage('found', []);
		player2.sendMessage('found', []);

		var newGame = new GameSession(player1, player2);
		newGame.notifyPlayers();
		this.gameList.set(newGame.getId, newGame);
	}

	unregisterPending(socket : Socket, appService : AppService) {
		if (!this.clientList.has(socket.id))
			throw ExceptionUserNotRegister("unregisterPending");
		var clientSession = this.clientList.get(socket.id);
		if (socket.connected)
			clientSession.disconnect();
		appService.socketDisconnected(clientSession.getId);
		this.logger.log(`[MATCHMAKING] Client ${this.findClientSocket(socket.id).getId} unregistered.`);
		if (!clientSession.isAuthentified)
			this.clientIDList.delete(clientSession.getId);
		if (this.pendingList.has(socket.id))
			this.pendingList.delete(socket.id);
		this.clientList.delete(socket.id);
	}
	unregisterAllPending() {
		this.pendingList.forEach(element => {
			this.clientList.delete(element.getSocket.id);
			element.disconnect();
		});
		this.pendingList.clear();
		this.logger.log(`[MATCHMAKING] Matchmaking cleared.`);
	}

	//////////////////////////////////////////////////
	///////////////// GAME PHASE
	// Game phase : searching, starting and end game session

	async registerClient(appService : AppService, socket : Socket) {
		this.logger.log(`[GAME] New client -${socket.id}- connected.`);
		try {
			var cookie : string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
			var state = await appService.getSessionDataToken(cookie);
			/////////////////////////////////
			// REMOVE IT WHEN OPERATIONNAL //
			// var client = new Client(socket, true, state, '', 1); // 1 is default
			/////////////////////////////////
		}
		catch {
			this.logger.error(`[GAME] Cannot authentify socket ${socket.id} !`)
			throw ExceptionUserNotRegister(`registerClient`);
		}
			///////////////////////////////////////
			//// UNCOMMENT IT WHEN OPERATIONAL ////
			///////////////////////////////////////
		if (!this.clientIDList.has(state.getId())) {
			this.logger.log(`[GAME] Client ${state.getId()} is not registered.`);
			throw ExceptionGameSession(`registerClient`);
		}
		var client = this.clientIDList.get(state.getId());
		if (!this.gameList.has(client.getGameId)) {
			this.logger.log(`[GAME] Client ${state.getId()} is not registered to a game.`);
			throw ExceptionGameSession(`registerClient`);
		}

		/////////////////////////////////
		// REMOVE IT WHEN OPERATIONNAL //
		// this.nbClient++;
		// this.clientIDList.set(state.getId(), client);
		/////////////////////////////////

		// Updating the socket in client list and add new socket reference to the other.
		// The matchmaking connection erased previous client connection.
		client.getSocket = socket;
		this.clientList.set(socket.id, client);

		/////////////////////////////////
		// REMOVE IT WHEN OPERATIONNAL //
		// if (this.nbClient == 2) {
		// 	var arrayClient = this.clientList.values();
		// 	var p1 : Client = arrayClient[0];
		// 	var p2 : Client = arrayClient[1];
		// 	// Create a game manually
		// 	var newGame = new GameSession(p1, p2);
		// 	this.gameList.set(newGame.getId, newGame);
		// 	this.nbClient = 0;
		// }
		/////////////////////////////////
		this.logger.log(`[GAME] Client -${socket.id}- authentified.`);
		appService.socketConnected(state.getId());
	}

	unregisterClient(client : Socket, appService : AppService) {
		if (!this.clientList.has(client.id) || !this.clientIDList.has(this.clientList.get(client.id).getId)) {
			throw ExceptionUserNotRegister(`unregisterClient`);
		}
		// First disconnect the socket, share between lists.
		var clientData = this.clientList.get(client.id);
		if (client.connected) {
			clientData.sendMessage('disconnectInGame', []);
			clientData.disconnect();
		}
		// If he was in game, send message and disconnect him
		if (this.gameList.has(clientData.getGameId)) {
			var gameSession = this.gameList.get(clientData.getGameId);
			if (gameSession.isPlayer1(client)) {
				gameSession.getPlayer1.sendMessage('disconnectInGame', []);
				gameSession.getPlayer1.disconnect();
			}
			else {
				gameSession.getPlayer2.sendMessage('disconnectInGame', []);
				gameSession.getPlayer2.disconnect();
			}
			this.gameList.delete(clientData.getGameId);
		}
		appService.socketDisconnected(clientData.getId);
		this.logger.log(`[GAME] Client -${this.clientList.get(client.id).getId}- unregistered.`);
		this.clientIDList.delete(this.clientList.get(client.id).getId);
		this.clientList.delete(client.id);
	}
	unregisterAllClient() {
		this.clientList.forEach(element => {
			if (element.getSocket.connected)
				element.disconnect();
		});
		this.clientList.clear();
		this.clientIDList.clear();
		this.gameList.clear();
		this.logger.log(`[GAME] Game sessions and client lists cleaned.`);
	}

	// Will be moved up
	getGame(socketId : string) : GameSession {
		return this.gameList.get(this.clientList.get(socketId).getGameId);
	}

	readyToStart(client : Socket, appService : AppService) {
		if (!this.clientList.has(client.id) || !this.clientIDList.has(this.clientList.get(client.id).getId)) {
			throw ExceptionUserNotRegister(`readyToStart`);
		}
		var gameSession = this.getGame(client.id);
		this.logger.log(`[GAME] Client ${this.clientList.get(client.id).getId} set as ready.`);

		if (gameSession.isPlayer1(client)) {
			gameSession.getReady[0] = true
			if (gameSession.getPlayer1.isInGame || gameSession.getReady[1] === true)
				this.launchGame(gameSession);
				appService.inGame(gameSession.getPlayer1.getId);
		}
		else if (!gameSession.isPlayer1(client)) {
			gameSession.getReady[1] = true
			if (gameSession.getPlayer2.isInGame || gameSession.getReady[0] === true)
				this.launchGame(gameSession);
				appService.inGame(gameSession.getPlayer2.getId);
		}
	}

	launchGame(gameSession : GameSession) {
		gameSession.launchGame();

		console.log(`STARTGAME: ${gameSession.getId}`);
	}

	// Socket is not checked for optimisation purpose
	throwBall(client: Socket) {
		var gameSession = this.getGame(client.id);

		console.log(`gameSesion: ${gameSession} (${gameSession.getId})`);

		gameSession.getPlayer2.sendMessage('startGame', []);
		gameSession.getPlayer1.sendMessage('startGame', []);
		this.logger.log('[GAME] ball thrown');
	}

	updatePlayer(client: Socket, position: number) {
		var gameSession = this.getGame(client.id);

		var playerIndex = (gameSession.isPlayer1(client)) ? 0 : 1;

		if (playerIndex === 0)
			gameSession.getPlayer2.sendMessage('setPlayerPos', position);
		else
			gameSession.getPlayer1.sendMessage('setPlayerPos', position);

	}

	updateBallPosition(client: Socket, position: Vector3) {
		var gameSession = this.getGame(client.id);
		var playerIndex = (gameSession.isPlayer1(client)) ? 0 : 1;
		if (playerIndex === 0){														// i'm player 1
			gameSession.getPlayer2.sendMessage('ballServerPosition', position);
		}
	}
	updatePlayersScore(client: Socket, scores:{score1:number, score2:number}) {
		var gameSession = this.getGame(client.id);
		gameSession.getPlayer1.sendMessage('updateScore', scores);
		gameSession.getPlayer2.sendMessage('updateScore', scores);
	}

	// TODO End game ?
	endGame(client : Socket, appService : AppService) {
		var getGame = this.getGame(client.id);
		getGame.getPlayer1.isInGame = false;
		getGame.getPlayer2.isInGame = false;

		//TODO END to send

		appService.gameQuitted(getGame.getPlayer1.getId);
		appService.gameQuitted(getGame.getPlayer2.getId);
	}
}
