// 定数・変数定義
const N = 8, EMPTY = 0, BLACK = 1, WHITE = 2;
let board = [], currentPlayer, humanColor = BLACK;
let qTable = {}, epsilon = 0.2, alpha = 0.1, gamma = 0.9;
let trainingMode = false, gameHistory = [];
let dashboard = { total: 0, wins: 0, aiGames: 0 };

// 初期化：localStorage からの読み込み
function initQTable() {
  const raw = localStorage.getItem('othelloQ');
  if (raw) qTable = JSON.parse(raw);
}
function initDashboard() {
  const raw = localStorage.getItem('othelloDash');
  if (raw) {
    const obj = JSON.parse(raw);
    dashboard.total = obj.total || 0;
    dashboard.wins  = obj.wins  || 0;
    dashboard.aiGames = obj.aiGames || 0;
  }
  updateDashboard();
}
function initAIName() {
  const aiName = localStorage.getItem('othelloAIName');
  if (aiName) document.getElementById('aiName').value = aiName;
}

// 保存
function saveQTable() {
  localStorage.setItem('othelloQ', JSON.stringify(qTable));
}
function saveDashboard() {
  localStorage.setItem('othelloDash', JSON.stringify(dashboard));
}

// ダッシュボード表示更新
function updateDashboard() {
  document.getElementById('totalGames').textContent = dashboard.total;
  const rate = dashboard.total
    ? (dashboard.wins / dashboard.total * 100).toFixed(1)
    : 0;
  document.getElementById('winRate').textContent = rate + '%';
  document.getElementById('aiGamesCount').textContent = dashboard.aiGames;
}

// AI名前保存
function saveAIName(name) {
  localStorage.setItem('othelloAIName', name);
}

// ゲームリセット
function resetGame() {
  board = Array(N*N).fill(EMPTY);
  board[3*8+3] = WHITE;  board[3*8+4] = BLACK;
  board[4*8+3] = BLACK;  board[4*8+4] = WHITE;
  currentPlayer = BLACK;
  gameHistory = [];
  drawBoard();
  updateInfo();
  if (trainingMode && currentPlayer !== humanColor) {
    aiMove();
  }
}

// 盤面描画
function drawBoard() {
  const container = document.getElementById('board');
  container.innerHTML = '';
  for (let i = 0; i < N*N; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.idx = i;
    if (board[i] === BLACK) cell.classList.add('black');
    else if (board[i] === WHITE) cell.classList.add('white');
    if (legalMoves(board, currentPlayer).includes(i)) {
      cell.classList.add('highlight');
    }
    cell.addEventListener('click', () => onCellClick(i));
    container.appendChild(cell);
  }
}

// 人間クリック処理
function onCellClick(idx) {
  if (currentPlayer === humanColor) makeMove(idx);
}

// 石を置く／反転
function makeMove(idx) {
  const flips = getFlips(board, idx, currentPlayer);
  if (!flips.length) return;
  document.getElementById('placeSound').play();
  gameHistory.push({
    state: board.join(''),
    action: idx,
    player: currentPlayer
  });
  flips.forEach(i => board[i] = currentPlayer);
  board[idx] = currentPlayer;
  currentPlayer = 3 - currentPlayer;
  drawBoard();
  updateInfo();
  if (isGameOver()) endGame();
  else if (trainingMode || currentPlayer !== humanColor) aiMove();
}

// AIの一手
function aiMove() {
  const state = board.join('');
  const moves = legalMoves(board, currentPlayer);
  if (!moves.length) {
    currentPlayer = 3 - currentPlayer;
    drawBoard(); updateInfo();
    if (isGameOver()) endGame();
    else aiMove();
    return;
  }
  const action = chooseAction(state, moves);
  makeMove(action);
}

