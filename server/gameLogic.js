const VALID_BOARD_SIZES = [15, 20, 30];
const TRAP_TYPES = ['pitfall', 'blockade', 'headwind', 'swap', 'redice', 'chain', 'involveAll', 'random', 'wander', 'gather'];
const TRAP_NAMES = {
  pitfall:    '落とし穴',
  blockade:   '通せんぼ',
  headwind:   '逆風',
  swap:       '入れ替え',
  redice:     'サイコロ返し',
  chain:      '連鎖',
  involveAll: '全員巻き込み',
  random:     'ランダム',
  wander:     'ランダム移動',
  gather:     '全員集合',
};
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'];
const RANDOM_POOL = TRAP_TYPES.filter(t => t !== 'random');

const rooms = new Map();
const socketToRoom = new Map();

// ========= ユーティリティ =========
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function createPlayer(id, name, colorIndex) {
  return {
    id,
    name,
    position: 0,
    color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length],
    skipNextTurn: false,
    halfDice: false,
    finished: false,
    finishRank: null,
    chainTrapType: null,
  };
}

// ========= ルーム管理 =========
const VALID_MAX_ROUNDS = [10, 20, 30, 50];

function createRoom(socketId, playerName, boardSize = 20, maxRounds = 20) {
  const size = VALID_BOARD_SIZES.includes(boardSize) ? boardSize : 20;
  const rounds = VALID_MAX_ROUNDS.includes(maxRounds) ? maxRounds : 20;
  const code = generateRoomCode();
  const room = {
    code,
    hostId: socketId,
    status: 'lobby',
    boardSize: size,
    maxRounds: rounds,
    players: [createPlayer(socketId, playerName, 0)],
    traps: Array.from({ length: size + 1 }, () => []),
    round: 1,
    placedThisRound: new Set(),
    actionOrder: [],
    currentActionIndex: 0,
    finishCount: 0,
    log: [],
  };
  rooms.set(code, room);
  socketToRoom.set(socketId, code);
  return { roomCode: code, room };
}

function joinRoom(socketId, roomCode, playerName) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'ルームが見つかりません' };
  if (room.status !== 'lobby') return { error: 'ゲームはすでに始まっています' };
  if (room.players.length >= 4) return { error: 'ルームが満員です' };
  if (room.players.some(p => p.name === playerName)) return { error: `「${playerName}」は既に使われています` };
  room.players.push(createPlayer(socketId, playerName, room.players.length));
  socketToRoom.set(socketId, roomCode);
  return { room };
}

function startGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'ルームが見つかりません' };
  room.status = 'placement';
  room.round = 1;
  room.placedThisRound = new Set();
  room.actionOrder = shuffleArray(room.players.map(p => p.id));
  room.currentActionIndex = 0;
  assignTrapsForRound(room);
  addLog(room, 'ゲームスタート！まず仕掛けを配置してください。');
  logTurnOrder(room);
  return { room };
}

// 各プレイヤーにランダムトラップを配布（連鎖中はそちら優先）
function assignTrapsForRound(room) {
  for (const p of room.players) {
    if (p.finished) { p.assignedTrap = null; continue; }
    if (p.chainTrapType) {
      p.assignedTrap = p.chainTrapType;
    } else {
      p.assignedTrap = TRAP_TYPES[Math.floor(Math.random() * TRAP_TYPES.length)];
    }
  }
}

function logTurnOrder(room) {
  const order = room.actionOrder
    .map(id => room.players.find(p => p.id === id)?.name || '?')
    .join(' → ');
  addLog(room, `🔀 ターン順：${order}`);
}

// ========= 配置フェーズ =========
function placeTrap(socketId, square) {
  const room = getRoomBySocketId(socketId);
  if (!room) return { error: 'ルームが見つかりません' };
  if (room.status !== 'placement') return { error: '配置フェーズではありません' };
  if (room.placedThisRound.has(socketId)) return { error: 'すでに配置しました' };

  const player = room.players.find(p => p.id === socketId);
  if (!player) return { error: 'プレイヤーが見つかりません' };
  if (player.finished) return { error: 'ゴール済みです' };

  // 配置範囲チェック：自マス〜前方6マス（ゴール・スタートは除外）
  const minSquare = Math.max(1, player.position);
  const maxSquare = Math.min(player.position + 6, room.boardSize - 1);
  if (square < minSquare || square > maxSquare) {
    return { error: `配置できるのは${minSquare}〜${maxSquare}マスです` };
  }

  const trapType = player.assignedTrap;
  if (!trapType) return { error: '仕掛けが割り当てられていません' };

  if (player.chainTrapType) player.chainTrapType = null;

  room.traps[square].push({ placerId: socketId, trapType, round: room.round });
  room.placedThisRound.add(socketId);
  addLog(room, `${player.name} が仕掛けを設置しました`);
  checkAllPlaced(room);
  return { room };
}

