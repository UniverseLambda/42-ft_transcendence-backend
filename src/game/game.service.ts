import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io'
import { AppService, ClientState } from 'src/app.service';
import { parse } from "cookie";
import { game } from "src/game/game.server"
import { shape } from "src/game/game.shape"
import { logic } from "src/game/game.logic"

import { EngineService } from "src/game/engine.service"
import { Job, JobId } from "bull"

// import { Vector3 } from 'three';

import * as THREE from 'three';

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
		private state : ClientState,
		private map : string,
		private difficulty : number) {}

	sendMessage(id : string, payload : any) {
		this.socket.emit(id, payload);
	}

	public get isInGame() : boolean { return this.inGame; }
	public set isInGame(status : boolean) { this.inGame = status; }

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

	public get getScores() : Scores { return this.scores; }
	public set getScores(newScores : Scores) { this.scores = newScores; }

	public get getPlayer1() : Client { return this.player1; }
	public get getPlayer2() : Client { return this.player2; }

	public isPlayer1(socket : Socket) : boolean { return socket.id === this.player1.getSocket.id; }

	public get getReady() : [p1 : boolean, p2 : boolean] { return this.readyStatus; }
	public set getReady(status : [p1 : boolean, p2 : boolean]) { this.readyStatus = status; }

	public get getId() : number { return this.id; }

	public calculateBallPosition(position : THREE.Vector3) {

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

	public newsocket1 : Socket;
	public newsocket2 : Socket;
	public clientNb : number = 0;
	public serverGame : game;
	public jobId : JobId;


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
			var tmpClient = new Client(socket, state, '', 0);
		}
		catch {
			this.logger.error(`registerMatchmaking: cannot connect client ${socket.id} !`)
			socket.emit('connection failure', []);
			throw ExceptionSocketConnection('registerMatchmaking');
		}
		if (this.clientIDList.has(state.getId())) {
			this.logger.error(`registerMatchmaking: client ${state.getId()} already logged.`)
			socket.emit('connectionFailure', 'already logged');
			throw ExceptionSocketConnection('registerMatchmaking');
		}
		Logger.log(`New client -${socket.id}- is looking for a match.`);
		this.clientList.set(socket.id, tmpClient);
		this.clientIDList.set(state.getId(), tmpClient);
		this.pendingList.set(socket.id, tmpClient);
		if (!socket.connected)
			throw ExceptionSocketConnection('registerFront');
		socket.emit('connected', []);
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
		if (!this.pendingList.has(client.id) || !this.clientList.has(client.id))
			throw ExceptionUser('unregisterPending');
		client.disconnect();
		this.clientList.delete(client.id);
		this.pendingList.delete(client.id);
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
		}
		catch {
			this.logger.error(`registerClient: cannot connect client ${socket.id} !`)
			socket.emit('connection failure', []);
			return false;
		}
		if (!this.clientIDList.has(state.getId()))
			throw ExceptionUser('Player not registered or already in game.');

		var gameId = this.clientIDList.get(state.getId()).getGameId;
		if (!this.gameList.has(gameId))
			throw ExceptionGameSession('Player is not registered to a game.');

		// Updating the socket in client list and add new socket reference to the other.
		// The matchmaking connection erased previous client connection.
		this.clientIDList.get(state.getId()).getSocket = socket;
		this.clientList.set(socket.id, this.clientIDList.get(state.getId()));
		socket.emit('connected', []);
		return true;
	}

	unregisterClient(client : Socket) {
		if (!this.clientList.has(client.id) || !this.clientIDList.has(this.clientList.get(client.id).getId))
			throw ExceptionUser('unregisterClient');
		// First disconnect the socket, share between lists.
		this.clientList.get(client.id).disconnect();
		this.clientIDList.delete(this.clientList.get(client.id).getId);
		this.clientList.delete(client.id);
	}
	unregisterAllClient() {
		this.clientList.forEach(element => {
			element.disconnect();
		});
		this.clientList.clear();
		this.clientIDList.clear();
	}

	// startGame(player1 : Socket) {
	// 	this.serverGame = new game(this.newsocket1, this.newsocket2);
	// 	// TO DO : send opponent position
	// 	this.newsocket1.emit('player1');
	// 	this.newsocket2.emit('player2');
	// 	this.newsocket1.emit('launch');
	// 	this.newsocket2.emit('launch');
	// }

	// Will be moved up
	getGame(socketId : string) : GameSession {
		return this.gameList.get(this.clientList.get(socketId).getGameId);
	}

	readyToStart(client : Socket) {
		var gameSession = this.getGame(client.id);

		if (gameSession.isPlayer1(client)) {
			gameSession.getReady[0] = true
			if (gameSession.getReady[1] === true)
				this.startGame(gameSession);
		}
		else if (!gameSession.isPlayer1(client)) {
			gameSession.getReady[1] = true
			if (gameSession.getReady[0] === true)
				this.startGame(gameSession);
		}
	}

	startGame(gameSession : GameSession) {
		gameSession.getPlayer1.sendMessage('launch', 'player1');
		gameSession.getPlayer2.sendMessage('launch', 'player2');
		// launch job or let the clients do this
	}

	// throwBall(client : Socket) {
	// 	if (client !== this.newsocket1)
	// 		return ;
	// 	logic.startGame = true;
	// 	Logger.log('ball thown');
	// }

	throwBall(client : Socket) {
		var gameSession = this.getGame(client.id);
		if (gameSession.isPlayer1(client))
			//emit
	}

	updateBallPosition() {
		// let x = THREE.MathUtils.lerp(this.ballP1Pos.x, this.ballP2Pos.x, 0.5);
		// let y = THREE.MathUtils.lerp(this.ballP1Pos.y, this.ballP2Pos.y, 0.5);
		// let z = THREE.MathUtils.lerp(this.ballP1Pos.z, this.ballP2Pos.z, 0.5);
		// let ballPos = new THREE.Vector3(x, y, z);
		// this.ballP1Pos.x *= -1;
		this.newsocket1.emit('ballServer', this.ballP1Pos);
		this.newsocket2.emit('ballServer', this.ballP1Pos);
		// Logger.log('emited ball position =', this.ballP1Pos);
	}

	// Checkand update new player state
	async updatePlayer(client : Socket, position : THREE.Vector3) {
		if (client.id === this.newsocket1.id)
			this.newsocket2.emit('opponentPosition', this.serverGame.player1Position);
		else if (client.id === this.newsocket2.id)
			this.newsocket1.emit('opponentPosition', this.serverGame.player2Position);
		Logger.log('position =', position);
		// Check player pos
		// Launch potention event
	}

	endGame() {
	}
}
