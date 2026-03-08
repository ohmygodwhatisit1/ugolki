const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.url === '/style.css') {
    fs.readFile(path.join(__dirname, 'public', 'style.css'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading style.css');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end(data);
    });
  } else if (req.url === '/client.js') {
    fs.readFile(path.join(__dirname, 'public', 'client.js'), (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading client.js');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

const wss = new WebSocket.Server({ server });

let players = [];
let spectators = [];
let gameState = {
  board: initializeBoard(),
  currentPlayer: 'white',
  gameOver: false,
  winner: null
};

function initializeBoard() {
  const board = Array(8).fill().map(() => Array(8).fill(null));
  // Black pieces: top-left 3x3
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      board[r][c] = 'black';
    }
  }
  // White pieces: bottom-right 3x3
  for (let r = 5; r < 8; r++) {
    for (let c = 5; c < 8; c++) {
      board[r][c] = 'white';
    }
  }
  return board;
}

function broadcast(data) {
  const message = JSON.stringify(data);
  players.forEach(player => {
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(message);
    }
  });
  spectators.forEach(spec => {
    if (spec.ws.readyState === WebSocket.OPEN) {
      spec.ws.send(message);
    }
  });
}

function updatePlayerList() {
  const playerList = players.map(p => ({ id: p.id, name: p.name, color: p.color, status: 'online' }));
  broadcast({ type: 'players', players: playerList });
}

wss.on('connection', (ws) => {
  let playerId = null;
  let playerName = 'Player';
  let playerColor = null;

  ws.on('message', (message) => {
    const data = JSON.parse(message);

    if (data.type === 'join') {
      playerId = data.id || generateId();
      playerName = data.name || 'Player';
      if (players.length < 2) {
        playerColor = players.length === 0 ? 'white' : 'black';
        players.push({ id: playerId, name: playerName, color: playerColor, ws });
      } else {
        spectators.push({ id: playerId, name: playerName, ws });
      }
      // Reset game if over
      if (gameState.gameOver) {
        gameState = {
          board: initializeBoard(),
          currentPlayer: 'white',
          gameOver: false,
          winner: null
        };
      }
      console.log('Player joined:', playerId, playerColor, 'Players:', players.length, 'Spectators:', spectators.length);
      ws.send(JSON.stringify({ type: 'joined', id: playerId, color: playerColor, gameState }));
      updatePlayerList();
    } else if (data.type === 'rename') {
      playerName = data.name;
      const player = players.find(p => p.id === playerId);
      if (player) {
        player.name = playerName;
      } else {
        const spec = spectators.find(s => s.id === playerId);
        if (spec) spec.name = playerName;
      }
      updatePlayerList();
    } else if (data.type === 'move') {
      if (gameState.gameOver) return;
      const player = players.find(p => p.id === playerId);
      if (!player || player.color !== gameState.currentPlayer) return;
      // Validate and make move
      if (makeMove(data.from, data.to)) {
        gameState.currentPlayer = gameState.currentPlayer === 'white' ? 'black' : 'white';
        checkWin();
        broadcast({ type: 'update', gameState });
      }
    }
  });

  ws.on('close', () => {
    players = players.filter(p => p.id !== playerId);
    spectators = spectators.filter(s => s.id !== playerId);
    updatePlayerList();
  });
});

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function makeMove(from, to) {
  const [fr, fc] = from;
  const [tr, tc] = to;
  if (gameState.board[fr][fc] !== gameState.currentPlayer) return false;
  const possibleMoves = getPossibleMoves(fr, fc);
  if (possibleMoves.some(([r, c]) => r === tr && c === tc)) {
    gameState.board[tr][tc] = gameState.board[fr][fc];
    gameState.board[fr][fc] = null;
    return true;
  }
  return false;
}

function getPossibleMoves(r, c) {
  const moves = [];
  const color = gameState.board[r][c];
  // Adjacent moves (horizontal and vertical only)
  const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of directions) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && gameState.board[nr][nc] === null) {
      moves.push([nr, nc]);
    }
  }
  // Jumps (horizontal and vertical only)
  const visited = new Set();
  const queue = [[r, c]];
  while (queue.length > 0) {
    const [cr, cc] = queue.shift();
    const key = `${cr},${cc}`;
    if (visited.has(key)) continue;
    visited.add(key);
    // Horizontal jumps
    for (let dc = -2; dc <= 2; dc += 4) {
      const nr = cr;
      const nc = cc + dc;
      const mr = cr;
      const mc = cc + dc / 2;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && gameState.board[mr][mc] !== null && gameState.board[nr][nc] === null) {
        moves.push([nr, nc]);
        queue.push([nr, nc]);
      }
    }
    // Vertical jumps
    for (let dr = -2; dr <= 2; dr += 4) {
      const nr = cr + dr;
      const nc = cc;
      const mr = cr + dr / 2;
      const mc = cc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && gameState.board[mr][mc] !== null && gameState.board[nr][nc] === null) {
        moves.push([nr, nc]);
        queue.push([nr, nc]);
      }
    }
  }
  return moves;
}

function checkWin() {
  // Check if all white in black home
  let whiteInHome = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (gameState.board[r][c] === 'white') whiteInHome++;
    }
  }
  if (whiteInHome === 9) {
    gameState.gameOver = true;
    gameState.winner = 'white';
  }
  // Check if all black in white home
  let blackInHome = 0;
  for (let r = 5; r < 8; r++) {
    for (let c = 5; c < 8; c++) {
      if (gameState.board[r][c] === 'black') blackInHome++;
    }
  }
  if (blackInHome === 9) {
    gameState.gameOver = true;
    gameState.winner = 'black';
  }
}

server.listen(process.env.PORT || 3000, () => {
  console.log('Server running on port', process.env.PORT || 3000);
});