function checkAllPlaced(room) {
  const activePlayers = room.players.filter(p => !p.finished);
  if (activePlayers.every(p => room.placedThisRound.has(p.id))) {
    room.status = 'action';
    room.actionOrder = room.actionOrder.filter(id => {
      const p = room.players.find(p => p.id === id);
      return p && !p.finished;
    });
    room.currentActionIndex = 0;
    addLog(room, '全員配置完了！行動フェーズ開始。');
  }
}

// ========= 行動フェーズ =========
function rollDice(socketId) {
  const room = getRoomBySocketId(socketId);
  if (!room) return { error: 'ルームが見つかりません' };
  if (room.status !== 'action') return { error: '行動フェーズではありません' };

  const currentPlayerId = room.actionOrder[room.currentActionIndex];
  if (currentPlayerId !== socketId) return { error: 'あなたのターンではありません' };

  const player = room.players.find(p => p.id === socketId);
  if (!player) return { error: 'プレイヤーが見つかりません' };

  let diceResult = null;
  let skipped = false;
  let trapResults = null;

  if (player.skipNextTurn) {
    player.skipNextTurn = false;
    skipped = true;
    addLog(room, `${player.name} は通せんぼでお休み！`);
  } else {
    diceResult = Math.floor(Math.random() * 6) + 1;

    if (player.halfDice) {
      diceResult = Math.max(1, Math.floor(diceResult / 2));
      player.halfDice = false;
      addLog(room, `${player.name} は逆風中！サイコロが ${diceResult} に半減`);
    }

    const oldPosition = player.position;
    player.position = Math.min(player.position + diceResult, room.boardSize);
    addLog(room, `${player.name} が ${diceResult} を出した！(${oldPosition} → ${player.position})`);

    checkGoal(room, player);

    // 仕掛けチェック（連鎖あり、最大3回）
    if (!player.finished) {
      trapResults = triggerTrapsChain(room, player);
      if (trapResults.length === 0) trapResults = null;
    }
  }

  if (checkGameEnd(room)) {
    // checkGameEnd内でstatus='finished'とログ出力済み
  } else {
    advanceAction(room);
  }

  return { room, diceResult, skipped, trapResults };
}

// ゴール判定（ゴール済みは完全無敵）
function checkGoal(room, player) {
  if (player.finished) return;
  if (player.position >= room.boardSize) {
    player.position = room.boardSize;
    player.finished = true;
    room.finishCount++;
    player.finishRank = room.finishCount;
    addLog(room, `🎉 ${player.name} がゴール！ ${player.finishRank}位`);
  }
}

// ゲーム終了判定（全員ゴール or 残り1人）
function checkGameEnd(room) {
  const active = room.players.filter(p => !p.finished);

  if (active.length === 0) {
    room.status = 'finished';
    addLog(room, '🏆 ゲーム終了！全員ゴールしました！');
    return true;
  }

  if (active.length === 1) {
    const last = active[0];
    last.finished = true;
    room.finishCount++;
    last.finishRank = room.finishCount;
    room.status = 'finished';
    addLog(room, `${last.name} が最下位確定！`);
    addLog(room, '🏆 ゲーム終了！');
    return true;
  }

  return false;
}

// ラウンド上限による強制終了（位置が近い順に順位確定）
function endGameByRoundLimit(room) {
  const unfinished = room.players
    .filter(p => !p.finished)
    .sort((a, b) => b.position - a.position);

  for (const p of unfinished) {
    p.finished = true;
    room.finishCount++;
    p.finishRank = room.finishCount;
  }

  room.status = 'finished';
  addLog(room, `⏰ ${room.maxRounds}ラウンド到達！現在位置で順位確定`);
  addLog(room, '🏆 ゲーム終了！');
}

