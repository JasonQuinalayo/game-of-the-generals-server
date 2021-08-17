const INITIAL_PIECES = require('./INITIAL_PIECES');
const ENUM_RANKS = require('./ENUM_RANKS');
const HandlerPiece = require('./HandlerPiece');

function Handler() {
  this.currentTurn = 1;
  this.playMode = false;
  this.tiles = [];
  for (let i = 0; i < 8; i++) {
    const boardRow = [];
    for (let j = 0; j < 9; j++) {
      boardRow.push(null);
    }
    this.tiles.push(boardRow);
  }
  this.playerPieces = [
    INITIAL_PIECES.map(
      (pieceRank, pieceNumber) => new HandlerPiece(1, ENUM_RANKS[pieceRank], pieceNumber),
    ),
    INITIAL_PIECES.map(
      (pieceRank, pieceNumber) => new HandlerPiece(2, ENUM_RANKS[pieceRank], pieceNumber),
    ),
  ];
  this.ready = [false, false];
  this.eliminatedPieces = [[], []];
  this.enemyMovement = [null, null];
  this.victoryState = [0, 0];
  this.gameOver = false;
}

Handler.prototype.processMove = function processMove(pendingGameStateUpdate, player) {
  if (this.gameOver || pendingGameStateUpdate == null) return;
  const validate = () => (typeof pendingGameStateUpdate === 'object'
  && (pendingGameStateUpdate.tile === null
  || (typeof pendingGameStateUpdate.tile === 'object' && typeof pendingGameStateUpdate.tile.row === 'number'
  && typeof pendingGameStateUpdate.tile.column === 'number')) && typeof pendingGameStateUpdate.piece === 'number');
  if (!validate()) {
    return;
  }
  let { tile } = pendingGameStateUpdate;
  const { piece: pieceNumber } = pendingGameStateUpdate;
  if (player === 2) {
    tile = this.invertTile(tile);
  }
  const otherPlayer = player === 1 ? 2 : 1;

  const approveUpdate = () => {
    const formerTile = this.playerPieces[player - 1][pieceNumber].tile;
    if (formerTile) {
      this.tiles[formerTile.row][formerTile.column] = null;
    }
    if (tile === null) {
      this.playerPieces[player - 1][pieceNumber].setTile(-1, -1);
    } else {
      this.tiles[tile.row][tile.column] = this.playerPieces[player - 1][pieceNumber];
      this.playerPieces[player - 1][pieceNumber].setTile(tile.row, tile.column);
    }
  };

  if (this.playMode) {
    const invalid = (tile === null || this.currentTurn !== player
      || this.playerPieces[player - 1][pieceNumber].isEliminated
      || !(this.playerPieces[player - 1][pieceNumber].tile)
      || (this.tiles[tile.row][tile.column]
        && this.tiles[tile.row][tile.column].player === player)
      || Math.abs(tile.row - this.playerPieces[player - 1][pieceNumber].tile.row)
        + Math.abs(tile.column - this.playerPieces[player - 1][pieceNumber].tile.column) !== 1);

    if (invalid) return;

    if (player === 1) {
      const invertedFinalTile = this.invertTile(tile);
      const invertedInitialTile = this.invertTile(this.playerPieces[player - 1][pieceNumber].tile);
      this.enemyMovement[otherPlayer - 1] = [
        [
          invertedInitialTile.row,
          invertedInitialTile.column,
        ],
        [
          invertedFinalTile.row,
          invertedFinalTile.column,
        ],
      ];
    } else {
      this.enemyMovement[otherPlayer - 1] = [
        [
          tile.row,
          tile.column,
        ],
        [
          this.playerPieces[player - 1][pieceNumber].tile.row,
          this.playerPieces[player - 1][pieceNumber].tile.column,
        ],
      ];
    }

    if (this.tiles[tile.row][tile.column]) {
      const result = this.resolve(this.playerPieces[player - 1][pieceNumber].rank,
        this.tiles[tile.row][tile.column].rank);
      if (result < 0) { // first player wins
        this.eliminatePiece(this.tiles[tile.row][tile.column]);
        approveUpdate();
      } else if (result === 0) { // draw
        this.eliminatePiece(this.playerPieces[player - 1][pieceNumber]);
        this.eliminatePiece(this.tiles[tile.row][tile.column]);
      } else { // second player wins
        this.eliminatePiece(this.playerPieces[player - 1][pieceNumber]);
      }
    } else {
      const flagReachesOpponentsBackRank = () => (
        pieceNumber === 20 && ((player === 1 && tile.row === 0) || (player === 2 && tile.row === 7))
      );
      const noPieceCanChallenge = () => {
        if (tile.column === 0) {
          return this.tiles[tile.row][1] === null || this.tiles[tile.row][1].player === player;
        }
        if (tile.column === 8) {
          return this.tiles[tile.row][7] === null || this.tiles[tile.row][7].player === player;
        }
        return (this.tiles[tile.row][tile.column - 1] === null
          || this.tiles[tile.row][tile.column - 1].player === player)
          && (this.tiles[tile.row][tile.column + 1] === null
            || this.tiles[tile.row][tile.column + 1].player === player);
      };
      if (flagReachesOpponentsBackRank()) {
        if (noPieceCanChallenge()) {
          this.victoryState[player - 1] = 2;
          this.gameOver = true;
        } else {
          this.victoryState[player - 1] = 1;
        }
      }
      approveUpdate();
    }

    if (!(this.gameOver) && this.victoryState[otherPlayer - 1] === 1) {
      this.victoryState[otherPlayer - 1] = 2;
      this.gameOver = true;
      return;
    }
    this.currentTurn = player === 1 ? 2 : 1;
    this.enemyMovement[player - 1] = null;
  } else if (tile === null) approveUpdate();
  else {
    const invalid = ((player === 1 && tile.row < 5) || (player === 2 && tile.row > 2)
      || this.tiles[tile.row][tile.column]);
    if (invalid) return;
    approveUpdate();
  }
};

