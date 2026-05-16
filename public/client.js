const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(protocol + '//' + window.location.host);
let myId = null;
let myColor = null;
let selected = null;
let gameState = null;
let markCircles = new Set();
let arrows = [];
let rightDragStart = null;

document.addEventListener('mouseup', (e) => {
  if (e.button === 2) {
    rightDragStart = null;
  }
});

ws.onopen = () => {
  console.log('WebSocket connected');
  myId = localStorage.getItem('ugolkiId') || generateId();
  const name = localStorage.getItem('ugolkiName') || 'Player';
  ws.send(JSON.stringify({ type: 'join', id: myId, name }));
  document.getElementById('nameInput').value = name;
};

ws.onclose = () => {
  console.log('WebSocket closed');
};

ws.onerror = (error) => {
  console.log('WebSocket error:', error);
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
  if (data.type === 'joined') {
    myId = data.id;
    myColor = data.color;
    gameState = data.gameState;
    clearAnnotations();
    localStorage.setItem('ugolkiId', myId);
    drawBoard();
    updateStatus();
  } else if (data.type === 'update') {
    gameState = data.gameState;
    clearAnnotations();
    drawBoard();
    updateStatus();
    if (gameState.gameOver) {
      if (gameState.winner === myColor) {
        alert('Вы победили!');
      } else {
        alert('Вы проиграли!');
      }
    }
  } else if (data.type === 'players') {
    drawPlayers(data.players);
  }
};

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function clearAnnotations() {
  markCircles.clear();
  arrows = [];
  rightDragStart = null;
}

function getCellKey(r, c) {
  return `${r},${c}`;
}

function toggleCircle(r, c) {
  const key = getCellKey(r, c);
  if (markCircles.has(key)) {
    markCircles.delete(key);
  } else {
    markCircles.add(key);
  }
  drawBoard();
}

function addArrow(from, to) {
  arrows.push({ from, to });
  drawBoard();
}

function drawBoard() {
  console.log('Drawing board, gameState:', gameState);
  if (!gameState || !gameState.board) {
    console.log('No gameState or board');
    return;
  }
  const boardEl = document.getElementById('board');
  const arrowLayer = document.getElementById('arrowLayer');
  boardEl.innerHTML = '';
  arrowLayer.innerHTML = '';

  const possibleMoves = selected ? getPossibleMoves(selected[0], selected[1]) : [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      if (gameState.board[r][c]) {
        cell.classList.add(gameState.board[r][c]);
        const piece = document.createElement('div');
        piece.className = 'piece';
        cell.appendChild(piece);
      }
      if (selected && selected[0] === r && selected[1] === c) {
        cell.classList.add('selected');
      }
      if (possibleMoves.some(([pr, pc]) => pr === r && pc === c)) {
        cell.style.backgroundColor = '#cfc';
      }
      cell.onclick = () => handleClick(r, c);
      cell.oncontextmenu = (e) => e.preventDefault();
      cell.onmousedown = (e) => {
        if (e.button === 2) {
          rightDragStart = [r, c];
        }
      };
      cell.onmouseup = (e) => {
        if (e.button === 2 && rightDragStart) {
          if (rightDragStart[0] === r && rightDragStart[1] === c) {
            toggleCircle(r, c);
          } else {
            addArrow(rightDragStart, [r, c]);
          }
          rightDragStart = null;
        }
      };
      boardEl.appendChild(cell);
    }
  }
  drawAnnotations();
}

function drawAnnotations() {
  const boardEl = document.getElementById('board');
  const arrowLayer = document.getElementById('arrowLayer');
  const boardRect = boardEl.getBoundingClientRect();
  const cellSize = boardRect.width / 8;

  markCircles.forEach((key) => {
    const [r, c] = key.split(',').map(Number);
    const circle = document.createElement('div');
    circle.className = 'annotation-circle';
    circle.style.left = `${c * cellSize + cellSize / 2}px`;
    circle.style.top = `${r * cellSize + cellSize / 2}px`;
    arrowLayer.appendChild(circle);
  });

  arrows.forEach(({ from, to }) => {
    const [fr, fc] = from;
    const [tr, tc] = to;
    const startX = fc * cellSize + cellSize / 2;
    const startY = fr * cellSize + cellSize / 2;
    const endX = tc * cellSize + cellSize / 2;
    const endY = tr * cellSize + cellSize / 2;
    const dx = endX - startX;
    const dy = endY - startY;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    const line = document.createElement('div');
    line.className = 'annotation-arrow';
    line.style.width = `${length}px`;
    line.style.left = `${startX}px`;
    line.style.top = `${startY - 2}px`;
    line.style.transform = `rotate(${angle}rad)`;
    arrowLayer.appendChild(line);

    const head = document.createElement('div');
    head.className = 'annotation-arrow-head';
    head.style.left = `${endX}px`;
    head.style.top = `${endY}px`;
    head.style.transform = `rotate(${angle}rad)`;
    arrowLayer.appendChild(head);
  });
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

function handleClick(r, c) {
  if (!myColor || gameState.currentPlayer !== myColor || gameState.gameOver) return;
  if (selected) {
    // Try to move
    ws.send(JSON.stringify({ type: 'move', from: selected, to: [r, c] }));
    selected = null;
  } else {
    // Select piece
    if (gameState.board[r][c] === myColor) {
      selected = [r, c];
    }
  }
  drawBoard();
}

function drawPlayers(players) {
  const playersEl = document.getElementById('players');
  playersEl.innerHTML = '<h3>Игроки</h3>';
  players.forEach(player => {
    const div = document.createElement('div');
    div.className = 'player';
    const status = document.createElement('div');
    status.className = `status ${player.status}`;
    const name = document.createTextNode(`${player.name} (${player.color})`);
    div.appendChild(status);
    div.appendChild(name);
    playersEl.appendChild(div);
  });
}

function updateStatus() {
  const statusEl = document.getElementById('status');
  if (gameState.gameOver) {
    statusEl.textContent = `Game over! Winner: ${gameState.winner}`;
  } else {
    statusEl.textContent = `Current player: ${gameState.currentPlayer}`;
  }
}

document.getElementById('renameBtn').onclick = () => {
  const name = document.getElementById('nameInput').value;
  localStorage.setItem('ugolkiName', name);
  ws.send(JSON.stringify({ type: 'rename', name }));
};