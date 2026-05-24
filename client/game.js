const socket = io();

const TRAP_DEFS = [
  { type: 'pitfall',    emoji: '💀', name: '落とし穴',    desc: '3マス戻す' },
  { type: 'blockade',   emoji: '🚧', name: '通せんぼ',    desc: '次ターンお休み' },
  { type: 'headwind',   emoji: '💨', name: '逆風',        desc: '次サイコロ半減' },
  { type: 'swap',       emoji: '🔄', name: '入れ替え',    desc: '設置者と位置交換' },
  { type: 'redice',     emoji: '🎲', name: 'サイコロ返し', desc: '再振りして戻る' },
  { type: 'chain',      emoji: '🔗', name: '連鎖',        desc: '次ターン連鎖を強制配置' },
  { type: 'involveAll', emoji: '🌪️', name: '全員巻き込み', desc: '他の全員が2マス戻る' },
  { type: 'random',     emoji: '❓', name: 'ランダム',    desc: '効果は発動まで謎！' },
  { type: 'wander',     emoji: '🌀', name: 'ランダム移動', desc: '±1〜2マスランダム' },
  { type: 'gather',     emoji: '📣', name: '全員集合',    desc: '射程内の全員が設置者のマスへ' },
];

const state = {
  myId: null,
  room: null,
  selectedBoardSize: 20,
  selectedMaxRounds: 20,
  isAnimating: false,
};

let pendingRoomUpdate = null;
let roomListInterval = null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ========= Sound =========
let _audioCtx = null;
let soundEnabled = true;

function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function tone(freq, type, dur, vol = 0.3, delay = 0) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    gain.gain.setValueAtTime(vol, ctx.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + dur + 0.01);
  } catch (e) {}
}

const SFX = {
  diceRoll() {
    for (let i = 0; i < 8; i++) tone(160 + Math.random() * 80, 'square', 0.04, 0.1, i * 0.08);
  },
  diceLand(n) {
    tone(220 + n * 18, 'square', 0.1, 0.35);
    tone(110 + n * 9, 'triangle', 0.18, 0.25, 0.06);
  },
  step() {
    tone(650 + Math.random() * 80, 'sine', 0.05, 0.1);
  },
  place() {
    tone(880, 'sine', 0.06, 0.18); tone(660, 'sine', 0.09, 0.14, 0.05);
  },
  skip() {
    tone(320, 'sine', 0.12, 0.3); tone(240, 'sine', 0.18, 0.25, 0.1);
  },
  goal() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 'sine', 0.32, 0.45, i * 0.1));
  },
  trap(type) {
    const map = {
      pitfall:    () => { tone(300,'sawtooth',0.07,0.5); tone(200,'sawtooth',0.18,0.4,0.1); tone(130,'sawtooth',0.28,0.35,0.22); },
      blockade:   () => { tone(200,'square',0.22,0.5); tone(160,'square',0.14,0.3,0.12); },
      headwind:   () => { for (let i=0;i<6;i++) tone(220-i*12,'sawtooth',0.1,0.22,i*0.05); },
      swap:       () => { [700,500,700].forEach((f,i)=>tone(f,'sine',0.09,0.4,i*0.1)); },
      redice:     () => { [350,280,200].forEach((f,i)=>tone(f,'square',0.1,0.38,i*0.09)); },
      chain:      () => { [300,380,460,540].forEach((f,i)=>tone(f,'triangle',0.14,0.35,i*0.07)); },
      involveAll: () => { tone(180,'sawtooth',0.35,0.6); for (let i=0;i<4;i++) tone(140+i*15,'sawtooth',0.14,0.3,0.1+i*0.07); },
      random:     () => { for (let i=0;i<7;i++) tone(200+Math.random()*700,'sine',0.09,0.28,i*0.06); },
      wander:     () => { [350,280,420,300].forEach((f,i)=>tone(f,'sine',0.1,0.32,i*0.08)); },
      gather:     () => { [400,480,560,640,560].forEach((f,i)=>tone(f,'sine',0.13,0.42,i*0.08)); },
    };
    (map[type] || (() => tone(440,'square',0.25,0.4)))();
  },
};

document.getElementById('btn-sound').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('btn-sound');
  btn.textContent = soundEnabled ? '🔊' : '🔇';
  btn.classList.toggle('muted', !soundEnabled);
});

// ========= カウントダウン =========
let myTurnStartTime = null;
let countdownInterval = null;

