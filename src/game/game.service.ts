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
export class Scores { constructor(public score1 : number, public score2 : number) {} }
export class Emit { constructor(public givenBall : Position, public id : number, ) {} }

export class PendingClient { constructor(public id : number, public map : number, public diff : number) { } }

export class Client {
	private inGame : boolean = true;
	private gameId : number = 0;
	private spectate : boolean = false;
	constructor(private socket : Socket,
		private authentified : boolean,
		private state : ClientState,
		private map : number,
		private difficulty : number) {}

	sendMessage(event : string, payload : any) {
		this.socket.emit(event, payload);
	}

	public get isInGame() : boolean { return this.inGame; }
	public set isInGame(status : boolean) { this.inGame = status; }

	public get isSpectate() : boolean { return this.spectate; }
	public set isSpectate(status : boolean) { this.spectate = status; }

	public get isAuthentified() : boolean { return this.authentified; }

	public get getGameId() : number { return this.gameId; }
	public set getGameId(id : number) { this.gameId = id; }

	public get getSocket() : Socket { return this.socket; }
	public set getSocket(status : Socket) { this.socket = status; }

	public get getMap() : number { return this.map; }
	public set getMap(map : number) { this.map = map; }

	public get getDifficulty() : number { return this.difficulty; }
	public set getDifficulty(difficulty : number) { this.difficulty = difficulty; }

	public get getId() : number { return this.state.getId(); }

	public disconnect() {
		Logger.log(`Client ${this.socket.id} disconnected`);
		this.socket.disconnect();
	}
}

export class GameSession {
	private scores : Scores = {score1:0, score2:0};
	private ballPosition : Vector3 = new Vector3(0,0,0);
	private readyStatus : [p1 : boolean, p2 : boolean] = [false, false];
	private id : number = 0;
	private spectateList : Map<string, Client> = new Map();

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

	public get getSpactateNumber() : number { return this.spectateList.size; }

	public get getId() : number { return this.id; }

	public launchGame() {
		this.player1.isInGame = true;
		this.player2.isInGame = true;
		this.player1.sendMessage('launch', {
			player:'player1',
			map:this.player1.getMap,
			difficulty:this.player1.getDifficulty
		});
		this.player2.sendMessage('launch', {
			player:'player2',
			map:this.player2.getMap,
			difficulty:this.player2.getDifficulty
		});
		Logger.log(`[GAME] Game session ${this.id} launched.`);
	}

	// Start Set Phase : the period between the ball throwing
	// and the next goal.
	public startSet() {
		this.player1.sendMessage('startGame', []);
		this.player2.sendMessage('startGame', []);
		Logger.log(`[GAME] Set of game session ${this.id} started!`);
	}

	public addSpectate(socketId : string, client : Client) {
		if (this.spectateList.has(socketId))
			throw ExceptionGameSession('addSpectate : Spectate already present.');
		client.getMap = this.getPlayer1.getMap;
		client.getDifficulty = this.getPlayer1.getDifficulty;
		client.isSpectate = true;
		client.getGameId = this.id;
		this.spectateList.set(socketId, client);
	}

	public launchSpectate(socketId : string) {
		if (!this.spectateList.has(socketId))
			throw ExceptionGameSession('addSpectate : Spectate already present.');
		var client = this.spectateList.get(socketId);
		client.sendMessage('launch', {
			player:'spectate',
			map:client.getMap,
			difficulty:client.getDifficulty
		});
	}

	public removeSpectate(socketId : string) {
		if (this.spectateList.has(socketId)) {
			var clientSession = this.spectateList.get(socketId);
			clientSession.isSpectate = false;
			clientSession.getGameId = 0;
			clientSession.sendMessage('disconnectSpectate', []);
			clientSession.disconnect();
			this.spectateList.delete(socketId);
		}
	}

	public cleanSpectate() {
		this.spectateList.forEach(element => {
			element.isSpectate = false;
			element.getGameId = 0;
			element.sendMessage('disconnectInGame', []);
			element.disconnect();
		})
		this.spectateList.clear();
	}

	public sendBallPosition(position : Vector3) {
		this.player2.sendMessage('ballServerPosition', position);
		this.spectateList.forEach(element => {
			element.sendMessage('ballServerPosition', position);
		});
	}

	public sendPlayerPosition(socketId : Socket, position : number) {
		if (this.isPlayer1(socketId)) {
			this.player2.sendMessage('setPlayerPos', position)
			this.spectateList.forEach(element => {
				element.sendMessage('paddlePosition', {player:"player1", playerPosition:position} );
			});
		}
		else {
			this.player1.sendMessage('setPlayerPos', position)
			this.spectateList.forEach(element => {
				element.sendMessage('paddlePosition', {player:"player2", playerPosition:position} );
			});
		}
	}

