import * as THREE from 'three'

export class shape {
	private _width:number;
	private _height:number;
	private _depth:number;
	private _color:THREE.ColorRepresentation;
	private _mesh:THREE.Mesh;
	private _geometry:THREE.BoxGeometry | THREE.SphereGeometry;
	private _material:THREE.MeshBasicMaterial;

	constructor(name:string, width:number, height:number, depth:number, color:THREE.ColorRepresentation) {
		this._width = width;
		this._height = height;
		this._depth = depth;
		this._color = color;
		if (name == 'ball')
			this._geometry = new THREE.SphereGeometry( width, height, depth );
		else
			this._geometry = new THREE.BoxGeometry( width, height, depth );
		this._material = new THREE.MeshBasicMaterial( {color} );
		this._mesh = new THREE.Mesh( this._geometry, this._material );
		this._mesh.geometry.computeBoundingBox();
		this._mesh.name = name;
	}

	public get width() { return this._width; }
	public get height() { return this._height; }
	public get depth() { return this._depth; }
	public get color() { return this._color; }
	public get geometry() { return this._geometry; }
	public set geometry(geometry:THREE.BoxGeometry | THREE.SphereGeometry) { this._geometry = geometry; }
	public get material() { return this._material; }
	public set material(material:THREE.MeshBasicMaterial) { this._material = material; }
	public get mesh() { return this._mesh; }
	public set mesh(mesh:THREE.Mesh) { this._mesh = mesh; }
}
