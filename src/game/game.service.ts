import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io'
import { AppService, ClientState } from 'src/app.service';
import { parse } from "cookie";
import { game } from "src/game/game.server"
import { shape } from "src/game/game.shape"
import { logic } from "src/game/game.logic"

// import { EngineService } from "src/game/engine.service"
// import { Job, JobId } from "bull"

// import { Vector3 } from 'three';

import * as THREE from 'three';
import { cli } from 'webpack';

export class Position { constructor(public posx : number, public posy : number, public posz : number) {}; }
export class Players { constructor(public p1 : string, public p2 : string) {} }
export class Scores { constructor(public p1 : number, public p2 : number) {} }
export class Emit { constructor(public givenBall : Position, public id : number, ) { } }

export class PendingClient { constructor(public id : number, public map : string, public difficulty : number) { } }

export class Client {
	private inGame : boolean = true;
	private isReady : boolean = false;
	private gameId : number;
	constructor(private socket : Socket,
		private authentified : boolean,
		private state : ClientState,
		private map : string,
		private difficulty : number) {}

	sendMessage(id : string, payload : any) {
		this.socket.emit(id, payload);
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

	public disconnect() { this.socket.disconnect(); }
}

export class GameSession {
	private scores : Scores;
	private ballPosition : THREE.Vector3;
	private readyStatus : [p1 : boolean, p2 : boolean] = [false, false];
	private id : number;
	constructor(private player1 : Client, private player2 : Client) {
		this.id = player1.getId + player2.getId;
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
	}

	// Start Set Phase : the period between the ball throwing
	// and the next goal.
	public startSet() {
		this.player1.sendMessage('startGame', []);
		this.player2.sendMessage('startGame', []);
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
	this.name = "ExceptionUser : ";
	this.message = message;
}

export function ExceptionSocketConnection (message : string) {
	this.name = "ExceptionSocketConnection : ";
	this.message = message;
}

export function ExceptionGameSession (message : string) {
	this.name = "ExceptionSocketConnection : ";
	this.message = message;
}

@Injectable()
export class GameService {
	private readonly logger : Logger = new Logger(GameService.name);

	private clientList : Map<string, Client>;
	private clientIDList : Map<number, Client>;
	private pendingList : Map<string, Client>;
	private gameList : Map<number, GameSession>;

	private nbClient : number = 0;

	// Took either a socket.id or ClientState.id
	// Return Client class
	public findClientSocket(id : string) {
		if (!this.clientList.has(id))
			throw ExceptionUser("findUser");
		return this.clientList.get(id);
	}

	//////////////////////////////////////////////////
	///////////////// MATCHMAKING
	// Game phase : searching, starting and end game session

	async registerMatchmaking(appService : AppService, socket : Socket) {
		Logger.log(`[MATCHMAKING] New client -${socket.id}- connected.`);
		try {
			var cookie : string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
			var state = await appService.getSessionDataToken(cookie);
		}
		catch {
			this.logger.error(`registerMatchmaking: cannot connect client ${socket.id} !`)
			throw ExceptionSocketConnection('registerMatchmaking');
		}
		// If already registered, recreate it in Client List
		// and update his socket.
		var clientSession : Client;
		if (this.clientIDList.has(state.getId())) {
			clientSession = this.clientIDList.get(state.getId());
			clientSession.getSocket = socket;
			this.clientList.set(socket.id, clientSession);
		}
		else {
			clientSession = new Client(socket, true, state, '', 0);
			Logger.log(`New client -${socket.id}- is looking for a match.`);
			this.clientIDList.set(state.getId(), clientSession);
		}
		this.clientList.set(socket.id, clientSession);
		if (!socket.connected)
			throw ExceptionSocketConnection('registerFront');
		return true;
	}

	searchGame(socket : Socket, playerInfo : PendingClient) {
		if (!this.clientIDList.has(playerInfo.id))
			throw ExceptionUser('searchGame');

		var player = this.clientIDList.get(playerInfo.id);
		player.getMap = playerInfo.map;
		player.getDifficulty = playerInfo.difficulty;

		this.pendingList.forEach(element => {
			if (element.getDifficulty === player.getDifficulty) {
				this.gameFound(element, player);
				return ;
			}
		});
		this.pendingList.set(socket.id, player);
	}

	// Send the message to the player then delete it from data
	gameFound(player1 : Client, player2 : Client) {
		player1.sendMessage('found', []);
		player2.sendMessage('found', []);

		var newGame = new GameSession(player1, player2);
		this.gameList.set(newGame.getId, newGame);
		this.unregisterPending(player1.getSocket);
		this.unregisterPending(player1.getSocket);
		this.logger.log(`Players ${player1.getId} | ${player2.getId} found a game.`);
	}

