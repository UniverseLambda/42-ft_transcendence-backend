export class tools {
	static getRandom(min:any, max:any) {
		min = Math.ceil(min);
		max = Math.floor(max);
		var rand =  Math.floor(Math.random() * (max - min)) + min;
		if (rand == 0)
		rand = -1;
		return rand;
	}
}
