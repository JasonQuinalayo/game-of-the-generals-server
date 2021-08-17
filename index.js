const io = require('socket.io')(process.env.PORT || 3001, { cors: { origin: 'https://jasonquinalayo.github.io' } });
const INITIAL_PIECES = require('./INITIAL_PIECES');
const Handler = require('./Handler');
const randomString = require('./randomString');

const clientToRoom = {};
const matches = {};

io.on('connection', (socket) => {
  const getInfo = () => {
    const roomId = clientToRoom[socket.id];
    const { handler } = matches[roomId];
    const player = socket.id === matches[roomId].playerIds[0].socketId ? 1 : 2;
    const otherPlayer = player === 1 ? 2 : 1;
    const otherPlayerSocket = io.to(matches[roomId].playerIds[otherPlayer - 1].socketId);
    return {
      roomId, player, otherPlayer, handler, otherPlayerSocket,
    };
  };

  const stateUpdateSchema = {
    piece: (value) => typeof value === 'number' && value >= 0 && value < 21,
    tile: (value) => {
      const tileSchema = {
        row: (rowVal) => typeof rowVal === 'number' && rowVal >= 0 && rowVal < 8,
        column: (colVal) => typeof colVal === 'number' && colVal >= 0 && colVal < 9,
      };
      return value === null || (typeof value === 'object' && Object.keys(tileSchema).reduce((prev, key) => (
        tileSchema[key](value[key]) && prev), true));
    },
  };

  const validateStateUpdate = (stateUpdate) => (typeof stateUpdate === 'object' && Object.keys(stateUpdateSchema).reduce((prev, key) => (
    stateUpdateSchema[key](stateUpdate[key]) && prev), true));

  const cleanUp = (roomId) => {
    const match = matches[roomId];
    clearTimeout(match.timeOut);
    const pOneSocketId = match.playerIds[0].socketId;
    const pTwoSocketId = match.playerIds[1].socketId;
    if (pOneSocketId) delete clientToRoom[pOneSocketId];
    if (pTwoSocketId) delete clientToRoom[pTwoSocketId];
    delete matches[roomId];
  };

  const handleTryReconnect = (prevSocketId) => {
    let pieces = null;
    let reconnectGameState = null;
    if (clientToRoom[prevSocketId] && matches[clientToRoom[prevSocketId]]
      && matches[clientToRoom[prevSocketId]].started) {
      const roomId = clientToRoom[prevSocketId];
      const player = matches[roomId].playerIds[0].socketId === prevSocketId ? 1 : 2;
      const otherPlayer = player === 1 ? 2 : 1;
      if (matches[roomId].connected[player - 1]) {
        socket.emit('multiple-client');
        return;
      }
      const { handler } = matches[roomId];
      pieces = INITIAL_PIECES;
      reconnectGameState = {
        boardState: handler.getBoardState(player),
        playMode: handler.playMode,
        currentTurn: handler.getCurrentTurn() === player,
        eliminatedPieces: handler.getEliminatedPieces(player),
        enemyMovement: handler.getEnemyMovement(player),
        name: matches[roomId].playerIds[player - 1].name,
        enemyReady: handler.ready[otherPlayer - 1],
        enemyPeerId: matches[roomId].playerIds[otherPlayer - 1].peerId,
        enemyName: matches[roomId].playerIds[otherPlayer - 1].name,
      };
      matches[roomId].playerIds[player - 1].socketId = socket.id;
      matches[roomId].connected[player - 1] = true;
      clientToRoom[socket.id] = roomId;
      delete clientToRoom[prevSocketId];
      io.to(matches[roomId].playerIds[otherPlayer - 1].socketId).emit('enemy-reconnected');
    }
    socket.emit('reconnect-status', reconnectGameState, pieces);
  };

  const handleNewGame = () => {
    if (clientToRoom[socket.id]) {
      socket.emit('duplicate-id');
      return;
    }
    let roomId = randomString(16);
    while (matches[roomId]) {
      roomId = randomString(16);
    }
    clientToRoom[socket.id] = roomId;
    matches[roomId] = {};
    matches[roomId].handler = new Handler();
    matches[roomId].playerIds = [{}, {}];
    matches[roomId].playerIds[0].socketId = socket.id;
    matches[roomId].started = false;
    matches[roomId].connected = [true, false];
    socket.emit('new-game-code', roomId);
    matches[roomId].timeOut = setTimeout(() => {
      cleanUp(roomId);
    }, 300000);
  };

  const handleJoinGame = (gameCode) => {
    if (clientToRoom[socket.id]) {
      socket.emit('duplicate-id');
      return;
    }
    if (!(matches[gameCode])
    || (matches[gameCode].playerIds[1].socketId)) {
      socket.emit('invalid-game-code');
      return;
    }
    clearTimeout(matches[gameCode].timeOut);
    clientToRoom[socket.id] = gameCode;
    matches[gameCode].playerIds[1].socketId = socket.id;
    matches[gameCode].started = true;
    matches[gameCode].connected[1] = true;
    socket.emit('match-found', INITIAL_PIECES);
    const playerOneSocket = io.to(matches[gameCode].playerIds[0].socketId);
    playerOneSocket.emit('match-found', INITIAL_PIECES);
  };

  const handleMove = (stateUpdate) => {
    const {
      handler, player, otherPlayer, otherPlayerSocket,
    } = getInfo();
    if (stateUpdate && validateStateUpdate(stateUpdate)) {
      handler.processMove(stateUpdate, player);
    }
    socket.emit('update-game-state',
      handler.getBoardState(player),
      handler.getCurrentTurn() === player,
      handler.getEliminatedPieces(player),
      handler.getEnemyMovement(player));
    otherPlayerSocket.emit('update-game-state',
      handler.getBoardState(otherPlayer),
      handler.getCurrentTurn() === otherPlayer,
      handler.getEliminatedPieces(otherPlayer),
      handler.getEnemyMovement(otherPlayer));
    if (handler.isGameOver()) {
      socket.emit('game-over', handler.getVictoryState(player));
      otherPlayerSocket.emit('game-over', handler.getVictoryState(otherPlayer));
    }
  };

  const handleReady = (ready) => {
    const {
      handler, player, otherPlayerSocket,
    } = getInfo();
    handler.readyPlayer(player, ready);
    otherPlayerSocket.emit('enemy-ready', ready);
    if (handler.areAllPlayersReady()) {
      handleMove(null);
    }
  };

  const handleIds = (peerId, name) => {
    const { roomId, player, otherPlayerSocket } = getInfo();
    matches[roomId].playerIds[player - 1].peerId = peerId;
    matches[roomId].playerIds[player - 1].name = name;
    otherPlayerSocket.emit('enemy-ids', { peerId, name });
  };

  const handleMessage = (message) => {
    const { otherPlayerSocket } = getInfo();
    otherPlayerSocket.emit('enemy-message', message);
  };

  const handleDisconnect = () => {
    if (!(clientToRoom[socket.id])) return;
    const {
      roomId, player, otherPlayer, otherPlayerSocket,
    } = getInfo();
    matches[roomId].connected[player - 1] = false;
    if (!(matches[roomId].connected[otherPlayer - 1])) {
      cleanUp(roomId);
    } else {
      otherPlayerSocket.emit('enemy-disconnected');
    }
  };

  socket.on('try-reconnect', handleTryReconnect);
  socket.on('new-game', handleNewGame);
  socket.on('join-game', handleJoinGame);
  socket.on('move', handleMove);
  socket.on('ready', handleReady);
  socket.on('ids', handleIds);
  socket.on('message', handleMessage);
  socket.on('disconnect', handleDisconnect);
});
