module.exports = function(RED) {

	"use strict";

	var sdk = require("matrix-js-sdk");

// --------------------------------------------------------------------------------------------
	// The configuration node holds the configuration and credentials for all nodes.

	function MatrixBotNode(config) {
		RED.nodes.createNode(this, config);

		// copy "this" object in case we need it in context of callbacks of other functions.
		var node = this;

		node.log("Initializing Matrix Bot node");

		// Configuration options passed by Node Red
		node.userId = config.userId;
		node.room = config.room;

		// TODO: Switch from configuration to credentials and check with if (this.credentials)
		node.accessToken = config.accessToken;
		node.matrixServerURL = config.matrixServerURL;

		node.matrixClient = sdk.createClient({
			baseUrl: node.matrixServerURL,
			accessToken: node.accessToken,
			userId: node.userId
		});

		// If no room is specified, join any room where we are invited
		if (!node.room || node.room === "") {
			node.matrixClient.on("RoomMember.membership", function(event, member) {
				if (member.membership === "invite" && member.userId === node.userId) {
					node.matrixClient.joinRoom(member.roomId).done(function() {
						node.log("Automatically accepted invitation to join room " + member.roomId);
					});
				}
			});
		}

		node.matrixClient.on("sync", function(state, prevState, data) {
			switch (state) {
		    case "ERROR":
		      // update UI to say "Connection Lost"
		      node.warn("Connection to Matrix server lost");
		      node.updateConnectionState(false);
		      break;
		    case "SYNCING":
		      // update UI to remove any "Connection Lost" message
		      node.updateConnectionState(true);
		      break;
		    case "PREPARED":
		      	// the client instance is ready to be queried.
   		      	node.log("Synchronized to Matrix server.");

   		      	if (node.room) {
	   		      	node.log("Trying to join room " + node.room);

					node.matrixClient.joinRoom(node.room, {syncRoom:false})
						.then(function(joinedRoom) {
							node.log("Joined " + node.room);
							node.room = joinedRoom.roomId;
							node.updateConnectionState(true);
						}).catch(function(e) {
							node.warn("Error joining " + node.room + ": " + e);
						});
				} else {
					node.log("No room configured. Will only join rooms where I'm invited");
				}
		      	break;
		  	}
		});

		node.log("Connecting to Matrix server...");

		node.matrixClient.startClient();

        // Called when the connection state may have changed
        this.updateConnectionState = function(connected){
        	if (node.connected !== connected) {
        		node.connected = connected;
	        	if (connected) {
	        		node.emit("connected");
	        	} else {
	        		node.emit("disconnected");
	        	}
	        }
        };

        // When Node-RED updates nodes, disconnect from server to ensure a clean start
		node.on("close", function (done) {
			node.log("Matrix configuration node closing...");
			if (node.matrixClient) {
        		node.log("Disconnecting from Matrix server...");
        		node.matrixClient.stopClient();
        		node.updateConnectionState(false);
        	}
			done();
		});

	}

	RED.nodes.registerType("matrix bot", MatrixBotNode);

// --------------------------------------------------------------------------------------------
	// The output node sends a message to the chat.

	function MatrixOutNode(config) {
		RED.nodes.createNode(this, config);

		// copy "this" object in case we need it in context of callbacks of other functions.
		var node = this;
        
        // Configuration options passed by Node Red
        node.configNode = RED.nodes.getNode(config.bot);

        node.configNode.on("connected", function(){
        	node.status({ fill: "green", shape: "ring", text: "connected" });
        });

        node.configNode.on("disconnected", function(){
        	node.status({ fill: "red", shape: "ring", text: "disconnected" });
        });

        this.on("input", function (msg) {
        	if (! node.configNode || ! node.configNode.matrixClient) {
            	node.warn("No configuration");
            	return;
        	}

            if (msg.payload) {
	        	node.log("Sending message " + msg.payload);

	        	var destRoom = "";
	        	if (msg.roomId) {
	        		destRoom = msg.roomId;
	        	} else if (node.configNode.room) {
	        		destRoom = node.configNode.room;
	        	} else {
	        		node.warn("Room must be specified in msg.roomId or in configuration");
	        		return;
	        	}

	        	node.configNode.matrixClient.sendTextMessage(destRoom, msg.payload.toString())
	        		.then(function() {
               			node.log("Message sent: " + msg.payload);
            		}).catch(function(e){
            			node.warn("Error sending message " + e);
            		});
	        } else {
                node.warn("msg.payload is empty");
            }
    	});

    	this.on("close", function(done) {
    		node.log("Matrix out node closing...");
    		done();
    	});
    }

	RED.nodes.registerType("matrix sender", MatrixOutNode);


// --------------------------------------------------------------------------------------------
	// The input node receives messages from the chat.

	function MatrixInNode(config) {
		RED.nodes.createNode(this, config);

		// copy "this" object in case we need it in context of callbacks of other functions.
		var node = this;
        node.configNode = RED.nodes.getNode(config.bot);

        node.log("MatrixInNode initializing...");

        if (!node.configNode) {
        	node.warn("No configuration node");
        	return;
        }

        node.status({ fill: "red", shape: "ring", text: "disconnected" });

        node.configNode.on("disconnected", function(){
        	node.status({ fill: "red", shape: "ring", text: "disconnected" });
        });

		node.configNode.on("connected", function() {
			node.status({ fill: "green", shape: "ring", text: "connected" });
			node.configNode.matrixClient.on("Room.timeline", function(event, room, toStartOfTimeline, data) {
				if (toStartOfTimeline) {
					return; // don't print paginated results
				}
				if (event.getType() !== "m.room.message") {
					return; // only keep messages
				}
				if (!event.getSender() || event.getSender() === node.configNode.userId) {
					return; // ignore our own messages
				}
				if (!event.getUnsigned() || event.getUnsigned().age > 1000) {
					return; // ignore old messages
				}
				// TODO process messages other than text
				node.log(
					// the room name will update with m.room.name events automatically
					"Received chat message: (" + room.name + ") " + event.getSender() + " :: " + event.getContent().body
				);
				var msg = {
					payload: event.getContent().body,
					sender: event.getSender(),
					roomId: room.roomId
				};
				node.send(msg);
			});
		});

    	this.on("close", function(done) {
    		node.log("Matrix in node closing...");
    		done();
    	});

	}

	RED.nodes.registerType("matrix receiver", MatrixInNode);

// --------------------------------------------------------------------------------------------
	// The command node receives messages from the chat.

	function MatrixCommandNode(config) {
		RED.nodes.createNode(this, config);

		// copy "this" object in case we need it in context of callbacks of other functions.
		var node = this;
		node.command = config.command;
        node.configNode = RED.nodes.getNode(config.bot);

        node.log("MatrixCommandNode initializing...");

        if (!node.configNode) {
        	node.warn("No configuration node");
        	return;
        }

        node.status({ fill: "red", shape: "ring", text: "disconnected" });

        node.configNode.on("disconnected", function(){
        	node.status({ fill: "red", shape: "ring", text: "disconnected" });
        });

		node.configNode.on("connected", function() {
			node.status({ fill: "green", shape: "ring", text: "connected" });
			node.configNode.matrixClient.on("Room.timeline", function(event, room, toStartOfTimeline, data) {
				if (toStartOfTimeline) {
					return; // don't print paginated results
				}
				if (event.getType() !== "m.room.message") {
					return; // only keep messages
				}
				if (!event.getSender() || event.getSender() === node.configNode.userId) {
					return; // ignore our own messages
				}
				if (!event.getUnsigned() || event.getUnsigned().age > 1000) {
					return; // ignore old messages
				}
				// TODO process messages other than text
				node.log(
					// the room name will update with m.room.name events automatically
					"Received chat message: (" + room.name + ") " + event.getSender() + " :: " + event.getContent().body
				);

				var message = event.getContent().body;

				var tokens = message.split(" ");

				if (tokens[0] == node.command) {
					node.log("Recognized command " + node.command + "  Processing...");
					var remainingText = message.replace(node.command, "");
                    var msg = {
                    	payload: remainingText, 
						sender: event.getSender(),
						roomId: room.roomId,
						originalMessage: message
                    };
                    node.send([msg, null]);
				}

			});
		});

    	this.on("close", function(done) {
    		node.log("Matrix command node closing...");
    		done();
    	});
	}

	RED.nodes.registerType("matrix command", MatrixCommandNode);

}