// ε-greedy で行動選択
function chooseAction(state, moves) {
  if (Math.random() < epsilon) {
    return moves[Math.floor(Math.random() * moves.length)];
  }
  let best = -Infinity, bestAct = moves[0];
  moves.forEach(m => {
    const key = state + '_' + m;
    const val = qTable[key] || 0;
    if (val > best) { best = val; bestAct = m; }
  });
  return bestAct;
}

// ゲーム終了判定
function isGameOver() {
  return !legalMoves(board, BLACK).length && !legalMoves(board, WHITE).length;
}

// 終局処理
function endGame() {
  const cnt = [0,0,0];
  board.forEach(c => cnt[c]++);
  const winner = cnt[BLACK] > cnt[WHITE]
    ? BLACK : cnt[WHITE] > cnt[BLACK] ? WHITE : 0;
  const aiName = document.getElementById('aiName').value || 'AI';
  const status = document.getElementById('status');

  if (winner === 0) status.textContent = '引き分け';
  else if (winner === humanColor) status.textContent = 'あなたの勝ち！';
  else status.textContent = `${aiName}の勝ち`;

  // ダッシュボード更新
  dashboard.total++;
  if (winner === humanColor) dashboard.wins++;
  if (trainingMode) {
    dashboard.aiGames++;
    saveDashboard();
  }
  updateDashboard();

  // Q学習更新
  if (trainingMode) updateQValues(winner);
  saveQTable();
}

// Q学習の更新
function updateQValues(winner) {
  const reward = winner === humanColor ? -1
               : winner === 0          ?  0
               :                           1;
  for (let i = gameHistory.length - 1; i >= 0; i--) {
    const {state, action} = gameHistory[i];
    const key = state + '_' + action;
    const next = gameHistory[i+1]?.state || null;
    const maxNext = next
      ? Math.max(
          ...legalMoves(next.split('').map(Number), 3-currentPlayer)
            .map(a => qTable[next + '_' + a] || 0)
        )
      : 0;
    const old = qTable[key] || 0;
    qTable[key] = old + alpha * (reward + gamma * maxNext - old);
  }
}

// 合法手リスト取得
function legalMoves(bd, color) {
  const moves = [];
  for (let i = 0; i < bd.length; i++) {
    if (getFlips(bd, i, color).length) moves.push(i);
  }
  return moves;
}

// 反転対象セル取得
function getFlips(bd, idx, color) {
  if (bd[idx] !== EMPTY) return [];
  const opp = 3 - color, res = [];
  const dirs = [-1,-8,-7,-9,1,8,7,9];
  dirs.forEach(d => {
    const line = [];
    let i = idx + d;
    while (
      i >= 0 && i < bd.length &&
      bd[i] === opp &&
      ((d === 1 || d === -1)
        ? Math.floor(i/8) === Math.floor((i-d)/8)
        : true)
    ) {
      line.push(i);
      i += d;
    }
    if (i >=0 && i < bd.length && bd[i] === color && line.length) {
      res.push(...line);
    }
  });
  if (res.length) document.getElementById('flipSound').play();
  return res;
}

// 情報表示更新
function updateInfo() {
  const cnt = [0,0,0];
  board.forEach(c => cnt[c]++);
  document.getElementById('score').textContent =
    `黒: ${cnt[BLACK]}  白: ${cnt[WHITE]}`;
}

// イベントバインド
document.getElementById('startBtn')
  .addEventListener('click', () => {
    trainingMode = false;
    humanColor = BLACK;
    resetGame();
  });
document.getElementById('trainBtn')
  .addEventListener('click', () => {
    trainingMode = true;
    humanColor = BLACK;
    resetGame();
  });
document.getElementById('resetAIBtn')
  .addEventListener('click', () => {
    if (confirm('AIの学習データをリセットしますか？')) {
      qTable = {};
      dashboard.aiGames = 0;
      saveQTable();
      saveDashboard();
      updateDashboard();
      alert('AIをリセットしました。');
    }
  });
document.getElementById('aiName')
  .addEventListener('change', e => saveAIName(e.target.value));

// 初期化実行
initQTable();
initDashboard();
initAIName();
resetGame();