function startCountdown() {
  if (myTurnStartTime) return; // すでに進行中
  myTurnStartTime = Date.now();
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(updateCountdown, 500);
}

function stopCountdown() {
  myTurnStartTime = null;
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  updateCountdown();
}

function updateCountdown() {
  const el = document.getElementById('kick-timer');
  if (!el) return;
  if (!myTurnStartTime) { el.textContent = ''; el.className = 'kick-timer'; return; }
  const remaining = Math.max(0, Math.ceil(60 - (Date.now() - myTurnStartTime) / 1000));
  el.textContent = `残り ${remaining}秒`;
  el.className = 'kick-timer' + (remaining <= 10 ? ' urgent' : '');
}

// ========= Room List =========
function startRoomListRefresh() {
  fetchRoomList();
  roomListInterval = setInterval(fetchRoomList, 5000);
}

function stopRoomListRefresh() {
  clearInterval(roomListInterval);
  roomListInterval = null;
}

function fetchRoomList() {
  socket.emit('get-rooms', rooms => renderRoomList(rooms));
}

function renderRoomList(rooms) {
  const el = document.getElementById('room-list');
  if (!el) return;
  if (!rooms.length) {
    el.innerHTML = '<div class="room-list-empty">公開ルームはありません</div>';
    return;
  }
  el.innerHTML = '';
  rooms.forEach(r => {
    const item = document.createElement('div');
    item.className = 'room-list-item';
    item.innerHTML = `
      <span class="rl-code">${r.code}</span>
      <span class="rl-info">${r.players}/4人 · ${r.boardSize}マス · ${r.maxRounds}R</span>
      <button class="rl-join" data-code="${r.code}">参加</button>
    `;
    el.appendChild(item);
  });
  el.querySelectorAll('.rl-join').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = getPlayerName();
      if (!name) return;
      const code = btn.dataset.code;
      socket.emit('join-room', { roomCode: code, playerName: name }, ({ roomCode, room, error, reconnectToken }) => {
        if (error) return showError(error);
        if (reconnectToken) localStorage.setItem('sugoroku_token', reconnectToken);
        stopRoomListRefresh();
        state.myId = socket.id;
        state.room = room;
        document.getElementById('room-code-display').textContent = roomCode || code;
        renderWaiting(room);
        showScreen('screen-waiting');
      });
    });
  });
}

// ========= Room Code Copy =========
document.getElementById('btn-refresh-rooms').addEventListener('click', fetchRoomList);

document.getElementById('btn-copy-code').addEventListener('click', () => {
  const code = document.getElementById('room-code-display').textContent.trim();
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    showNotification('コードをコピーしました！\n' + code, 1800);
  }).catch(() => {
    showNotification('コピーできませんでした\nコード: ' + code, 2500);
  });
});

// ========= Screen =========
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ========= Lobby: マス数・ラウンド上限選択 =========
document.querySelectorAll('.size-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedBoardSize = parseInt(btn.dataset.size);
  });
});

document.querySelectorAll('.round-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.round-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.selectedMaxRounds = parseInt(btn.dataset.rounds);
  });
});

// ========= Lobby =========
document.getElementById('btn-create').addEventListener('click', () => {
  const name = getPlayerName();
  if (!name) return;
  socket.emit('create-room', { playerName: name, boardSize: state.selectedBoardSize, maxRounds: state.selectedMaxRounds }, ({ roomCode, room, error, reconnectToken }) => {
    if (error) return showError(error);
    if (reconnectToken) localStorage.setItem('sugoroku_token', reconnectToken);
    stopRoomListRefresh();
    state.myId = socket.id;
    state.room = room;
    document.getElementById('room-code-display').textContent = roomCode;
    renderWaiting(room);
    showScreen('screen-waiting');
  });
});

document.getElementById('btn-join').addEventListener('click', () => {
  const name = getPlayerName();
  if (!name) return;
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (code.length !== 4) return showError('ルームコードは4文字です');
  socket.emit('join-room', { roomCode: code, playerName: name }, ({ roomCode, room, error, reconnectToken }) => {
    if (error) return showError(error);
    if (reconnectToken) localStorage.setItem('sugoroku_token', reconnectToken);
    stopRoomListRefresh();
    state.myId = socket.id;
    state.room = room;
    document.getElementById('room-code-display').textContent = roomCode || code;
    renderWaiting(room);
    showScreen('screen-waiting');
  });
});