// 連鎖仕掛け発動（最大3連鎖）
function triggerTrapsChain(room, player) {
  const results = [];
  let currentPos = player.position;

  for (let chain = 0; chain < 3; chain++) {
    if (player.finished) break;
    const trapsHere = room.traps[currentPos];
    if (trapsHere.length === 0) break;

    const trapIndex = Math.floor(Math.random() * trapsHere.length);
    const trap = trapsHere.splice(trapIndex, 1)[0];
    const result = applyTrap(room, player, trap);
    if (result) results.push(result);

    // 位置が変わった場合のみ連鎖継続
    if (player.position !== currentPos) {
      currentPos = player.position;
    } else {
      break;
    }
  }

  return results;
}

// ========= 仕掛け効果 =========
function applyTrap(room, player, trap) {
  const placer = room.players.find(p => p.id === trap.placerId);
  const placerName = placer ? placer.name : '???';

  let actualType = trap.trapType;
  let isRandom = false;
  if (trap.trapType === 'random') {
    actualType = RANDOM_POOL[Math.floor(Math.random() * RANDOM_POOL.length)];
    isRandom = true;
  }

  const trapName = TRAP_NAMES[actualType] || actualType;
  const rp = isRandom ? `❓→${TRAP_NAMES[actualType]} ` : '';

  switch (actualType) {
    case 'pitfall': {
      const oldPos = player.position;
      player.position = Math.max(0, player.position - 3);
      addLog(room, `${rp}💀 ${placerName} の「落とし穴」発動！ ${player.name} ${oldPos}→${player.position}`);
      return { type: actualType, isRandom, oldPos, newPos: player.position, trapName, placerName };
    }
    case 'blockade': {
      player.skipNextTurn = true;
      addLog(room, `${rp}🚧 ${placerName} の「通せんぼ」発動！ ${player.name} 次ターンお休み`);
      return { type: actualType, isRandom, trapName, placerName };
    }
    case 'headwind': {
      player.halfDice = true;
      addLog(room, `${rp}💨 ${placerName} の「逆風」発動！ ${player.name} 次サイコロ半減`);
      return { type: actualType, isRandom, trapName, placerName };
    }
    case 'swap': {
      if (placer && !placer.finished && placer.id !== player.id) {
        const playerOldPos = player.position;
        const placerOldPos = placer.position;
        player.position = placer.position;
        placer.position = playerOldPos;
        addLog(room, `${rp}🔄 ${placerName} の「入れ替え」発動！ ${player.name}(${playerOldPos})↔${placerName}(${placerOldPos})`);
        return { type: actualType, isRandom, trapName, placerName,
          playerOldPos, playerNewPos: player.position,
          placerId: placer.id, placerOldPos, placerNewPos: placer.position };
      } else {
        const oldPos = player.position;
        player.position = Math.max(0, player.position - 3);
        addLog(room, `${rp}🔄 入れ替え相手なし→落とし穴！ ${player.name} ${oldPos}→${player.position}`);
        return { type: 'swap-fail', isRandom, oldPos, newPos: player.position, trapName, placerName };
      }
    }
    case 'redice': {
      const penalty = Math.floor(Math.random() * 6) + 1;
      const oldPos = player.position;
      player.position = Math.max(0, player.position - penalty);
      addLog(room, `${rp}🎲 ${placerName} の「サイコロ返し」発動！ ${player.name} さらに${penalty}戻る ${oldPos}→${player.position}`);
      return { type: actualType, isRandom, oldPos, newPos: player.position, penalty, trapName, placerName };
    }
    case 'chain': {
      player.chainTrapType = 'chain';
      addLog(room, `${rp}🔗 ${placerName} の「連鎖」発動！ ${player.name} 次配置フェーズで連鎖を強制配置！`);
      return { type: actualType, isRandom, trapName, placerName };
    }
    case 'involveAll': {
      const affectedDetails = [];
      for (const p of room.players) {
        if (p.id !== player.id && !p.finished) {
          const oldP = p.position;
          p.position = Math.max(0, p.position - 2);
          affectedDetails.push({ id: p.id, name: p.name, oldPos: oldP, newPos: p.position });
        }
      }
      addLog(room, `${rp}🌪️ ${placerName} の「全員巻き込み」発動！全員2マス戻る [${affectedDetails.map(a => `${a.name}(${a.oldPos}→${a.newPos})`).join(', ')}]`);
      return { type: actualType, isRandom, trapName, placerName, rollerPos: player.position, affectedDetails };
    }
    case 'wander': {
      const deltas = [-2, -1, 1, 2];
      const delta = deltas[Math.floor(Math.random() * deltas.length)];
      const oldPos = player.position;
      player.position = Math.max(0, Math.min(room.boardSize, player.position + delta));
      const dir = delta > 0 ? `+${delta}` : String(delta);
      addLog(room, `${rp}🌀 ${placerName} の「ランダム移動」発動！ ${player.name} ${dir}マス (${oldPos}→${player.position})`);
      // ゴール超え判定
      checkGoal(room, player);
      return { type: actualType, isRandom, oldPos, newPos: player.position, delta, trapName, placerName };
    }
    case 'gather': {
      if (!placer || placer.finished) {
        const oldPos = player.position;
        player.position = Math.max(0, player.position - 3);
        addLog(room, `${rp}📣 全員集合発動→設置者ゴール済みで落とし穴に！ ${player.name} ${oldPos}→${player.position}`);
        return { type: 'gather-fail', isRandom, oldPos, newPos: player.position, trapName, placerName };
      }
      const gatherPos = placer.position;
      const gatherRange = Math.ceil(room.boardSize / 2);
      const gatheredDetails = [];
      for (const p of room.players) {
        if (p.id !== trap.placerId && !p.finished) {
          if (Math.abs(p.position - gatherPos) > gatherRange) continue;
          const oldP = p.position;
          p.position = gatherPos;
          gatheredDetails.push({ id: p.id, name: p.name, oldPos: oldP, newPos: gatherPos });
        }
      }
      if (gatheredDetails.length === 0) {
        addLog(room, `${rp}📣 全員集合発動！ 射程内（±${gatherRange}マス）のプレイヤーなし`);
      } else {
        addLog(room, `${rp}📣 ${placerName} の「全員集合」発動！${gatherPos}マスへ [${gatheredDetails.map(a => `${a.name}(${a.oldPos}→${a.newPos})`).join(', ')}]`);
      }
      return { type: actualType, isRandom, gatherPos, trapName, placerName, gatheredDetails };
    }
  }
}

