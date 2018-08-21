/*
	Copyright 2018 JasX
	Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
	The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
	THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
// This is a client script, it won't work with node

class VhSocket{



	// OVERRIDABLE EVENTS //

	// A device connected to this app has come online or been added
	onDeviceOnline( data ){

		let id = data.shift(),
			socket_id = data.shift();
		console.log("A device called", id, "has come online, id: ", socket_id);

	}

	// A device connected to this app has gone offline
	onDeviceOffline( data ){

		let id = data.shift(),
			socket_id = data.shift();

		console.log("A device called", id, "has gone offline, id:", socket_id);

	}

	// age received from a modified VibHub device
	onCustomMessage( data ){

		let id = data.shift(),
			sid = data.shift(),
			custom = data.shift()
		; 
		if( !Array.isArray(custom) )
			return;

		let task = custom.shift(),
			val = custom.shift()
		;
		
		console.log("age received. Id:", id, "SID:", sid, "Task", task, "Val", val);

	}
	






	// CODE BEGINS HERE //

	// Internal stuff here
	constructor( appName, server, port ){
		
		this.appName = appName;
		this.server = server || 'https://vibhub.io';
		this.port = port || 80;
		this.devices = [];
		this.socket = null;

	}

	// Starts the connection and sets up name, resturns a promise
	begin(){
		
		this.socket = io(this.server);
		this.socket.on('dev_online', data => { this.onDeviceOnline(data); });
		this.socket.on('dev_offline', data => { this.onDeviceOffline(data); });
		this.socket.on('aCustom', data => { this.onCustomMessage(data); });
		return new Promise(res => {
			
			this.socket.on('connect', () => {
				res(this.setName()); 
			});
			
		});

	}

	// Sends our app name to the server, returns a promise
	setName(){

		return new Promise(res => {
			this.socket.emit('app', this.appName, success => { 
				res(success); 
			});
		});

	}

	// This method lets us add one or more devices. deviceID is the device ID you get from your VibHub device
	// deviceID can be either a string or an array of strings
	addDevice( deviceID ){

		return new Promise(res => {

			this.socket.emit('hookup', deviceID, devices => {

				this.devices = devices;	// Update our array of devices. The index of the devices in this array is what we will use to send the updates.
				res();

			});

		});
		
	}

	// Clears all devices
	wipeDevices(){

		return new Promise(res => {

			this.socket.emit('hookdown', [], devices => {

				this.devices = [];	// Update our array of devices. The index of the devices in this array is what we will use to send the updates.
				res();

			});

		});

	}

	// This returns the index of a device ID, this is needed to send updates to our VibHub device
	getDeviceIndex( deviceID ){

		let pos = this.devices.indexOf(deviceID);
		// This device has successfully been hooked up, return the index
		if( ~pos )
			return pos;
		// this device has not been hooked up
		return false;				

	}

	// This updates the vibration strength of the VibHub device's ports (0-255)
	sendPWM( device, port0, port1, port2, port3 ){
		
		let index = this.getDeviceIndex(device);
		if( index === false ){
			
			console.error("Device not found", device);
			return;

		}

		let out = 										// Build a hex string
				index.toString(16).padStart(2,'0')+
				(+port0).toString(16).padStart(2,'0')+		// Value of port 0
				(+port1).toString(16).padStart(2,'0')+		// Value of port 1...
				(+port2).toString(16).padStart(2,'0')+
				(+port3).toString(16).padStart(2,'0')
		;

		this.socket.emit('p', out);	// Send the hex to the VibHub device!

	}

	sendProgram( device, program ){
		
		if( typeof program !== "object" || typeof program.export !== "function" )
			throw "Program is invalid";

		this.socket.emit('GET', {
			id : device,
			type : "vib",
			data : program.export()
		});

	}

	// Send a age to a modified VibHub device (must be connected to the app)
	sendCustomMessage( id, data ){
		this.socket.emit("dCustom", [id, data]);
	}

}

// Program API
class VhProgram{

	// Ports is an array of ports you want to trigger, numbered from 0 to 3
	// Ports can also be a single port if it's an int
	constructor( ports, repeats ){

		this.port = 0;
		this.repeats = repeats > 0 ? +repeats : 0;
		this.stages = [];

		this.setPorts(ports);

	}

	// Accepts an array of ports to set
	setPorts( ports ){

		if( !Array.isArray(ports) ){

			if( !isNaN(ports) )
				this.port = +ports;
			return;

		}

		this.port = 0;
		for( let port of ports ){
			
			if( port < 0 || port > 3 )
				continue;
			port = Math.floor(port);
			this.port = this.port | (1<<port);

		}

	}

	// Adds one or more VhStages
	addStage(){

		for(let stage of arguments)
			this.stages.push(stage);

	}

	export(){

		let out = {
			stages : []
		};
		if( this.port > 0 )
			out.port = this.port;
		if( this.repeats > 0 )
			out.repeats = this.repeats;

		if( !Array.isArray(this.stages) )
			throw "Program stages is not an array";
		
		
		for( let stage of this.stages ){

			if( typeof stage !== "object" || typeof stage.export !== "function" )
				throw "A stage is not a proper object";

			let ex = stage.export();
			if( typeof ex !== "object" )
				throw "Invalid stage export";

			out.stages.push(ex);

		}

		return out;
		
	}

}

class VhStage{

	constructor( settings ){

		if( typeof settings !== "object" )
			settings = {};
		this.intensity = settings.intensity || 0;
		this.duration = settings.duration;
		this.easing = settings.easing || "Linear.None";
		this.repeats = settings.repeats || 0;
		this.yoyo = !!settings.yoyo;

	}

	exportIntOrRand( v ){
		
		if( typeof v === "object" && typeof v.export === "function" )
			return v.export();

		if( !isNaN(v) )
			return Math.floor(v);
			
		return 0;

	}

	export(){

		let out = {};
		if( typeof this.intensity === "boolean" )
			out.i = this.intensity;
		else if( this.intensity )
			out.i = this.exportIntOrRand(this.intensity);

		if( this.repeats )
			out.r = this.exportIntOrRand(this.repeats);

		if( this.duration )
			out.d = this.exportIntOrRand(this.duration);

		if( typeof this.easing === "string" && this.easing !== "Linear.None" )
			out.e = this.easing;
		
		if( this.yoyo )
			out.y = this.yoyo;

		return out;

	}

}

class VhRandObject{

	constructor( settings ){
		
		if( typeof settings !== "object" )
			settings = {};

		this.min = isNaN(settings.min) ? null : Math.floor(settings.min);
		this.max = isNaN(settings.max) ? null : Math.floor(settings.max);
		this.offset = isNaN(settings.offset) ? null : Math.floor(settings.offset);
		this.multi = isNaN(settings.multi) ? null : Math.floor(settings.multi);

	}

	export(){

		let out = {};
		if( this.min !== null )
			out.min = this.min;
		if( this.max !== null )
			out.max = this.max;
		if( this.offset !== null )
			out.offset =  this.offset;
		if( this.multi !== null )
			out.multi = this.multi;
		return out;

	}

}



export default VhSocket;
export {VhProgram, VhStage, VhRandObject};