document.getElementById('player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-create').click();
});
document.getElementById('room-code-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

// ========= Waiting Room =========
document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('start-game', ({ error }) => {
    if (error) showError(error);
  });
});

// ========= Socket Events =========
let wasConnected = false;

socket.on('connect', () => {
  state.myId = socket.id;
  if (wasConnected) {
    const token = localStorage.getItem('sugoroku_token');
    if (token) {
      socket.emit('reconnect-session', { token }, ({ roomCode, room, error }) => {
        if (error) {
          localStorage.removeItem('sugoroku_token');
          showNotification('再接続に失敗しました。ロビーへ戻ります...', 3000);
          setTimeout(() => location.reload(), 3000);
          return;
        }
        // 切断通知を消す
        document.getElementById('notification').classList.add('hidden');
        pendingRoomUpdate = null;
        state.isAnimating = false;
        state.myId = socket.id;
        state.room = room;
        document.getElementById('room-code-display').textContent = roomCode;
        if (room.status === 'lobby') {
          renderWaiting(room);
          showScreen('screen-waiting');
        } else {
          showScreen('screen-game');
          renderGame(room);
        }
        showNotification('再接続しました！', 2000);
      });
    } else {
      showNotification('接続が回復しました。ロビーへ戻ります...', 3000);
      setTimeout(() => location.reload(), 3000);
    }
  } else {
    startRoomListRefresh();
  }
  wasConnected = true;
});

socket.on('disconnect', () => {
  stopCountdown();
  showNotification('⚠️ サーバーとの接続が切れました\n再接続しています...', 60000);
});

socket.on('player-disconnected', ({ playerName }) => {
  showNotification(`⚠️ ${playerName} が切断しました\n90秒以内に再接続できます`, 6000);
});

function applyRoomUpdate(room) {
  // 自分のゴールを検出
  if (state.room) {
    const prev = state.room.players.find(p => p.id === state.myId);
    const next = room.players.find(p => p.id === state.myId);
    if (prev && next && !prev.finished && next.finished) SFX.goal();
  }
  state.room = room;
  const myPlayer = room.players.find(p => p.id === state.myId);
  const isMyTurn = myPlayer && !myPlayer.finished && (
    (room.status === 'action' && room.currentActionPlayerId === state.myId) ||
    (room.status === 'placement' && !room.myPlacedThisRound)
  );
  if (isMyTurn) startCountdown(); else stopCountdown();
  if (room.status === 'lobby') {
    renderWaiting(room);
    showScreen('screen-waiting');
  } else {
    showScreen('screen-game');
    renderGame(room);
  }
}

socket.on('room-update', (room) => {
  if (state.isAnimating) { pendingRoomUpdate = room; return; }
  applyRoomUpdate(room);
});

socket.on('kicked', ({ reason }) => {
  stopCountdown();
  localStorage.removeItem('sugoroku_token');
  showNotification(`⛔ キックされました\n${reason}`, 5000);
  setTimeout(() => location.reload(), 5000);
});

// ========= Game Render =========
function renderGame(room) {
  const roundText = room.maxRounds
    ? `ラウンド ${room.round} / ${room.maxRounds}`
    : `ラウンド ${room.round}`;
  document.getElementById('round-indicator').textContent = roundText;
  document.getElementById('phase-indicator').textContent = getPhaseText(room);
  renderBoard(room);
  renderPlayers(room);
  renderControls(room);
  renderLog(room);
}

function getPhaseText(room) {
  if (room.status === 'placement') return '🃏 配置フェーズ';
  if (room.status === 'action') {
    const current = room.players.find(p => p.id === room.currentActionPlayerId);
    return current ? `🎲 ${current.name} のターン` : '🎲 行動フェーズ';
  }
  if (room.status === 'finished') return '🏆 ゲーム終了';
  return '';
}

// ========= Board =========
function calcCellLayout(colCount) {
  const w = window.innerWidth;
  const gap = w <= 480 ? 2 : w <= 720 ? 3 : 5;
  const available = w - 48; // 画面幅 - スクリーンpadding - wrapperpadding
  const fitted = Math.floor((available - gap * (colCount - 1)) / colCount);
  const cellSize = Math.min(72, Math.max(36, fitted));
  const rowHeight = Math.round(cellSize * 1.17);
  return { cellSize, rowHeight, gap };
}

