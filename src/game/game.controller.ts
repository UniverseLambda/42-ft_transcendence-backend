type state = {
	key:string,
	isOn:boolean
}

export class controller {
	static up: state = {key:"ArrowUp", isOn:false};
	static down: state = {key:"ArrowDown", isOn:false};
	static start: state = {key:" ", isOn:false};

	public get up():state {return controller.up;}
	public get down():state {return controller.down;}
	public get start() {return controller.start;}

	public set up(state:state) {controller.up = state;}
	public set down(state:state) {controller.down = state;}
	public set start(state:state) {controller.start = state;}
}
