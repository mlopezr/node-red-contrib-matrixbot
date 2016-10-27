# Matrix bot nodes for Node-RED

This package contains nodes to send and receive messages as a Matrix node.

## Quick usage guide

This package adds 3 node types to Node-RED palette (Matrix section, at the bottom):
* *Matrix sender*: sends messages from your Node-RED flow to the chatroom
* *Matrix receiver*: listens to messages in a chatroom and sends them to your Node-RED flow
* *Matrix command*: listens only to messages starting with a specific command and sends them to your Node-RED flow

All of these nodes require a Matrix Configuration with the following settings:
* *User ID*: the user ID in the matrix server, for instance @mybot:matrix.org
* *Access token*: the access token of the user in the matrix server
* *Server URL*: URL of the Matrix homeserver, e.g. https://matrix.org
* *Room ID*: ID of the chatroom to join when starting. If no room is specified, it will automatically join any room where it is invited

## Install guide

Make sure you have Docker installed, run:

```
git clone https://github.com/mlopezr/node-red-contrib-matrixbot.git
cd node-red-contrib-matrixbot
npm install
docker run --rm -it -p 1880:1880 --name mynodered -v `pwd`:/data/nodes nodered/node-red-docker
```

Then open http://127.0.0.1:1880/ in a browser.