function renderBoard(room) {
  const boardEl = document.getElementById('board');
  boardEl.innerHTML = '';

  const bs = room.boardSize;
  const rowSplit = Math.floor(bs / 2);      // row1: 0〜rowSplit, row2: rowSplit+1〜bs
  const colCount = rowSplit + 1;
  const { cellSize, rowHeight, gap } = calcCellLayout(colCount);
  boardEl.style.gridTemplateColumns = `repeat(${colCount}, ${cellSize}px)`;
  boardEl.style.gridTemplateRows = `${rowHeight}px ${rowHeight}px`;
  boardEl.style.gap = `${gap}px`;

  const isPlacement = room.status === 'placement' && !room.myPlacedThisRound;
  const myPlayer = room.players.find(p => p.id === state.myId);
  const canPlace = isPlacement && myPlayer && !myPlayer.finished && room.myAssignedTrap;
  const pRange = room.myPlacementRange;

  for (let pos = 0; pos <= bs; pos++) {
    const cell = document.createElement('div');
    cell.className = 'board-cell';

    // グリッド配置: row1=0〜rowSplit(左→右), row2=rowSplit+1〜bs(右→左)
    const gridRow = pos <= rowSplit ? 1 : 2;
    const gridCol = pos <= rowSplit ? pos + 1 : bs - pos + 1;
    cell.style.gridRow = gridRow;
    cell.style.gridColumn = gridCol;

    if (pos === 0) cell.classList.add('start');
    else if (pos === bs) cell.classList.add('goal');

    const label = document.createElement('div');
    label.className = 'cell-label';
    label.textContent = pos === 0 ? 'S' : pos === bs ? 'G' : pos;
    cell.title = pos === 0 ? 'スタート' : pos === bs ? 'ゴール' : `${pos}マス目`;
    cell.appendChild(label);

    // 自分が置いた仕掛けのみ表示
    const sq = room.board[pos];
    if (sq && sq.myTrapCount > 0) {
      const trapDiv = document.createElement('div');
      trapDiv.className = 'trap-indicator my-trap';
      trapDiv.textContent = '📌'.repeat(Math.min(sq.myTrapCount, 3));
      trapDiv.title = `自分の仕掛け ${sq.myTrapCount}個`;
      cell.appendChild(trapDiv);
    }

    // プレイヤートークン
    const tokensHere = room.players.filter(p => p.finished ? pos === bs : p.position === pos);
    if (tokensHere.length > 0) {
      const tokensDiv = document.createElement('div');
      tokensDiv.className = 'player-tokens';
      for (const p of tokensHere) {
        const token = document.createElement('div');
        token.className = 'player-token';
        token.style.backgroundColor = p.color;
        token.title = p.name;
        token.dataset.pid = p.id;
        tokensDiv.appendChild(token);
      }
      cell.appendChild(tokensDiv);
    }

    // 配置クリック（自マス〜前方6マスのみ）
    if (canPlace && pRange && pos >= pRange.min && pos <= pRange.max) {
      cell.classList.add('placeable');
      cell.addEventListener('click', () => doPlaceTrap(pos));
    }

    boardEl.appendChild(cell);
  }
}

function doPlaceTrap(square) {
  if (state.isAnimating) return;
  stopCountdown();
  socket.emit('place-trap', { square }, ({ error }) => {
    if (error) { startCountdown(); return showError(error); }
    SFX.place();
    showNotification('仕掛けを設置しました！\n他の人を待っています...', 2000);
  });
}

// ========= Move Animation =========
async function animatePlayerMove(playerId, fromPos, toPos, baseRoom) {
  if (!baseRoom || fromPos === toPos) return;
  const tempPlayers = baseRoom.players.map(p => ({ ...p }));
  const tempRoom = { ...baseRoom, players: tempPlayers };
  const player = tempRoom.players.find(p => p.id === playerId);
  if (!player) return;

  const steps = Math.abs(toPos - fromPos);
  const dir = toPos > fromPos ? 1 : -1;
  const ms = steps >= 6 ? 100 : steps >= 4 ? 130 : 160;

  for (let i = 1; i <= steps; i++) {
    player.position = fromPos + dir * i;
    renderBoard(tempRoom);
    SFX.step();
    await sleep(ms);
  }
}

// ========= Trap Animations =========
function getTrapBase(type) {
  // 'swap-fail' → 'swap', 'gather-fail' → 'gather'
  return type.split('-')[0];
}

