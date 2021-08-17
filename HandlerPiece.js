function HandlerPiece(player, rank, pieceNumber) {
  this.player = player;
  this.rank = rank;
  this.pieceNumber = pieceNumber;
  this.tile = null;
  this.isEliminated = false;
}

HandlerPiece.prototype.setTile = function setTile(row, column) {
  if (row === -1 && column === -1) this.tile = null;
  else this.tile = { row, column };
};

HandlerPiece.prototype.eliminate = function eliminate() {
  this.isEliminated = true;
};

module.exports = HandlerPiece;