	public sendPlayerScore(socketId : Socket, scores : Scores) {
		this.player1.sendMessage('updateScore', scores);
		this.player2.sendMessage('updateScore', scores);
		this.spectateList.forEach(element => {
			element.sendMessage('updateScore', scores);
		});
	}
}

export function ExceptionUser (message : string) {
	return {
		name: "ExceptionUser : ",
		message: message,
	}
}

export function ExceptionUserNotRegister (message : string) {
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
			clientSession = new Client(socket, true, state, 0, 0);
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

		game.getPlayer1.sendMessage('disconnectInMatchmaking', []);
		game.getPlayer2.sendMessage('disconnectInMatchmaking', []);
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
		player.getDifficulty = playerInfo.diff;

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
		if (socket.connected) {
			clientSession.sendMessage("disconnectInMatchmaking", []);
			clientSession.disconnect();
		}
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
		if (this.gameList.has(clientData.getGameId) && !clientData.isSpectate) {
			this.endGame(client, appService);
		}
		if (client.connected) {
			clientData.sendMessage('disconnectInGame', []);
			clientData.disconnect();
		}
		// If he was in game, send message and disconnect him
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

	searchToSpectate(client : Socket, id : number) {
		if (!this.clientList.has(client.id) || !this.clientIDList.has(this.clientList.get(client.id).getId)
				|| !this.clientIDList.has(id)) {
			throw ExceptionUserNotRegister(`searchSpectate`);
		}
		var clientToSpectate = this.clientIDList.get(id);
		if (!clientToSpectate.isInGame || !this.gameList.has(clientToSpectate.getGameId))
			throw ExceptionGameSession(`searchSpectate : player to spectate is not in game.`);

		var gameToSpectate = this.gameList.get(clientToSpectate.getGameId);
		gameToSpectate.addSpectate(client.id, clientToSpectate);
	}

	readyToSpectate(client: Socket, appService : AppService) {
		if (!this.clientList.has(client.id) || !this.clientIDList.has(this.clientList.get(client.id).getId))
			throw ExceptionUserNotRegister(`readySpectate`);
		var clientToSpectate = this.clientList.get(client.id);
		if (!clientToSpectate.isSpectate)
			return false;
		appService.inGame(clientToSpectate.getGameId);
		var gameToSpectate = this.gameList.get(clientToSpectate.getGameId);
		gameToSpectate.launchSpectate(client.id);
		return true;
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

		if (gameSession.isPlayer1(client))
			gameSession.getReady[0] = true;
		else
			gameSession.getReady[1] = true;
		if (gameSession.getReady[0] === true && gameSession.getReady[1] === true) {
				this.launchGame(gameSession);
				appService.inGame(gameSession.getPlayer1.getId);
				appService.inGame(gameSession.getPlayer2.getId);
		}
	}

	launchGame(gameSession : GameSession) {
		gameSession.launchGame();
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
		gameSession.sendPlayerPosition(client, position);
	}

	updateBallPosition(client: Socket, position: Vector3) {
		var gameSession = this.getGame(client.id);
		gameSession.sendBallPosition(position);
	}

	updatePlayersScore(client: Socket, scores : Scores) {
		var gameSession = this.getGame(client.id);
		gameSession.getScores = scores;
		gameSession.sendPlayerScore(client, scores);
	}

	// TODO End game ?
	endGame(client : Socket,  appService : AppService) {
		var getGame = this.getGame(client.id);
		var players = {p1 : getGame.getPlayer1.getId, p2 : getGame.getPlayer2.getId};

		if (getGame.getPlayer1.getSocket.disconnected || getGame.getScores.score1 < getGame.getScores.score2) {
			// appService.gameEnded(players , getGame.getPlayer2.getId, getGame.getScores);
		}
		else if (getGame.getPlayer2.getSocket.disconnected || getGame.getScores.score1 > getGame.getScores.score2) {
			// appService.gameEnded(players , getGame.getPlayer1.getId, getGame.getScores);
		}

		getGame.getPlayer1.sendMessage('disconnectInGame', []);
		getGame.getPlayer2.sendMessage('disconnectInGame', []);
		getGame.getPlayer1.disconnect();
		getGame.getPlayer2.disconnect();
		getGame.getPlayer1.isInGame = false;
		getGame.getPlayer2.isInGame = false;
		getGame.cleanSpectate();
		appService.gameQuitted(getGame.getPlayer1.getId);
		appService.gameQuitted(getGame.getPlayer2.getId);
		this.gameList.delete(getGame.getId);
	}
}