function showTrapReveal(r) {
  document.querySelectorAll('.trap-reveal').forEach(el => el.remove());
  const base = getTrapBase(r.type);
  const def = TRAP_DEFS.find(t => t.type === base) || TRAP_DEFS[0];
  const emoji = r.isRandom ? `❓→${def.emoji}` : def.emoji;

  const el = document.createElement('div');
  el.className = `trap-reveal trap-reveal-${base}`;
  el.innerHTML = `
    <div class="trap-reveal-emoji">${emoji}</div>
    <div class="trap-reveal-name">${def.name}</div>
    <div class="trap-reveal-placer">${escHtml(r.placerName)} の罠！</div>
  `;
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 2500);
}

function addTokenAnim(token, cls) {
  token.classList.add(cls);
  setTimeout(() => token.classList.remove(cls), 900);
}

async function animateTrapEffect(r) {
  const base = getTrapBase(r.type);
  SFX.trap(base);
  showTrapReveal(r);

  // トークンアニメーション
  if (r.type === 'involveAll') {
    document.querySelectorAll('.player-token').forEach(t => addTokenAnim(t, 'anim-trap-shake'));
  } else if (r.type === 'gather') {
    document.querySelectorAll('.player-token').forEach(t => addTokenAnim(t, 'anim-trap-gather'));
  } else {
    const token = document.querySelector(`.player-token[data-pid="${state.myId}"]`);
    if (token) addTokenAnim(token, `anim-trap-${base}`);
  }

  await sleep(1300);

  if (state.room) {
    // 単体移動系: roller のみ後退
    const singleMoveTypes = ['pitfall', 'redice', 'swap-fail', 'gather-fail', 'wander'];
    if (singleMoveTypes.includes(r.type) && r.oldPos !== undefined && r.newPos !== undefined && r.oldPos !== r.newPos) {
      const tempPlayers = state.room.players.map(p => ({ ...p }));
      const tempRoom = { ...state.room, players: tempPlayers };
      const player = tempRoom.players.find(p => p.id === state.myId);
      if (player) {
        player.position = r.oldPos;
        renderBoard(tempRoom);
        await sleep(120);
        await animatePlayerMove(state.myId, r.oldPos, r.newPos, tempRoom);
      }
    }

    // スワップ: roller と placer 両方を移動
    if (r.type === 'swap' && r.playerOldPos !== undefined && r.placerId) {
      const tempPlayers = state.room.players.map(p => ({
        ...p,
        position: p.id === state.myId ? r.playerOldPos : p.position,
      }));
      const tempRoom = { ...state.room, players: tempPlayers };
      renderBoard(tempRoom);
      await sleep(120);
      await animatePlayerMove(state.myId, r.playerOldPos, r.playerNewPos, tempRoom);
      const myInTemp = tempRoom.players.find(p => p.id === state.myId);
      if (myInTemp) myInTemp.position = r.playerNewPos;
      await animatePlayerMove(r.placerId, r.placerOldPos, r.placerNewPos, tempRoom);
    }

    // 全員巻き込み: 影響を受けた全プレイヤーを後退
    if (r.type === 'involveAll' && r.affectedDetails && r.affectedDetails.length > 0) {
      const posMap = Object.fromEntries(r.affectedDetails.map(a => [a.id, a.oldPos]));
      const tempPlayers = state.room.players.map(p => ({
        ...p,
        position: p.id === state.myId ? r.rollerPos
                : posMap[p.id] !== undefined ? posMap[p.id] : p.position,
      }));
      const tempRoom = { ...state.room, players: tempPlayers };
      renderBoard(tempRoom);
      await sleep(150);
      for (const a of r.affectedDetails) {
        if (a.oldPos !== a.newPos) {
          await animatePlayerMove(a.id, a.oldPos, a.newPos, tempRoom);
          const tp = tempRoom.players.find(p => p.id === a.id);
          if (tp) tp.position = a.newPos;
        }
      }
    }

    // 全員集合: 全プレイヤーが gatherPos へ移動
    if (r.type === 'gather' && r.gatheredDetails && r.gatheredDetails.length > 0) {
      const posMap = Object.fromEntries(r.gatheredDetails.map(a => [a.id, a.oldPos]));
      const tempPlayers = state.room.players.map(p => ({
        ...p,
        position: posMap[p.id] !== undefined ? posMap[p.id] : p.position,
      }));
      const tempRoom = { ...state.room, players: tempPlayers };
      renderBoard(tempRoom);
      await sleep(150);
      for (const a of r.gatheredDetails) {
        if (a.oldPos !== a.newPos) {
          await animatePlayerMove(a.id, a.oldPos, a.newPos, tempRoom);
          const tp = tempRoom.players.find(p => p.id === a.id);
          if (tp) tp.position = a.newPos;
        }
      }
    }
  }

  await sleep(400);
}

