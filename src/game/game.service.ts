import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io'
import { AppService, ClientState } from 'src/app.service';
import { parse } from "cookie";
import { Vector3 } from 'three';


export class Position { constructor(public posx : number, public posy : number, public posz : number) {}; }
export class Players { constructor(public p1 : string, public p2 : string) {} }
export class Scores { constructor(public score1 : number, public score2 : number) {} }
export class Results { constructor(public win : boolean, public score1 : number, public score2 : number) {} }
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

	public resetGameReferences() {
		this.gameId = 0;
		this.inGame = false;
		this.spectate = false;
	}

	public resetPreferences() {
		this.map = 0;
		this.difficulty = 0;
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
	private spectateList : Map<number, Client> = new Map();
	private setStarted : boolean;

	constructor(private player1 : Client, private player2 : Client) {
		this.id = player1.getId + player2.getId;
	}

	public get getDifficulty() : number { return this.player1.getDifficulty; }

	public get getBallPosition() : THREE.Vector3 { return this.ballPosition; }
	public set getBallPosition(position : THREE.Vector3) { this.ballPosition = position; }

	public player1Scored() { ++this.scores.score1; }
	public player2Scored() { ++this.scores.score2; }

	public setStart() {this.setStarted = true;}
	public setEnd() {this.setStarted = false;}
	public get setStatus() : boolean { return this.setStarted; }

	public get getScores() : Scores { return this.scores; }
	public set getScores(newScores : Scores) { this.scores = newScores; }

	public getResults(isWinner : boolean) : Results { return new Results(isWinner, this.scores.score1, this.scores.score2); }

	public get getPlayer1() : Client { return this.player1; }
	public get getPlayer2() : Client { return this.player2; }

	public isPlayer1(socket : Socket) : boolean { return socket.id === this.player1.getSocket.id; }

	public get getReady() : [p1 : boolean, p2 : boolean] { return this.readyStatus; }
	public set getReady(status : [p1 : boolean, p2 : boolean]) { this.readyStatus = status; }

	public get getSpactateNumber() : number { return this.spectateList.size; }

	public get getId() : number { return this.id; }

	public notifyPlayers() {
		this.player1.getGameId = this.id;
		this.player2.getGameId = this.id;
	}

	// Reset the gameId of players
	public resetPlayersReferences() {
		this.player1.resetGameReferences();
		this.player2.resetGameReferences();
	}

	// Reset the matchmaking preferences
	public resetPlayersParameters() {
		this.player1.resetPreferences();
		this.player2.resetPreferences();
	}

	// Reset all clients' parameters and relations
	// with the game configuration.
	public resetPlayers() {
		this.resetPlayersReferences();
		this.resetPlayersParameters();
	}

	public resetGame() {
		this.scores = {score1:0, score2:0};
		this.ballPosition = new Vector3(0,0,0);
		this.readyStatus = [false,false];
		this.cleanSpectate();
		this.resetPlayers();
		this.id = 0;
	}

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

	public addSpectate(client : Client) {
		if (this.spectateList.has(client.getId))
			throw ExceptionGameSession('addSpectate : Spectate already present.');
		client.getMap = this.getPlayer1.getMap;
		client.getDifficulty = this.getPlayer1.getDifficulty;
		client.isSpectate = true;
		client.getGameId = this.id;
		this.spectateList.set(client.getId, client);
	}

	public launchSpectate(client : Client) {
		if (!this.spectateList.has(client.getId))
			throw ExceptionGameSession('launchSpectate : spectate not added to the list.');
		client.sendMessage('launch', {
			player:'spectate',
			map:client.getMap,
			difficulty:client.getDifficulty
		});
	}

	public removeSpectate(clientSession : Client) {
		if (this.spectateList.has(clientSession.getId)) {
			clientSession.isSpectate = false;
			clientSession.getGameId = 0;
			if (clientSession.getSocket.connected){
				clientSession.sendMessage('disconnectInGame', this.getResults(false));
				clientSession.disconnect();
			}
			this.spectateList.delete(clientSession.getId);
		}
	}

	public cleanSpectate() {
		this.spectateList.forEach(element => {
			element.isSpectate = false;
			element.getGameId = 0;
			if (element.getSocket.connected){
				element.sendMessage('disconnectInGame', this.getResults(false));
				element.disconnect();
			}
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

	public sendPlayerScore() {
		this.player1.sendMessage('updateScore', this.scores);
		this.player2.sendMessage('updateScore', this.scores);
		this.spectateList.forEach(element => {
			element.sendMessage('updateScore', this.scores);
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

	private clientList : Map<string, Client> = new Map();
	private clientIDList : Map<number, Client> = new Map();
	private pendingList : Map<string, Client> = new Map();
	private gameList : Map<number, GameSession> = new Map();
	private inviteList: Map<number, GameSession> = new Map();

	constructor() {}

	// Took either a socket.id or ClientState.id
	// Return Client class
	public findClientSocket(id : string) {
		if (!this.clientList.has(id)) {
			throw ExceptionUserNotRegister("findClientSocket");
		}
		return this.clientList.get(id);
	}

	public clientCheck(socket : Socket, throwArgument : string) : Client {
		if (!this.clientList.has(socket.id))
			throw ExceptionUserNotRegister(throwArgument);
		var clientSession = this.clientList.get(socket.id);
		if (!this.clientIDList.has(clientSession.getId) || !clientSession.isAuthentified)
			throw ExceptionUserNotRegister(throwArgument);
		return clientSession;
	}

	//////////////////////////////////////////////////
	///////////////// MATCHMAKING
	// Game phase : searching, starting and end game session
	async registerMatchmaking(appService : AppService, socket : Socket) {
		this.logger.log(`[MATCHMAKING] New client -${socket.id}- connected.`);
		try {
			var cookie : string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
			this.logger.warn(`COOKIE IS : ${cookie}`);
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

	unregisterPending(socket : Socket, appService : AppService) {
		// Manual checking if the client is registered
		// to clean up data when the client disconnect himself.
		if (!this.clientList.has(socket.id))
			throw ExceptionUserNotRegister("unregisterPending");
		var clientSession = this.clientList.get(socket.id);
		if (!this.clientIDList.has(clientSession.getId) || !clientSession.isAuthentified) {
			this.clientList.delete(clientSession.getSocket.id);
			this.clientIDList.delete(clientSession.getId);
			throw ExceptionUserNotRegister("unregisterPending : not registered or not authentified.");
		}

		// Simple check if the function is call elsewhere than in `handleDisconnect()`
		// from `matchmaking.gateway.ts`.
		// Update the socket number of the Server one time.
		if (socket.connected) {
			appService.socketDisconnected(clientSession.getId);
			clientSession.sendMessage("disconnectInMatchmaking", []);
			clientSession.disconnect();
		}
		else
			appService.socketDisconnected(clientSession.getId);

		// Unregister from the pending list if disconnection happened
		// while he was in searchGame phase.
		if (this.pendingList.has(socket.id))
			this.pendingList.delete(socket.id);
		// Erase him if he's not registered to a match
		// Do not erase him if his going to play a match
		if (clientSession.getGameId === 0) {
			this.logger.log(`[MATCHMAKING] client -${socket.id}- has no game : data erased.`);
			this.clientIDList.delete(clientSession.getId);
		}
		this.logger.log(`[MATCHMAKING] Client ${this.findClientSocket(socket.id).getId} unregistered.`);
		// Clean his entry.
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

	inviteUser(socket : Socket, payload : any) {
		var player : Client = this.clientCheck(socket, "inviteUser");
		if (!this.clientIDList.has(payload.targetId))
			throw ExceptionUserNotRegister("inviteUser");
		var opponent = this.clientIDList.get(payload.targetId);
		if (opponent === undefined)
			throw ExceptionUserNotRegister("inviteUser");
		this.clientCheck(opponent.getSocket, "inviteUser : opponent not properly registered.");

		this.logger.log(`[MATCHMAKING] Client -${socket.id}- invited someone...`);

		var newGame = new GameSession(player, opponent);
		// If the game is already registered, cancel process and return an error.
		if (this.inviteList.has(newGame.getId)) {
			throw ExceptionGameSession(`inviteUser : game with ID ${newGame.getId} already stored.`)
		}
		if (this.gameList.has(newGame.getId)) {
			throw ExceptionGameSession(`inviteUser : game with ID ${newGame.getId} already launched.`)
		}
		//// Alternative to game found
		// Define player1 informations
		player.getMap = payload.map;
		player.getDifficulty = payload.difficulty;
		newGame.notifyPlayers();
		// Notify opponent, send the login of the sender
		newGame.getPlayer2.sendMessage('recvInvite', payload.login);
		// Add game to pending invite list
		this.inviteList.set(newGame.getId, newGame);
	}

	inviteAccepted(socket : Socket) {
		var player : Client = this.clientCheck(socket, "inviteAccepted");

		// Check if the invite list is pending
		if (!this.inviteList.has(player.getGameId))
			throw ExceptionGameSession("inviteAccepted : player not invited");
		var game = this.inviteList.get(player.getGameId);
		if (game.getPlayer2.getId !== player.getId)
			throw ExceptionGameSession("inviteAccepted : this is not his invitation!");
		this.logger.log(`[MATCHMAKING] Client -${player.getId}- accepted invitiation...`);

		// Set opponent parameters.
		// The GameId of the opponent has already been set in `inviteUser()`.
		game.getPlayer2.getMap = game.getPlayer1.getMap;
		game.getPlayer2.getDifficulty = game.getPlayer1.getDifficulty;
		game.getPlayer2.getGameId = game.getId;

		this.logger.log(`[MATCHMAKING] Players ${game.getPlayer1.getId} | ${game.getPlayer2.getId} launch duel.`);
		// Notify players that a game has been found
		game.notifyPlayers();
		game.getPlayer1.sendMessage('found', []);
		game.getPlayer2.sendMessage('found', []);
		this.gameList.set(game.getId, game);
		this.inviteList.delete(game.getId);
	}

	inviteRefused(socket : Socket) {
		var player : Client = this.clientCheck(socket, "inviteRefused");

		// Check if the invite list is pending
		if (player.getGameId === 0 || !this.inviteList.has(player.getGameId))
			throw ExceptionGameSession("inviteRefused : player not invited");
		var game = this.inviteList.get(player.getGameId);
		if (game.getPlayer2.getId !== player.getId)
			throw ExceptionGameSession("inviteRefused : this is not his invitation!");
		this.logger.log(`[MATCHMAKING] Players ${player.getId} refused to play.`);

		this.inviteList.delete(game.getId);
		game.resetGame();
	}

	searchGame(socket : Socket, playerInfo : PendingClient) {
		var player : Client = this.clientCheck(socket, "searchGame : client not properly registered.");
		// Additionnal check to see if the playerInfo received
		// concerns this client.
		if (player.getId !== playerInfo.id)
			throw ExceptionUser(`searchGame : Information sent does not refere to client ${player.getId}.`);
		this.logger.log(`[MATCHMAKING] Client -${socket.id}- is looking for an opponent...`);
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

	cancelSearchGame(socket : Socket) {
		this.logger.log(`[MATCHMAKING] Client -${socket.id}- cancel searching.`);
		// Basic check : don't go any further if not registered
		if (!this.clientList.has(socket.id))
			throw ExceptionUserNotRegister("searchGame");
		var client = this.clientList.get(socket.id);
		// Basic check : don't go any further if not registered
		if (!this.clientIDList.has(client.getId))
			throw ExceptionUserNotRegister("searchGame");
		// Throw if the client didn't send "search" before
		if (!this.pendingList.has(socket.id))
			throw ExceptionUser(`searchGame : user ${client.getId}.`);

		// Erase him from the pending list.
		// DO NOT deconnect him.
		this.pendingList.delete(socket.id);
		this.logger.log(`[MATCHMAKING] Client -${client.getId}- leaved the pool.`);
		client.resetPreferences();
		client.resetGameReferences();
	}

	// Send the message to the player then disconnect him.
	// Disconnection will delete him from the pending list.
	gameFound(player1 : Client, player2 : Client) {
		this.logger.log(`[MATCHMAKING] Players ${player1.getId} | ${player2.getId} found a game.`);

		player1.sendMessage('found', []);
		player2.sendMessage('found', []);

		var newGame = new GameSession(player1, player2);
		// Necessary to notify : otherwise the user will be totally erase from
		// the client list and will not be found to play his match.
		newGame.notifyPlayers();
		this.gameList.set(newGame.getId, newGame);
	}

	//////////////////////////////////////////////////
	///////////////// GAME PHASE
	// Game phase : searching, starting and end game session

	async registerClient(appService : AppService, socket : Socket) {
		this.logger.log(`[GAME] New client -${socket.id}- connected.`);
		try {
			this.logger.warn(`registerClient: ${socket.handshake.headers.cookie}`);
			var cookie : string = parse(socket.handshake.headers.cookie)[appService.getSessionCookieName()];
			this.logger.warn(`COOKIE IS : ${cookie}`);
			var state = await appService.getSessionDataToken(cookie);
			// Updating the socket in client list and add new socket reference to the other.
			// The matchmaking connection erased previous client connection.
			// TODO : Check if it not break with the promise.
		}
		catch (reason) {
			this.logger.error(`[GAME] Cannot authentify socket ${socket.id} ! (reason: ${reason})`);
			throw ExceptionUserNotRegister(`registerClient`);
		}
		// Check if the client was registered before enterring the `/game` route.
		if (!this.clientIDList.has(state.getId())) {
			this.logger.log(`[GAME] Client ${socket.id} is not registered.`);
			throw ExceptionGameSession(`registerClient`);
		}
		var client = this.clientIDList.get(state.getId());
		// Check if he is registered to a game.
		if (!this.gameList.has(client.getGameId)) {
			this.logger.log(`[GAME] Client ${socket.id} is not registered to a game.`);
			throw ExceptionGameSession(`registerClient`);
		}
		appService.socketConnected(state.getId());
		client.getSocket = socket;
		this.clientList.set(socket.id, client);
		this.logger.log(`[GAME] Client -${socket.id}- authentified.`);
	}

	unregisterClient(client : Socket, appService : AppService) {
		// Delete Client even if it's missing in the other database
		if (!this.clientList.has(client.id)) {
			throw ExceptionUserNotRegister(`unregisterClient`);
		}
		var clientData = this.clientList.get(client.id);
		// Clean data if something is wrong
		if (!this.clientIDList.has(clientData.getId) || !clientData.isAuthentified || clientData.getGameId === 0) {
			if (this.clientIDList.has(clientData.getId))
				this.clientList.delete(client.id);
			throw ExceptionUserNotRegister(`unregisterClient : not properly registered or authentify.`);
		}
		// End the game or the spectate situation.
		if (this.gameList.has(clientData.getGameId) && !clientData.isSpectate)
			this.endGame(client, appService);
		else if (this.gameList.has(clientData.getGameId) && clientData.isSpectate)
			this.gameList.get(clientData.getGameId).removeSpectate(clientData);

		this.clientIDList.delete(clientData.getId);

		// Notify disconnection to the AppService checker
		appService.socketDisconnected(clientData.getId);
		// If he was in game, send message and disconnect him
		this.logger.log(`[GAME] Client -${this.clientList.get(client.id).getId}- unregistered.`);
		// Finish cleaning.
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

	///////////////////////////////////////////////////////
	///////////////// SPECTATE MODE
	//
	searchToSpectate(client : Socket, id : number) {
		var spectator : Client = this.clientCheck(client, `searchToSpectate : spectator client ${client.id}
			is not properly registered.`);
		// Checks if all crosses are checked with the client to spectate.
		var clientToSpectate : Client = this.clientCheck(this.clientIDList.get(id).getSocket,
			"searchToSpectate : Client to spectate is not registered");

		if (!clientToSpectate.isInGame || !this.gameList.has(clientToSpectate.getGameId))
			throw ExceptionGameSession(`searchToSpectate : player to spectate is not in game.`);

		this.logger.log(`[MATCHMAKING] Spectate found for ${client.id} on game launched by ${id}.`);

		var gameToSpectate = this.gameList.get(clientToSpectate.getGameId);
		gameToSpectate.addSpectate(spectator);
		spectator.sendMessage('found', []);
	}

	readyToSpectate(client: Socket, appService : AppService) {
		var spectator = this.clientCheck(client, `readySpectate : spectator ${client.id} not properly identified.`)
		if (!spectator.isSpectate) {
			return false;
		}
		appService.inGame(spectator.getGameId);
		var gameToSpectate = this.gameList.get(spectator.getGameId);
		this.logger.log(`[MATCHMAKING] Spectator ${client.id} ready to spectate game ${gameToSpectate.getId}.`);
		gameToSpectate.launchSpectate(spectator);
		return true;
	}
// TODO///////////////////////////

	///////////////////////////////////////////////////////

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
	throwBall(socket: Socket) {
		var client = this.clientCheck(socket,`throwBall : client not properly registered.`);
		if (!client.isInGame || !this.gameList.has(client.getGameId))
			throw ExceptionGameSession('throwBall : player not in game, or game not registered.');
		var gameSession = this.getGame(socket.id);
		if (!gameSession.isPlayer1(socket) || client.isSpectate || gameSession.setStatus)
			return ;
		gameSession.setStart();
		gameSession.getPlayer1.sendMessage('startGame', []);
		gameSession.getPlayer2.sendMessage('startGame', []);
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

	updatePlayersScore(client: Socket, player:string, appService : AppService) {
		var gameSession = this.getGame(client.id);
		gameSession.setEnd();
		if (player === 'player1') {
			this.logger.log('[GAME] Player 1 scored');
			gameSession.player1Scored();
		}
		else if (player === 'player2') {
			this.logger.log('[GAME] Player 2 scored');
			gameSession.player2Scored();
		}
		gameSession.sendPlayerScore();
		var savedScore = gameSession.getScores;
		this.logger.log(`Score : `, savedScore);
		if (savedScore.score1 >= 11 || savedScore.score2 >= 11)
			this.endGame(client, appService);
	}

	endGame(client : Socket,  appService : AppService) {
		if (!this.clientList.has(client.id)) {
			this.logger.error("endgame : client not registered.");
			return;
		}
		var clientSession = this.clientList.get(client.id);
		if (!this.clientIDList.has(clientSession.getId) || !clientSession.isAuthentified){
			this.logger.error("endgame : client not registered or authentified.");
			return;
		}
		if (!this.gameList.has(this.clientList.get(client.id).getGameId)) {
			this.logger.log("endgame : Game not listed.");
			return ;
		}
		var getGame = this.gameList.get(clientSession.getGameId);

		var players = {p1 : getGame.getPlayer1.getId, p2 : getGame.getPlayer2.getId};

		// If one of the players brutaly disconnect
		if (getGame.getPlayer1.getSocket.disconnected) {
			getGame.getPlayer2.sendMessage('disconnectInGame', getGame.getResults(true));
			appService.gameEnded(players , getGame.getPlayer2.getId, getGame.getScores);
		}
		else if (getGame.getPlayer2.getSocket.disconnected) {
			getGame.getPlayer1.sendMessage('disconnectInGame', getGame.getResults(true));
			appService.gameEnded(players , getGame.getPlayer1.getId, getGame.getScores);
		}
		// If the game ended properly
		else if (getGame.getScores.score1 < getGame.getScores.score2) {
			getGame.getPlayer1.sendMessage('disconnectInGame', getGame.getResults(false));
			getGame.getPlayer2.sendMessage('disconnectInGame', getGame.getResults(true));
			appService.gameEnded(players , getGame.getPlayer2.getId, getGame.getScores);
		}
		else if (getGame.getScores.score1 > getGame.getScores.score2) {
			getGame.getPlayer1.sendMessage('disconnectInGame', getGame.getResults(true));
			getGame.getPlayer2.sendMessage('disconnectInGame', getGame.getResults(false));
			appService.gameEnded(players , getGame.getPlayer1.getId, getGame.getScores);
		}

		this.logger.log(`[GAME] End of game reached : ${getGame.getPlayer1.getId}, ${getGame.getPlayer2.getId}`);
		appService.gameQuitted(getGame.getPlayer1.getId);
		appService.gameQuitted(getGame.getPlayer2.getId);
		this.logger.log('[GAME] Game deleted.');

		// Cleaning all game with the same ID
		this.gameList.delete(getGame.getId);
		this.inviteList.delete(getGame.getId);

		getGame.resetGame();

		if (getGame.getPlayer1.getSocket.connected) {
			getGame.getPlayer1.disconnect();
		}
		if (getGame.getPlayer2.getSocket.connected) {
			getGame.getPlayer2.disconnect();
		}
	}
}
