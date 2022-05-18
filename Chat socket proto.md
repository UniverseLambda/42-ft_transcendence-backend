# Chat protocol description

## Network
The chat protocol use Socket.IO for communication between the server and the clients.

Any user MUST be logged-in to use it, otherwise the connection will be automatically _closed_. It's checked through cookies the same way as the rest of the server.

## Events

### Client-sended events

#### _message_

Sending message to another client/a channel.

Expected input:
```ts
{
	targetId: number,			// the target ID, (negative for a room, positive for a user, 0 for the general channel)
	message: string				// the actual message
}
```

Associated server-sended events: _messageSent_ (on success), _messageError_ (on error)

#### _createRoom_

Creating a new chat room

Expected input:
```ts
{
	name: string,				// the room name, must have a length in ]0;15], and must not contain " ./\-*" and not be "General"
	type: "public"|"private",	// the channel type, either public or private
	password: string|undefined	// the (optional) channel password, must not be empty
}
```

Associated server-sended events: _roomJoined_ (on success), _createRoomError_ (on error), _message_ (sent to receipients on success)

#### _leaveRoom_

Leave a room

Expected input:
```ts
{
	roomId: number				// the id of the room the user want to leave, must be < 0
}
```

Associated server-sended events: _roomLeaved_ (on success), _leaveRoomError_ (on error)

#### _setRoomPassword_

Set a room's password

The user MUST be admin of the room to execute this command

Expected input:
```ts
{
	roomId:	number,				// the id of the room the user want to set the password of, must be in [INT_MIN; 0[
	password: string|undefined	// the new password, either a non-empty string, or undefined to remove the password
}
```

Associated server-sended events: _setRoomPasswordResult_ (both for success and error)

#### _joinRoom_

Join a room

Expected input:
```ts
{
	roomId:	number,				// the id of the room the user want to join, must be in [INT_MIN; 0[
	password: string|undefined	// the password of the room, or undefined
}
```

Associated server-sended events: _roomJoined_ (on success), _joinRoomError_ (on error)

### Server-sended events

#### _message_

A message has been sent to client

Expected input:
```ts
{
	senderId: number,			// the message sender's id (always > 0)
	message: string,			// the message content
	where: number,				// where it has been sent (<= 0 for a room, > 0 a direct message)
	login: string				// the sender's login
}
```

#### _messageSent_

Confirmation of the sending of a message

Expected input:
```ts
{
	targetId: number			// the message target's id (<= 0 for a room, > 0 for a direct message)
}
```

#### _messageError_

An error occured during the sending of a message

Expected input:
```ts
{
	targetId: number,			// the message target's id (<= 0 for a room, > 0 for a direct message)
	error:	"NotRegistered"		// the error's name
			|"InvalidValue"
			|"TargetNotFound"
			|"NotInRoom",
	message: string				// a server-side generated message explaining the error
}
```

#### _roomJoined_

The user has joined a room

Expected input:
```ts
{
	roomId: number,				// the room's id (<= 0)
	name: string,				// the room's name
}
```

#### _newRoom_

A new public room has been created

Expected input:
```ts
{
	roomId: number,				// the room's id (<= 0)
	name: string,				// the room's name
}
```

#### _createRoomError_

An error occured during the creation of a new room

Expected input:
```ts
{
	error: "NotRegistered"		// the error's name
			|"InvalidValue"
			|"NotInRoom",
	message: string				// a server-side generated message explaining the error
}
```

#### _roomLeaved_

The user leaved a room

Expected input:
```ts
{
	roomId: number,				// the room's id (< 0)
}
```

#### _leaveRoomError_

An error occured during the leaving of a room

Expected input:
```ts
{
	targetId: number,			// the message target's id (<= 0 for a room, > 0 for a direct message)
	error: "NotRegistered"		// the error's name
			|"InvalidValue"
			|"TargetNotFound"
			|"NotInRoom",
	message: string				// a server-side generated message explaining the error
}
```

#### _setRoomPasswordResult_

The request to set a room's password has been processed

Expected input:
```ts
{
	success: true|undefined,	// true in case of success, undefined otherwise
	error: "NotRegistered"		// the error's name, or undefined if it's a succes
			|"InvalidValue"
			|"TargetNotFound"
			|"NotInRoom",
			|"NotAdmin",
			|undefined
	message: string|undefined	// a server-side generated message explaining the error, or undefined if it's a succes
}
```

#### _joinRoomError_

An error occured during the joining of a room

Expected input:
```ts
{
	error: "NotRegistered"		// the error's name
			|"InvalidValue"
			|"TargetNotFound"
			|"PasswordRequired"
			|"WrongPassword",
			|"AlreadyInRoom",
	message: string				// a server-side generated message explaining the error
}
```

### _error_ field descriptions

In case of an error, an *error* will be present

It will have one of those values:
- **NotRegistered**: the current socket has not been registered (may happens if the client emited a message before the server authentified the socket or before it was closed in case of an authentification refusal)
- **TargetNotFound**: the given target (usually the *roomId* field of an event) has not been found
- **InvalidValue**: a field has an invalid value (eg: wrong type, missing field...)
- **AlreadyInRoom**: the user tried to join a room in which they're already in
- **PasswordRequired**: the user tried to join a password protected room without providing a password
- **WrongPassword**: the user tried to join a password protected room while providing a wrong password
- **NotInRoom**: the user tried to act on a channel while not being in it
- **TargetNotInRoom**: the target of the event is not in the target room
- **NotAdmin**: the target tried to do an admin action while not being admin of the target room
- **Blocked**: the user has been blocked (shall not be sent for room messages) *(Not implemented yet)*
- **Muted**: the user has been muted in the target room *(Not implemented yet)*
- **Banned**: the user tried to join a room of which they've been banned *(Not implemented yet)*