	unregisterPending(client : Socket) {
		if (!this.clientList.has(client.id))
			throw ExceptionUser('unregisterPending : disconnect unregistered client');
		var clientSession = this.clientList.get(client.id);
		if (client.connected)
			client.disconnect();
		if (!clientSession.isAuthentified)
			this.clientIDList.delete(clientSession.getId);
		if (this.pendingList.has(client.id))
			this.pendingList.delete(client.id);
		this.clientList.delete(client.id);
	}
	unregisterAllPending() {
		this.pendingList.forEach(element => {
			this.clientList.delete(element.getSocket.id);
			element.disconnect();
		});
		this.pendingList.clear();
	}



	//////////////////////////////////////////////////
	///////////////// GAME PHASE
	// Game phase : searching, starting and end game session

	async registerClient(appService : AppService, socket : Socket) {
		Logger.log(`[GAME] New client -${socket.id}- connected.`);
		try {
			var cookie : string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
			var state = await appService.getSessionDataToken(cookie);
			/////////////////////////////////
			// REMOVE IT WHEN OPERATIONNAL //
			var client = new Client(socket, true, state, '', 1); // 1 is default
			/////////////////////////////////
		}
		catch {
			this.logger.error(`registerClient: cannot connect client ${socket.id} !`)
			socket.emit('connection failure', []);
			return false;
		}
			///////////////////////////////////////
			//// UNCOMMENT IT WHEN OPERATIONAL ////
			///////////////////////////////////////
		// if (!this.clientIDList.has(state.getId()))
		// 	throw ExceptionUser('Player not registered.');
		// var client = this.clientIDList.get(state.getId());
		// if (!this.gameList.has(client.getGameId))
		// 	throw ExceptionGameSession('Player is not registered to a game.');

			/////////////////////////////////
			// REMOVE IT WHEN OPERATIONNAL //
		this.nbClient++;
		this.clientIDList.set(state.getId(), client);
			/////////////////////////////////

		// Updating the socket in client list and add new socket reference to the other.
		// The matchmaking connection erased previous client connection.
		client.getSocket = socket;
		this.clientList.set(socket.id, client);
		socket.emit('connected', []);

			/////////////////////////////////
			// REMOVE IT WHEN OPERATIONNAL //
		if (this.nbClient == 2) {
			var arrayClient = this.clientList.values();
			var p1 : Client = arrayClient[0];
			var p2 : Client = arrayClient[1];
			// Create a game manually
			var newGame = new GameSession(p1, p2);
			this.gameList.set(newGame.getId, newGame);
			this.nbClient = 0;
		}
			/////////////////////////////////
		return true;
	}

	unregisterClient(client : Socket) {
		if (!this.clientList.has(client.id) || !this.clientIDList.has(this.clientList.get(client.id).getId))
			throw ExceptionUser('unregisterClient');
		// First disconnect the socket, share between lists.
		var clientData = this.clientList.get(client.id);
		if (client.connected)
			clientData.disconnect();
		if (!clientData.isAuthentified || !clientData.isInGame)
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
	}

	// Will be moved up
	getGame(socketId : string) : GameSession {
		return this.gameList.get(this.clientList.get(socketId).getGameId);
	}

	readyToStart(client : Socket) {
		var gameSession = this.getGame(client.id);

		if (gameSession.isPlayer1(client)) {
			gameSession.getReady[0] = true
			if (gameSession.getPlayer1.isInGame || gameSession.getReady[1] === true)
				this.launchGame(gameSession);
		}
		else if (!gameSession.isPlayer1(client)) {
			gameSession.getReady[1] = true
			if (gameSession.getPlayer2.isInGame || gameSession.getReady[0] === true)
				this.launchGame(gameSession);
		}
	}

	launchGame(gameSession : GameSession) {
		gameSession.launchGame();
	}

	// throwBall(client : Socket) {
	// 	if (client !== this.newsocket1)
	// 		return ;
	// 	Logger.log('ball thrown');
	// 	this.newsocket1.emit('startGame');
	// 	this.newsocket2.emit('startGame');
	// }
	throwBall(client : Socket) {
		var gameSession = this.getGame(client.id);
		gameSession.startSet();
		this.logger.log('ball thrown');
	}

	// Calculate the position at each reception of 'ballClient'.
	// Send in Job
	updateBallPosition(socket : Socket, newPosition : THREE.Vector3) {
		// Register and check if the player is registered
		if (!this.clientList.has(socket.id))
			throw ExceptionUser('user not registered.');

		var gameSession = this.getGame(socket.id);
		gameSession.getBallPosition = newPosition;
		// MAYBE REMOVE LATER
		gameSession.sendBallPosition();
	}

	// Checkand update new player state
	async updatePlayer(client : Socket, position : THREE.Vector3) {
		var gameSession = this.getGame(client.id);
		if (gameSession.isPlayer1(client))
			gameSession.getPlayer2.sendMessage('opponentPosition', position);
		else
			gameSession.getPlayer1.sendMessage('opponentPosition', position);
		Logger.log('New player position = ', position);
	}

	// TODO End game ?
	endGame(client : Socket) {
		var getGame = this.getGame(client.id);
		getGame.getPlayer1.isInGame = false;
		getGame.getPlayer2.isInGame = false;
	}
}
