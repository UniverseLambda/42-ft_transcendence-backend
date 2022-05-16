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

export class Client {
	private inGame : boolean = true;
	constructor(private socket : Socket,
		private state : ClientState) {}

	sendMessage(id : string, payload : any) {
		this.socket.emit(id, payload);
	}

	public get clientState() : number { return this.state.getId(); }

	public get isInGame() : boolean { return this.inGame; }
	public set isInGame(status : boolean) { this.inGame = status; }
}

export class GameSession {
	constructor(jobId : JobId, difficulty : number, player1 : Client, player2 : Client) {}
}

@Injectable()
export class GameService {
	private readonly logger : Logger = new Logger(GameService.name);
	constructor(private engineService : EngineService) {}

	private clientList : Map<string, Client>;
	private pendingList : Array<Client>;
	private gameList : Map<string, GameSession>;

	public newsocket1 : Socket;
	public newsocket2 : Socket;
	public clientNb : number = 0;
	public serverGame : game;
	public jobId : JobId;

	async registerClient(appService : AppService, socket : Socket) {
		++this.clientNb;
		Logger.log(`clientNb = ${this.clientNb}`);
		// try {
		// 	var cookie : string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
		// 	var state = await appService.getSessionDataToken(cookie);
		// 	var playerInfo = new PlayersInfo(new Position(0,0,0), socket, state);
		// }
		// catch {
		// 	this.logger.error(`registerClient: cannot connect client ${socket.id} !`)
		// 	this.sendMessage(socket, 'connectionFailure', '');
		// 	return false;
		// 	// Throw error !
		// }
		// if (this.clientsList.has(socket.id)) {
		// 	this.logger.error(`registerClient: client ${playerInfo.getId()} already logged.`)
		// 	this.sendMessage(socket, 'connectionFailure', '');
		// 	return false;
		// }
		// this.clientsList.set(socket.id, playerInfo);
		// this.clientsSIDList.set(playerInfo.getId(), socket.id);
		if (this.clientNb === 1) {
			this.newsocket1 = socket;
		}
		else if (this.clientNb === 2) {
			this.newsocket2 = socket;
			this.startGame();
		}
		socket.emit('connectionSucced');
		return true;
	}

	unregisterClient(appService : AppService, client : Socket) {
		return true;
	}

	//////////////////////////////////////////////////
	///////////////// GAME PHASE
	// Game phase : searching, starting and end game session
	searchGame() {
	}

	cancelSearchGame() {
	}

	startGame() {
		this.serverGame = new game(this.newsocket1, this.newsocket2);
		// TO DO : send opponent position
		this.newsocket1.emit('launch');
		this.newsocket2.emit('launch');
		this.jobId = this.engineService.startEngine();
	}

	async launchUpdate() {
		await this.serverGame.update();
		if (this.serverGame.endOfGame === true)
			this.engineService.stopEngine(this.jobId);
	}

	throwBall(client : Socket) {
		if (client !== this.newsocket1)
			return ;
		logic.startGame = true;
		Logger.log('ball thown');
	}

	//////////////////////////////////////////////////
	///////////////// UPDATE INFO
	// Info get from clients

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

	getPaddlePos() {
		// reception and transformation of the info
	}

	getEventPos() {
	}
}