// ========= ターン進行 =========
function advanceAction(room) {
  room.currentActionIndex++;

  if (room.currentActionIndex >= room.actionOrder.length) {
    if (checkGameEnd(room)) return;

    room.round++;

    // ラウンド上限チェック
    if (room.round > room.maxRounds) {
      endGameByRoundLimit(room);
      return;
    }

    room.status = 'placement';
    room.placedThisRound = new Set();
    room.players.filter(p => p.finished).forEach(p => room.placedThisRound.add(p.id));

    addLog(room, `--- ラウンド ${room.round} ---`);

    const activePlayers = room.players.filter(p => !p.finished);
    if (activePlayers.length === 0) {
      room.status = 'finished';
      return;
    }

    // トラップを配布（連鎖中はそちら優先）
    assignTrapsForRound(room);

    // 連鎖中のプレイヤーを通知
    for (const p of activePlayers) {
      if (p.chainTrapType) {
        addLog(room, `🔗 ${p.name} は連鎖中！${TRAP_NAMES[p.chainTrapType]}が配布されました`);
      }
    }
    addLog(room, '仕掛けを配置してください。');

    // ターン順シャッフル
    room.actionOrder = shuffleArray(activePlayers.map(p => p.id));
    room.currentActionIndex = 0;
    logTurnOrder(room);

    if (activePlayers.every(p => room.placedThisRound.has(p.id))) {
      room.status = 'action';
      room.currentActionIndex = 0;
    }
  }
}

function addLog(room, message) {
  room.log.unshift(message);
  if (room.log.length > 40) room.log.length = 40;
}

// ========= 再接続 =========
function updateSocketId(oldId, newId) {
  const roomCode = socketToRoom.get(oldId);
  if (!roomCode) return false;
  const room = rooms.get(roomCode);
  if (!room) return false;

  const player = room.players.find(p => p.id === oldId);
  if (player) player.id = newId;
  if (room.hostId === oldId) room.hostId = newId;

  const aoIdx = room.actionOrder.indexOf(oldId);
  if (aoIdx !== -1) room.actionOrder[aoIdx] = newId;

  if (room.placedThisRound.has(oldId)) {
    room.placedThisRound.delete(oldId);
    room.placedThisRound.add(newId);
  }

  for (const squareTraps of room.traps) {
    for (const trap of squareTraps) {
      if (trap.placerId === oldId) trap.placerId = newId;
    }
  }

  socketToRoom.delete(oldId);
  socketToRoom.set(newId, roomCode);
  return true;
}

