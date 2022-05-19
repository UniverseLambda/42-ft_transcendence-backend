
import { parentPort, workerData } from "worker_threads";

parentPort.on("startGame", startGame)

class Data {
	public playerPos: number[] = [0, 0];
	public ballPosX: number = 0;
	public ballPosY: number = 0;
	public ballVelX: number = 0;
	public ballVelY: number = 0;
}

var games: Map<number, Data> = new Map();

function startGame(id: number) {
	games.set(id, new Data());
}

function endGame(id: number) {
	games.delete(id);
}

function setPlayerPos(id: number, player: number, pos: number) {
	let game = games.get(id);

	game.playerPos[player] = pos;
}