// ========= Players Panel =========
function renderPlayers(room) {
  const list = document.getElementById('players-list');
  list.innerHTML = '';
  for (const p of room.players) {
    const entry = document.createElement('div');
    entry.className = 'player-entry';
    if (p.id === room.currentActionPlayerId) entry.classList.add('current-turn');
    if (p.finished) entry.classList.add('finished');

    const statuses = [];
    if (p.finished) statuses.push(`${p.finishRank}位 🏁`);
    if (p.skipNextTurn) statuses.push('お休み');
    if (p.halfDice) statuses.push('逆風中');

    const isSelf = p.id === state.myId;
    entry.innerHTML = `
      <div class="p-token" style="background:${p.color}"></div>
      <div class="p-info">
        <div class="p-name">${isSelf ? '★ ' : ''}${escHtml(p.name)}</div>
        <div class="p-pos">${p.finished ? 'GOAL' : `${p.position}マス目`}</div>
      </div>
      ${statuses.length ? `<div class="p-status">${statuses.join(' ')}</div>` : ''}
    `;
    list.appendChild(entry);
  }
}

// ========= Controls =========
function renderControls(room) {
  const panel = document.getElementById('control-panel');
  panel.innerHTML = '';

  const myPlayer = room.players.find(p => p.id === state.myId);
  if (!myPlayer) return;

  if (room.status === 'finished') {
    renderFinishScreen(panel, room);
    return;
  }

  if (myPlayer.finished) {
    panel.innerHTML = `<div class="watching-turn">🏁 ${myPlayer.finishRank}位でゴール！ 観戦中...</div>`;
    return;
  }

  if (room.status === 'placement') {
    if (room.myPlacedThisRound) {
      const waiting = room.waitingForPlacement;
      panel.innerHTML = `<div class="waiting-turn">⏳ 待機中... あと ${waiting.length}人 (${waiting.map(n => escHtml(n)).join(', ')})</div>`;
    } else {
      renderTrapSelection(panel, room);
    }
    return;
  }

  if (room.status === 'action') {
    if (room.currentActionPlayerId === state.myId) {
      renderDiceRoll(panel);
    } else {
      const current = room.players.find(p => p.id === room.currentActionPlayerId);
      panel.innerHTML = `<div class="waiting-turn">⏳ ${current ? escHtml(current.name) : '?'} のターンです...</div>`;
    }
  }
}

function renderTrapSelection(panel, room) {
  const trapType = room.myAssignedTrap;
  const def = TRAP_DEFS.find(t => t.type === trapType);
  if (!def) return;

  const isChain = !!room.myForcedTrapType;
  const pRange = room.myPlacementRange;

  const wrap = document.createElement('div');
  wrap.className = 'trap-selection';

  // ヘッダー
  const header = document.createElement('div');
  header.className = 'trap-selection-title';
  header.textContent = isChain
    ? '🔗 連鎖中！以下の仕掛けが配布されました'
    : '今ターンの仕掛けが配布されました';
  wrap.appendChild(header);

  // 配布されたトラップカード
  const card = document.createElement('div');
  card.className = 'assigned-trap-card';
  card.innerHTML = `
    <span class="trap-card-emoji">${def.emoji}</span>
    <div class="trap-card-info">
      <div class="trap-card-name">${def.name}</div>
      <div class="trap-card-desc">${def.desc}</div>
    </div>
  `;
  wrap.appendChild(card);

  // 配置指示
  const hint = document.createElement('div');
  hint.className = 'trap-placement-hint';
  hint.textContent = pRange
    ? `👆 ${pRange.min}〜${pRange.max}マス目の緑マスをクリックして設置`
    : '設置できるマスがありません';
  wrap.appendChild(hint);

  const timer = document.createElement('div');
  timer.id = 'kick-timer';
  timer.className = 'kick-timer';
  wrap.appendChild(timer);
  updateCountdown();

  panel.appendChild(wrap);
}

