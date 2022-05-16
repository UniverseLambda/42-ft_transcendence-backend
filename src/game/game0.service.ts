// import { Injectable, Logger } from '@nestjs/common';
// import { Socket } from 'socket.io'
// import { AppService, ClientState } from 'src/app.service';
// import { parse } from "cookie";
// import { game } from "src/game/game.server"
// import { shape } from "src/game/game.shape"
// import { logic } from "src/game/game.logic"
//
// // import { Vector3 } from 'three';
//
// import * as THREE from 'three';
//
// export class Position { constructor(public posx : number, public posy : number, public posz : number) {}; }
// export class Players { constructor(public p1 : string, public p2 : string) {} }
// export class Scores { constructor(public p1 : number, public p2 : number) {} }
// export class Emit { constructor(public givenBall : Position, public id : number, ) { } }
//
// export class PlayersInfo {
// 	private map : number;
// 	private mod : string[];
// 	private score : number;
// 	constructor(private paddlePos : Position, private socket : Socket, private state : ClientState) {}
//
// 	public get getId() { return this.state.getId; }
// 	public get getPaddlePos() { return this.paddlePos; }
// 	public get getScores() { return this.score; }
// 	public get getMod() { return this.mod; }
// 	public get getMap() { return this.map; }
// 	public get getSocket() : Socket { return this.socket; }
//
// 	public set setPaddlePos(value : Position) { this.paddlePos = value; }
// 	public set setScores(value : number) { this.score = value; }
// 	public set setMod(value : [string]) { this.mod = value; }
// 	public set setMap(value : number) { this.map = value; }
//  }
//
// export class GameInfo {
// 	private id : string;
// 	private players : Players;
// 	private startTime : number = 0;
// 	private endTime : number = 0;
// 	private ball : Position;
// 	private difficulty : number;
// 	private gameServer : game;
// 	constructor(gameServer : game, player1 : Socket, player2 : Socket, difficulty : number, endTime : number) {
// 		this.id = player1 + player2;
// 		this.players = new Players(player1, player2);
// 		this.difficulty = difficulty;
// 		this.endTime = endTime;
// 	};
//
// 	public get Id() : string { return this.id; }
// 	public get Players() : Players { return this.players; }
// 	public get StartTime() : number { return this.startTime; }
// 	public get Chrono() : number { return Date.now() - this.startTime; }
// 	public get BallPosition() : Position { return this.ball; }
// 	public get Difficulty() : number { return this.difficulty; }
//
// 	isFinished() : boolean {
// 		if (this.startTime - Date.now() >= this.endTime)
// 			return true;
// 		return false;
// 	}
//
// 	startGame(ball : Position) {
// 		this.startTime = Date.now();
// 		// set ball position
// 	};
// 	endGame() : [string, Players, Scores] {
// 		return [this.id, this.players, this.scores];
// 	};
// }
//
// @Injectable()
// export class GameService {
// 	private clientsList : Map<string, PlayersInfo> = new Map();
// 	private clientsSIDList : Map<number, string> = new Map();
// 	private gameList : Map<string, GameInfo> = new Map();
// 	private readonly logger : Logger = new Logger(GameService.name);
//
// 	public newsocket : Socket;
//
// 	async registerClient(appService : AppService, socket : Socket) {
// 		// try {
// 		// 	var cookie : string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
// 		// 	var state = await appService.getSessionDataToken(cookie);
// 		// 	var playerInfo = new PlayersInfo(new Position(0,0,0), socket, state);
// 		// }
// 		// catch {
// 		// 	this.logger.error(`registerClient: cannot connect client ${socket.id} !`)
// 		// 	this.sendMessage(socket, 'connectionFailure', '');
// 		// 	return false;
// 		// 	// Throw error !
// 		// }
// 		// if (this.clientsList.has(socket.id)) {
// 		// 	this.logger.error(`registerClient: client ${playerInfo.getId()} already logged.`)
// 		// 	this.sendMessage(socket, 'connectionFailure', '');
// 		// 	return false;
// 		// }
// 		// this.clientsList.set(socket.id, playerInfo);
// 		// this.clientsSIDList.set(playerInfo.getId(), socket.id);
// 		this.sendMessage(socket, 'connectionSucced', '');
// 		return true;
// 	}
//
// 	sendMessage(toClient : Socket, id : string, payload : any) { toClient.emit( id, new payload );}
//
// 	unregisterClient(appService : AppService, client : Socket) {
// 		if (!this.clientsList.has(client.id)
// 			|| !this.clientsSIDList.has(this.clientsList.get(client.id).getId())) {
// 			this.logger.error(`unregisterClient: client ${client.id} is not registered.`)
// 			return false;
// 		}
// 		else if (this.gameList.has(client.id)) {
// 			this.logger.error(`unregisterClient: client ${client.id} is in game.`)
// 			return false;
// 		}
// 		this.clientsList.delete(client.id);
// 		this.clientsSIDList.delete(this.clientsList.get(client.id).getId());
// 	}
//
// 	//////////////////////////////////////////////////
// 	///////////////// GAME PHASE
// 	// Game phase : searching, starting and end game session
// 	searchGame() {
// 	}
//
// 	cancelSearchGame() {
// 	}
//
// 	startGame() {
// 		var newGame = new gameServer;
// 		newGame.update();
// 	}
//
// 	//////////////////////////////////////////////////
// 	///////////////// UPDATE INFO
// 	// Info get from clients
//
// 	// Checkand update new player state
// 	async updatePlayer(position : THREE.Vector3) : Promise<any> {
// 		Logger.log('position =', position);
// 		// Check player pos
// 		// Launch potention event
// 	}
//
// 	getPaddlePos() {
// 		// reception and transformation of the info
// 	}
//
// 	getEventPos() {
// 	}
// }