Handler.prototype.eliminatePiece = function eliminatePiece(piece) {
  this.eliminatedPieces[piece.player - 1].push(piece.pieceNumber);
  piece.eliminate();
  this.tiles[piece.tile.row][piece.tile.column] = null;
  if (piece.rank === ENUM_RANKS.Flag) {
    this.victoryState[piece.player === 1 ? 1 : 0] = 2;
    this.gameOver = true;
  }
};

Handler.prototype.resolve = function resolve(attacker, defender) {
  if (attacker === ENUM_RANKS.Spy && defender === ENUM_RANKS.Private) {
    return 1;
  }
  if (defender === ENUM_RANKS.Spy && attacker === ENUM_RANKS.Private) {
    return -1;
  }
  if (attacker === ENUM_RANKS.Flag && defender === ENUM_RANKS.Flag) {
    return -1;
  }
  return defender - attacker;
};

Handler.prototype.invertTile = function invertTile(tile) {
  return tile ? { row: 7 - tile.row, column: 8 - tile.column } : null;
};

Handler.prototype.invertBoard = function invertBoard() {
  const invertedBoard = [];
  for (let i = 0; i < 8; i++) {
    const invertedBoardRow = [];
    for (let j = 0; j < 9; j++) {
      const invertedTile = this.invertTile({ row: i, column: j });
      invertedBoardRow.push(this.tiles[invertedTile.row][invertedTile.column]);
    }
    invertedBoard.push(invertedBoardRow);
  }
  return invertedBoard;
};

Handler.prototype.getBoardState = function getBoardState(player) {
  let board = this.tiles;
  if (player === 2) board = this.invertBoard();
  return (
    board.map(
      (PieceRow) => PieceRow.map(
        (piece) => {
          if (piece) {
            let isEnemy = true;
            if (piece.player === player) {
              isEnemy = false;
            }
            return ({
              isEnemy,
              number: piece.pieceNumber,
            });
          }
          return null;
        },
      ),
    )
  );
};

Handler.prototype.readyPlayer = function readyPlayer(player, ready) {
  this.ready[player - 1] = ready;
  if (this.ready[0] && this.ready[1]) this.playMode = true;
};

Handler.prototype.areAllPlayersReady = function areAllPlayersReady() {
  return this.ready[0] && this.ready[1];
};

Handler.prototype.getCurrentTurn = function getCurrentTurn() {
  return this.currentTurn;
};

Handler.prototype.getEliminatedPieces = function getEliminatedPieces(player) {
  return this.eliminatedPieces[player - 1];
};

Handler.prototype.getEnemyMovement = function getEnemyMovement(player) {
  return this.enemyMovement[player - 1];
};

Handler.prototype.getVictoryState = function getVictoryState(player) {
  return this.victoryState[player - 1] === 2;
};

Handler.prototype.isGameOver = function isGameOver() {
  return this.gameOver;
};

module.exports = Handler;