function renderDiceRoll(panel) {
  const wrap = document.createElement('div');
  wrap.className = 'dice-section';

  const display = document.createElement('div');
  display.className = 'dice-display';
  display.textContent = '🎲';

  const rollBtn = document.createElement('button');
  rollBtn.className = 'btn-dice';
  rollBtn.textContent = 'サイコロを振る！';

  rollBtn.addEventListener('click', async () => {
    if (state.isAnimating) return;
    state.isAnimating = true;
    stopCountdown();
    rollBtn.disabled = true;

    const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

    // サイコロ回転アニメーション
    SFX.diceRoll();
    await new Promise(resolve => {
      let count = 0;
      const interval = setInterval(() => {
        display.textContent = faces[Math.floor(Math.random() * 6)];
        if (++count >= 10) { clearInterval(interval); resolve(); }
      }, 75);
    });

    // サーバーへロール
    const result = await new Promise(resolve => socket.emit('roll-dice', resolve));
    const { diceResult, skipped, trapResults, error } = result;

    if (error) { state.isAnimating = false; showError(error); return; }

    if (skipped) {
      display.textContent = '💤';
      SFX.skip();
      await sleep(800);
    } else if (diceResult) {
      display.textContent = faces[diceResult - 1];
      SFX.diceLand(diceResult);
      // コマ移動アニメーション
      const myPlayer = state.room?.players.find(p => p.id === state.myId);
      if (myPlayer && state.room) {
        const fromPos = myPlayer.position;
        const toPos = Math.min(fromPos + diceResult, state.room.boardSize);
        if (toPos > fromPos) {
          await animatePlayerMove(state.myId, fromPos, toPos, state.room);
        }
      }
    }

    // トラップ演出
    if (trapResults && trapResults.length > 0) {
      for (const r of trapResults) {
        await animateTrapEffect(r);
      }
    }

    state.isAnimating = false;

    // キューに積まれた room-update を適用
    if (pendingRoomUpdate) {
      const room = pendingRoomUpdate;
      pendingRoomUpdate = null;
      applyRoomUpdate(room);
    }
  });

  const timer = document.createElement('div');
  timer.id = 'kick-timer';
  timer.className = 'kick-timer';

  wrap.appendChild(display);
  wrap.appendChild(rollBtn);
  wrap.appendChild(timer);
  updateCountdown();
  panel.appendChild(wrap);
}

function renderFinishScreen(panel, room) {
  const sorted = [...room.players].sort((a, b) => (a.finishRank ?? 99) - (b.finishRank ?? 99));
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];

  const wrap = document.createElement('div');
  wrap.className = 'finish-screen';
  wrap.innerHTML = '<h2>🏆 ゲーム終了！</h2>';

  const ranking = document.createElement('div');
  ranking.className = 'finish-ranking';
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const item = document.createElement('div');
    item.className = 'finish-rank-item';
    item.innerHTML = `
      <span>${medals[i] || (i + 1) + '位'}</span>
      <div class="p-token" style="background:${p.color}"></div>
      <span style="font-weight:bold;color:${p.color}">${escHtml(p.name)}</span>
    `;
    ranking.appendChild(item);
  }
  wrap.appendChild(ranking);

  const isHost = state.myId === room.hostId;

  if (isHost) {
    const rematchBtn = document.createElement('button');
    rematchBtn.className = 'btn btn-primary';
    rematchBtn.style.maxWidth = '260px';
    rematchBtn.textContent = 'もう一度（同じメンバーで）';
    rematchBtn.addEventListener('click', () => {
      rematchBtn.disabled = true;
      socket.emit('restart-game', ({ error }) => {
        if (error) { rematchBtn.disabled = false; showError(error); }
      });
    });
    wrap.appendChild(rematchBtn);
  }

  const leaveBtn = document.createElement('button');
  leaveBtn.className = 'btn btn-secondary';
  leaveBtn.style.maxWidth = '220px';
  leaveBtn.textContent = 'ロビーに戻る';
  leaveBtn.addEventListener('click', () => {
    localStorage.removeItem('sugoroku_token');
    location.reload();
  });
  wrap.appendChild(leaveBtn);

  panel.appendChild(wrap);
}

// ========= Log =========
function renderLog(room) {
  const logDiv = document.getElementById('game-log');
  logDiv.innerHTML = room.log.map(text => `<div class="log-entry">${escHtml(text)}</div>`).join('');
}