function reconnectPlayer(oldId, newId) {
  const ok = updateSocketId(oldId, newId);
  if (!ok) return false;
  const room = getRoomBySocketId(newId);
  if (room) {
    const player = room.players.find(p => p.id === newId);
    if (player) addLog(room, `🔄 ${player.name} が再接続しました`);
  }
  return true;
}

// ========= プレイヤー管理 =========
function getRoomBySocketId(socketId) {
  const code = socketToRoom.get(socketId);
  return code ? rooms.get(code) : null;
}

function removePlayer(socketId, kicked = false) {
  const room = getRoomBySocketId(socketId);
  if (!room) return null;

  const playerName = room.players.find(p => p.id === socketId)?.name || '???';
  socketToRoom.delete(socketId);
  room.players = room.players.filter(p => p.id !== socketId);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return null;
  }

  if (room.hostId === socketId) room.hostId = room.players[0].id;
  if (kicked) {
    addLog(room, `⏰ ${playerName} がタイムアウトでキックされました`);
  } else {
    addLog(room, `${playerName} が退出しました`);
  }

  // ゲーム中なら終了チェック（残り1人になっていないか）
  if (room.status === 'action' || room.status === 'placement') {
    if (checkGameEnd(room)) return room;
  }

  if (room.status === 'action') {
    room.actionOrder = room.actionOrder.filter(id => id !== socketId);
    if (room.currentActionIndex >= room.actionOrder.length) advanceAction(room);
  }
  if (room.status === 'placement') {
    room.placedThisRound.add(socketId);
    checkAllPlaced(room);
  }

  return room;
}

// ========= クライアント向けサニタイズ =========
function sanitizeRoom(room, forSocketId) {
  const activePlayers = room.players.filter(p => !p.finished);
  const myPlayer = room.players.find(p => p.id === forSocketId);
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    round: room.round,
    maxRounds: room.maxRounds,
    boardSize: room.boardSize,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      position: p.position,
      color: p.color,
      skipNextTurn: p.skipNextTurn,
      halfDice: p.halfDice,
      finished: p.finished,
      finishRank: p.finishRank,
    })),
    board: room.traps.map((traps, i) => ({
      square: i,
      myTrapCount: traps.filter(t => t.placerId === forSocketId).length,
    })),
    currentActionPlayerId: room.status === 'action'
      ? (room.actionOrder[room.currentActionIndex] || null)
      : null,
    myPlacedThisRound: room.placedThisRound.has(forSocketId),
    myAssignedTrap: myPlayer?.assignedTrap || null,
    myForcedTrapType: myPlayer?.chainTrapType || null,
    myPlacementRange: myPlayer && !myPlayer.finished ? {
      min: Math.max(1, myPlayer.position),
      max: Math.min(myPlayer.position + 6, room.boardSize - 1),
    } : null,
    waitingForPlacement: room.status === 'placement'
      ? activePlayers.filter(p => !room.placedThisRound.has(p.id)).map(p => p.name)
      : [],
    log: room.log,
  };
}

function resetRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'ルームが見つかりません' };
  if (room.status !== 'finished') return { error: 'ゲーム終了後のみ再スタートできます' };

  room.players.forEach((p, i) => {
    p.position = 0;
    p.skipNextTurn = false;
    p.halfDice = false;
    p.finished = false;
    p.finishRank = null;
    p.chainTrapType = null;
    p.assignedTrap = null;
    p.color = PLAYER_COLORS[i % PLAYER_COLORS.length];
  });

  room.status = 'lobby';
  room.round = 1;
  room.traps = Array.from({ length: room.boardSize + 1 }, () => []);
  room.placedThisRound = new Set();
  room.actionOrder = [];
  room.currentActionIndex = 0;
  room.finishCount = 0;
  room.log = [];

  return { room };
}

function getRoomList() {
  const list = [];
  for (const [, room] of rooms) {
    if (room.status === 'lobby') {
      list.push({
        code: room.code,
        players: room.players.length,
        boardSize: room.boardSize,
        maxRounds: room.maxRounds,
      });
    }
  }
  return list;
}

module.exports = {
  createRoom,
  joinRoom,
  startGame,
  placeTrap,
  rollDice,
  getRoomBySocketId,
  removePlayer,
  sanitizeRoom,
  resetRoom,
  getRoomList,
  reconnectPlayer,
  getRoomPlacedSet: (room) => room.placedThisRound,
};