// ========= Waiting Room =========
function renderWaiting(room) {
  const playersDiv = document.getElementById('waiting-players');
  const startBtn = document.getElementById('btn-start');
  const waitingMsg = document.getElementById('waiting-message');

  playersDiv.innerHTML = room.players.map(p => `
    <div class="waiting-player">
      <div class="player-dot" style="background:${p.color}"></div>
      <span>${escHtml(p.name)}${p.id === room.hostId ? ' 👑' : ''}</span>
    </div>
  `).join('');

  // ボードサイズ表示
  if (room.boardSize) {
    let sizeEl = document.getElementById('waiting-boardsize');
    if (!sizeEl) {
      sizeEl = document.createElement('p');
      sizeEl.id = 'waiting-boardsize';
      sizeEl.style.cssText = 'color:#888;font-size:0.82rem;margin-bottom:12px';
      playersDiv.after(sizeEl);
    }
    sizeEl.textContent = `マス数：${room.boardSize}マス　上限：${room.maxRounds}ラウンド`;
  }

  if (state.myId === room.hostId) {
    startBtn.style.display = 'block';
    startBtn.disabled = room.players.length < 2;
    waitingMsg.textContent = room.players.length < 2
      ? 'あと1人以上参加を待っています...'
      : `${room.players.length}人参加中。ゲームを開始できます！`;
  } else {
    startBtn.style.display = 'none';
    waitingMsg.textContent = 'ホストがゲームを開始するまでお待ちください';
  }
}

// ========= Trap Notifications =========
function showTrapNotification(r) {
  const base = r.isRandom ? `❓ ランダム発動！\n→ ` : '';
  const msgs = {
    pitfall:      `${base}💀 落とし穴！\n${r.placerName} の罠！\n${r.oldPos} → ${r.newPos} マス目`,
    blockade:     `${base}🚧 通せんぼ！\n${r.placerName} の罠！\n次のターンお休み`,
    headwind:     `${base}💨 逆風！\n${r.placerName} の罠！\n次のサイコロが半減`,
    swap:         `${base}🔄 入れ替え！\n${r.placerName} の罠！\n位置が入れ替わった！`,
    'swap-fail':  `${base}🔄 入れ替え失敗→落とし穴！\n${r.oldPos} → ${r.newPos} マス目`,
    redice:       `${base}🎲 サイコロ返し！\n${r.placerName} の罠！\nさらに ${r.penalty} マス戻った！`,
    chain:        `${base}🔗 連鎖！\n${r.placerName} の罠！\n次の配置フェーズで連鎖を強制配置！`,
    involveAll:   `${base}🌪️ 全員巻き込み！\n${r.placerName} の罠！\n他の全員が2マス戻る！`,
    wander:       `${base}🌀 ランダム移動！\n${r.placerName} の罠！\n${r.delta > 0 ? '+' : ''}${r.delta}マス移動 (${r.oldPos}→${r.newPos})`,
    gather:       `${base}📣 全員集合！\n${r.placerName} の罠！\n全員が ${r.gatherPos}マス目に集結！`,
    'gather-fail': `${base}📣 全員集合→落とし穴！\n設置者ゴール済みのため\n${r.oldPos} → ${r.newPos} マス目`,
  };
  showNotification(msgs[r.type] || '仕掛けが発動！', 3500);
}

function showNotification(msg, duration = 2500) {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), duration);
}

function showError(msg) { showNotification('⚠️ ' + msg, 3000); }

// ========= Trap Guide =========
document.getElementById('btn-trap-guide').addEventListener('click', () => {
  const modal = document.getElementById('trap-guide-modal');
  const list = document.getElementById('trap-guide-list');
  list.innerHTML = TRAP_DEFS.map(t => `
    <div class="tg-item">
      <span class="tg-emoji">${t.emoji}</span>
      <div class="tg-info">
        <div class="tg-name">${escHtml(t.name)}</div>
        <div class="tg-desc">${escHtml(t.desc)}</div>
      </div>
    </div>
  `).join('');
  modal.classList.remove('hidden');
});

document.getElementById('btn-close-guide').addEventListener('click', () => {
  document.getElementById('trap-guide-modal').classList.add('hidden');
});

document.getElementById('trap-guide-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

function getPlayerName() {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { showError('名前を入力してください'); return null; }
  return name;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str)));
  return d.innerHTML;
}
