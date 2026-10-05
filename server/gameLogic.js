const { BOARD_LAYOUTS } = require('../client/boardLayouts');

const VALID_BOARD_SIZES = [15, 20, 30];
const TRAP_TYPES = ['pitfall', 'blockade', 'headwind', 'swap', 'magnet', 'torrent', 'involveAll', 'gather', 'fireworks', 'random'];
const TRAP_NAMES = {
  pitfall:    '落とし穴',
  blockade:   '関所',
  headwind:   '辻風',
  swap:       '影武者',
  magnet:     '引導石',
  torrent:    '急流',
  involveAll: '大崩れ',
  gather:     '呼び子',
  fireworks:  '大筒花火',
  random:     '千両箱',
};
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f'];
const RANDOM_POOL = TRAP_TYPES.filter(t => t !== 'random');

const rooms = new Map();
const socketToRoom = new Map();

// ========= Traversal Helpers =========
function getPrevNodes(nodeId, boardSize) {
  const layout = BOARD_LAYOUTS[boardSize];
  if (!layout) return [];
  return layout.nodes
    .filter(n => n.next && n.next.includes(nodeId))
    .map(n => n.id);
}

function moveForward(fromNodeId, steps, preferredBranch, boardSize) {
  let current = fromNodeId;
  const layout = BOARD_LAYOUTS[boardSize];
  if (!layout) return current;
  
  for (let s = 0; s < steps; s++) {
    const node = layout.nodes.find(n => n.id === current);
    if (!node || !node.next || node.next.length === 0) break; // Goal
    
    if (node.next.length === 1) {
      current = node.next[0];
    } else {
      // Split path
      const pref = preferredBranch === 'C' ? 'C' : (preferredBranch === 'A' ? 'A' : 'B');
      current = node.next.find(n => n.endsWith(pref)) || node.next[0];
    }
  }
  return current;
}

function moveBackward(fromNodeId, steps, preferredBranch, boardSize) {
  let current = fromNodeId;
  
  for (let s = 0; s < steps; s++) {
    const prevs = getPrevNodes(current, boardSize);
    if (prevs.length === 0) break; // Start
    
    if (prevs.length === 1) {
      current = prevs[0];
    } else {
      // Merge point when backing up
      const pref = preferredBranch === 'C' ? 'C' : (preferredBranch === 'A' ? 'A' : 'B');
      current = prevs.find(n => n.endsWith(pref)) || prevs[0];
    }
  }
  return current;
}

function routeOf(nodeId) {
  const m = /[ABC]$/.exec(nodeId);
  return m ? m[0] : null;
}

// 分岐路に入ったら通った道を記録する（後退時に来た道を戻るため）
function setPosition(player, nodeId, routeHint) {
  player.position = nodeId;
  const route = routeOf(nodeId) || routeHint;
  if (route) player.lastRoute = route;
}

function advancePlayer(player, steps, boardSize) {
  for (let s = 0; s < steps; s++) {
    const next = moveForward(player.position, 1, player.preferredBranch, boardSize);
    if (next === player.position) break;
    setPosition(player, next);
  }
}

function retreatPlayer(player, steps, boardSize) {
  for (let s = 0; s < steps; s++) {
    const prev = moveBackward(player.position, 1, player.lastRoute || player.preferredBranch, boardSize);
    if (prev === player.position) break;
    setPosition(player, prev);
  }
}

// 現在の進路設定でゴールまであと何マスか
function stepsToGoal(player, boardSize) {
  let current = player.position;
  let steps = 0;
  while (true) {
    const next = moveForward(current, 1, player.preferredBranch, boardSize);
    if (next === current) break;
    current = next;
    steps++;
  }
  return steps;
}

function findPath(fromNodeId, toNodeId, boardSize) {
  const layout = BOARD_LAYOUTS[boardSize];
  if (!layout) return [];
  const adj = {};
  
  for (const node of layout.nodes) {
    adj[node.id] = adj[node.id] || [];
    if (node.next) {
      for (const nxt of node.next) {
        adj[node.id].push(nxt);
        adj[nxt] = adj[nxt] || [];
        adj[nxt].push(node.id);
      }
    }
  }
  
  const queue = [[fromNodeId]];
  const visited = new Set([fromNodeId]);
  
  while (queue.length > 0) {
    const path = queue.shift();
    const node = path[path.length - 1];
    if (node === toNodeId) return path;
    
    const neighbors = adj[node] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return [];
}

function getDistance(nodeA, nodeB, boardSize) {
  const path = findPath(nodeA, nodeB, boardSize);
  return path.length > 0 ? path.length - 1 : 999;
}

function getRandomHand(size = 3) {
  const pool = shuffleArray([...TRAP_TYPES]);
  return pool.slice(0, size);
}

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
    position: '0',
    color: PLAYER_COLORS[colorIndex % PLAYER_COLORS.length],
    skipNextTurn: false,
    forcedRollOne: false,
    finished: false,
    finishRank: null,
    hand: getRandomHand(),
    preferredBranch: 'B',
    lastRoute: null,
  };
}

// ========= ルーム管理 =========
const VALID_MAX_ROUNDS = [10, 20, 30, 50];

function createRoom(socketId, playerName, boardSize = 20, maxRounds = 20, isPrivate = false) {
  if (socketToRoom.has(socketId)) return { error: 'すでにルームに参加しています' };
  const size = VALID_BOARD_SIZES.includes(boardSize) ? boardSize : 20;
  const rounds = VALID_MAX_ROUNDS.includes(maxRounds) ? maxRounds : 20;
  const code = generateRoomCode();
  
  // Initialize traps as an object mapping node ID to trap list
  const traps = {};
  const layout = BOARD_LAYOUTS[size];
  if (layout) {
    for (const node of layout.nodes) {
      traps[node.id] = [];
    }
  }

  const room = {
    code,
    hostId: socketId,
    status: 'lobby',
    boardSize: size,
    maxRounds: rounds,
    isPrivate: !!isPrivate,
    players: [createPlayer(socketId, playerName, 0)],
    traps,
    round: 1,
    placedThisRound: new Set(),
    actionOrder: [],
    currentActionIndex: 0,
    finishCount: 0,
    log: [],
    skipNotices: [], // 自動で飛ばした「お休み」のうち、まだクライアントへ知らせていない分
  };
  rooms.set(code, room);
  socketToRoom.set(socketId, code);
  return { roomCode: code, room };
}

function joinRoom(socketId, roomCode, playerName) {
  if (socketToRoom.has(socketId)) return { error: 'すでにルームに参加しています' };
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

  // Initialize player hands and position
  for (const p of room.players) {
    p.hand = getRandomHand();
    p.preferredBranch = 'B';
    p.lastRoute = null;
    p.position = '0';
    p.finished = false;
    p.finishRank = null;
  }

  addLog(room, 'ゲームスタート！まず仕掛けを配置してください。');
  logTurnOrder(room);
  return { room };
}

// 各プレイヤーにランダムトラップを配布（連鎖中はそちら優先）
function assignTrapsForRound(room) {
  // 手札制に移行したため、通常のラウンド毎の単一配布は不要ですが、
  // 手札が3枚未満のプレイヤーがあれば補充します。
  for (const p of room.players) {
    if (p.finished) continue;
    while (p.hand.length < 3) {
      const available = TRAP_TYPES.filter(t => !p.hand.includes(t));
      const pool = available.length > 0 ? available : TRAP_TYPES;
      p.hand.push(pool[Math.floor(Math.random() * pool.length)]);
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
function placeTrap(socketId, square, trapType) {
  const room = getRoomBySocketId(socketId);
  if (!room) return { error: 'ルームが見つかりません' };
  if (room.status !== 'placement') return { error: '配置フェーズではありません' };
  if (room.placedThisRound.has(socketId)) return { error: 'すでに配置しました' };

  const player = room.players.find(p => p.id === socketId);
  if (!player) return { error: 'プレイヤーが見つかりません' };
  if (player.finished) return { error: 'ゴール済みです' };

  // スタートとゴールには設置不可
  if (square === '0' || square === String(room.boardSize)) {
    return { error: 'スタートとゴールには仕掛けを設置できません' };
  }

  const layout = BOARD_LAYOUTS[room.boardSize];
  const nodeExists = layout.nodes.some(n => n.id === square);
  if (!nodeExists) {
    return { error: '存在しないマスです' };
  }

  if (!player.hand || !player.hand.includes(trapType)) {
    return { error: '指定された仕掛けを手札に持っていません' };
  }
  player.hand.splice(player.hand.indexOf(trapType), 1);

  if (!room.traps[square]) {
    room.traps[square] = [];
  }
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
    skipRestingPlayers(room);
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

  let diceResult = Math.floor(Math.random() * 6) + 1;
  if (player.forcedRollOne) {
    diceResult = 1;
    player.forcedRollOne = false;
    addLog(room, `${player.name} は辻風中！サイコロの目が強制的に ${diceResult} に固定`);
  }

  const oldPosition = player.position;
  advancePlayer(player, diceResult, room.boardSize);
  const dicePos = player.position; // サイコロで止まったマス（仕掛け適用前）

  const layout = BOARD_LAYOUTS[room.boardSize];
  const oldLabel = layout.nodes.find(n => n.id === oldPosition)?.label || oldPosition;
  const newLabel = layout.nodes.find(n => n.id === player.position)?.label || player.position;
  addLog(room, `${player.name} が ${diceResult} を出した！(${oldLabel} → ${newLabel})`);

  checkGoal(room, player);

  // 仕掛けチェック（連鎖あり、最大3回）
  let trapResults = null;
  if (!player.finished) {
    trapResults = triggerTrapsChain(room, player);
    if (trapResults.length === 0) trapResults = null;
  }

  if (!checkGameEnd(room)) advanceAction(room);

  return { room, diceResult, dicePos, trapResults };
}

// 時間切れ時の代行。配置フェーズは手札からランダムに置き、行動フェーズはサイコロを振る
function autoPlay(socketId) {
  const room = getRoomBySocketId(socketId);
  if (!room) return { error: 'ルームが見つかりません' };
  const player = room.players.find(p => p.id === socketId);
  if (!player) return { error: 'プレイヤーが見つかりません' };

  if (room.status === 'placement') {
    if (player.finished || room.placedThisRound.has(socketId)) return { error: '操作待ちではありません' };
    const goal = String(room.boardSize);
    const squares = BOARD_LAYOUTS[room.boardSize].nodes.map(n => n.id).filter(id => id !== '0' && id !== goal);
    const square = squares[Math.floor(Math.random() * squares.length)];
    const trapType = player.hand[Math.floor(Math.random() * player.hand.length)];
    addLog(room, `⏰ ${player.name} は時間切れ。仕掛けを自動で配置します`);
    const result = placeTrap(socketId, square, trapType);
    if (result.error) return result;
    return { room, kind: 'place' };
  }

  if (room.status === 'action') {
    if (room.actionOrder[room.currentActionIndex] !== socketId) return { error: '操作待ちではありません' };
    const fromPos = player.position;
    addLog(room, `⏰ ${player.name} は時間切れ。自動でサイコロを振ります`);
    const result = rollDice(socketId);
    if (result.error) return result;
    return { ...result, kind: 'roll', fromPos };
  }

  return { error: '操作待ちではありません' };
}

// ゴール判定（ゴール済みは完全無敵）
function checkGoal(room, player) {
  if (player.finished) return;
  if (player.position === String(room.boardSize)) {
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
    // 誰もゴールしていないのに1人だけ残った＝他の全員が退出した
    addLog(room, last.finishRank === 1 ? `${last.name} の勝ち！（他のプレイヤーが退出）` : `${last.name} が最下位確定！`);
    addLog(room, '🏆 ゲーム終了！');
    return true;
  }

  return false;
}

// ラウンド上限による強制終了（位置が近い順に順位確定）
function endGameByRoundLimit(room) {
  const unfinished = room.players
    .filter(p => !p.finished)
    .sort((a, b) => stepsToGoal(a, room.boardSize) - stepsToGoal(b, room.boardSize));

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
    if (!trapsHere || trapsHere.length === 0) break;

    const trapIndex = Math.floor(Math.random() * trapsHere.length);
    const trap = trapsHere.splice(trapIndex, 1)[0];
    const result = applyTrap(room, player, trap);
    if (result) {
      result.pos = currentPos; // 発動したマス
      results.push(result);
    }

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
  const layout = BOARD_LAYOUTS[room.boardSize];

  switch (actualType) {
    case 'pitfall': {
      const oldPos = player.position;
      retreatPlayer(player, 4, room.boardSize);
      const oldLabel = layout.nodes.find(n => n.id === oldPos)?.label || oldPos;
      const newLabel = layout.nodes.find(n => n.id === player.position)?.label || player.position;
      addLog(room, `${rp}🕳️ ${placerName} の「落とし穴」発動！ ${player.name} ${oldLabel}→${newLabel}`);
      return { type: actualType, isRandom, oldPos, newPos: player.position, trapName, placerName };
    }
    case 'blockade': {
      player.skipNextTurn = true;
      addLog(room, `${rp}🚧 ${placerName} の「関所」発動！ ${player.name} 次ターンお休み`);
      return { type: actualType, isRandom, trapName, placerName };
    }
    case 'headwind': {
      player.forcedRollOne = true;
      addLog(room, `${rp}🌪️ ${placerName} の「辻風」発動！ ${player.name} 次サイコロが 1 に固定`);
      return { type: actualType, isRandom, trapName, placerName };
    }
    case 'swap': {
      if (placer && !placer.finished && placer.id !== player.id) {
        const playerOldPos = player.position;
        const placerOldPos = placer.position;
        const playerRoute = player.lastRoute;
        setPosition(player, placerOldPos, placer.lastRoute);
        setPosition(placer, playerOldPos, playerRoute);
        const playerOldLabel = layout.nodes.find(n => n.id === playerOldPos)?.label || playerOldPos;
        const placerOldLabel = layout.nodes.find(n => n.id === placerOldPos)?.label || placerOldPos;
        addLog(room, `${rp}👥 ${placerName} の「影武者」発動！ ${player.name}(${playerOldLabel})↔${placerName}(${placerOldLabel})`);
        return { type: actualType, isRandom, trapName, placerName,
          playerOldPos, playerNewPos: player.position,
          placerId: placer.id, placerOldPos, placerNewPos: placer.position };
      } else {
        const oldPos = player.position;
        retreatPlayer(player, 4, room.boardSize);
        const oldLabel = layout.nodes.find(n => n.id === oldPos)?.label || oldPos;
        const newLabel = layout.nodes.find(n => n.id === player.position)?.label || player.position;
        addLog(room, `${rp}👥 影武者相手なし→落とし穴！ ${player.name} ${oldLabel}→${newLabel}`);
        return { type: 'swap-fail', isRandom, oldPos, newPos: player.position, trapName, placerName };
      }
    }
    case 'magnet': {
      let nearestOpponent = null;
      let minDistance = Infinity;

      for (const p of room.players) {
        if (p.id !== player.id && !p.finished) {
          const dist = getDistance(player.position, p.position, room.boardSize);
          if (dist < minDistance) {
            minDistance = dist;
            nearestOpponent = p;
          }
        }
      }

      if (nearestOpponent) {
        const oldPos = player.position;
        setPosition(player, nearestOpponent.position, nearestOpponent.lastRoute);
        const oldLabel = layout.nodes.find(n => n.id === oldPos)?.label || oldPos;
        const newLabel = layout.nodes.find(n => n.id === player.position)?.label || player.position;
        addLog(room, `${rp}🧲 ${placerName} の「引導石」発動！ ${player.name} は最も近い他プレイヤー ${nearestOpponent.name} のマスへ引き寄せられた！ ${oldLabel}→${newLabel}`);
        return { type: actualType, isRandom, oldPos, newPos: player.position, targetPlayerId: nearestOpponent.id, targetPlayerName: nearestOpponent.name, trapName, placerName };
      } else {
        const oldPos = player.position;
        retreatPlayer(player, 4, room.boardSize);
        const oldLabel = layout.nodes.find(n => n.id === oldPos)?.label || oldPos;
        const newLabel = layout.nodes.find(n => n.id === player.position)?.label || player.position;
        addLog(room, `${rp}🧲 引導石の引き寄せ相手なし→落とし穴！ ${player.name} ${oldLabel}→${newLabel}`);
        return { type: 'magnet-fail', isRandom, oldPos, newPos: player.position, trapName, placerName };
      }
    }
    case 'torrent': {
      const oldPos = player.position;
      advancePlayer(player, 3, room.boardSize);
      const oldLabel = layout.nodes.find(n => n.id === oldPos)?.label || oldPos;
      const newLabel = layout.nodes.find(n => n.id === player.position)?.label || player.position;
      addLog(room, `${rp}🌊 ${placerName} の「急流」発動！ ${player.name} は急流に乗って 3マス進んだ！ ${oldLabel}→${newLabel}`);
      checkGoal(room, player);
      return { type: actualType, isRandom, oldPos, newPos: player.position, trapName, placerName };
    }
    case 'involveAll': {
      const affectedDetails = [];
      for (const p of room.players) {
        if (p.id !== player.id && !p.finished) {
          const oldP = p.position;
          retreatPlayer(p, 2, room.boardSize);
          affectedDetails.push({ id: p.id, name: p.name, oldPos: oldP, newPos: p.position });
        }
      }
      const descList = affectedDetails.map(a => {
        const oldLbl = layout.nodes.find(n => n.id === a.oldPos)?.label || a.oldPos;
        const newLbl = layout.nodes.find(n => n.id === a.newPos)?.label || a.newPos;
        return `${a.name}(${oldLbl}→${newLbl})`;
      }).join(', ');
      addLog(room, `${rp}🌪️ ${placerName} の「大崩れ」発動！全員2マス戻る [${descList}]`);
      return { type: actualType, isRandom, trapName, placerName, rollerPos: player.position, affectedDetails };
    }
    case 'gather': {
      if (!placer || placer.finished) {
        const oldPos = player.position;
        retreatPlayer(player, 4, room.boardSize);
        const oldLabel = layout.nodes.find(n => n.id === oldPos)?.label || oldPos;
        const newLabel = layout.nodes.find(n => n.id === player.position)?.label || player.position;
        addLog(room, `${rp}📣 呼び子発動→設置者ゴール済みで落とし穴に！ ${player.name} ${oldLabel}→${newLabel}`);
        return { type: 'gather-fail', isRandom, oldPos, newPos: player.position, trapName, placerName };
      }
      const gatherPos = placer.position;
      const gatherRange = Math.ceil(room.boardSize / 2);
      const gatheredDetails = [];
      for (const p of room.players) {
        if (p.id !== trap.placerId && !p.finished) {
          const dist = getDistance(p.position, gatherPos, room.boardSize);
          if (dist > gatherRange) continue;
          const oldP = p.position;
          setPosition(p, gatherPos, placer.lastRoute);
          gatheredDetails.push({ id: p.id, name: p.name, oldPos: oldP, newPos: gatherPos });
        }
      }
      if (gatheredDetails.length === 0) {
        addLog(room, `${rp}📣 呼び子発動！ 射程内（±${gatherRange}マス）のプレイヤーなし`);
      } else {
        const descList = gatheredDetails.map(a => {
          const oldLbl = layout.nodes.find(n => n.id === a.oldPos)?.label || a.oldPos;
          const newLbl = layout.nodes.find(n => n.id === a.newPos)?.label || a.newPos;
          return `${a.name}(${oldLbl}→${newLbl})`;
        }).join(', ');
        const gatherLabel = layout.nodes.find(n => n.id === gatherPos)?.label || gatherPos;
        addLog(room, `${rp}📣 ${placerName} の「呼び子」発動！${gatherLabel}マスへ [${descList}]`);
      }
      return { type: actualType, isRandom, gatherPos, trapName, placerName, gatheredDetails };
    }
    case 'fireworks': {
      const playerOldPos = player.position;
      
      const neighbors = new Set([playerOldPos]);
      if (layout) {
        for (const n of layout.nodes) {
          if (n.id === playerOldPos) {
            if (n.next) {
              for (const nxt of n.next) neighbors.add(nxt);
            }
          }
          if (n.next && n.next.includes(playerOldPos)) {
            neighbors.add(n.id);
          }
        }
      }

      retreatPlayer(player, 4, room.boardSize);
      
      const affectedDetails = [];
      for (const p of room.players) {
        if (p.id !== player.id && !p.finished && neighbors.has(p.position)) {
          const oldP = p.position;
          retreatPlayer(p, 2, room.boardSize);
          affectedDetails.push({ id: p.id, name: p.name, oldPos: oldP, newPos: p.position });
        }
      }

      const oldLabel = layout.nodes.find(n => n.id === playerOldPos)?.label || playerOldPos;
      const newLabel = layout.nodes.find(n => n.id === player.position)?.label || player.position;

      let descList = '';
      if (affectedDetails.length > 0) {
        descList = ' 巻き込み：' + affectedDetails.map(a => {
          const oldLbl = layout.nodes.find(n => n.id === a.oldPos)?.label || a.oldPos;
          const newLbl = layout.nodes.find(n => n.id === a.newPos)?.label || a.newPos;
          return `${a.name}(${oldLbl}→${newLbl})`;
        }).join(', ');
      }

      addLog(room, `${rp}🎆 ${placerName} の「大筒花火」発動！爆発で ${player.name} ${oldLabel}→${newLabel} [4戻る]${descList}`);

      return {
        type: actualType,
        isRandom,
        trapName,
        placerName,
        rollerOldPos: playerOldPos,
        rollerNewPos: player.position,
        affectedDetails
      };
    }
  }
}

// ========= ターン進行 =========
// 手番を次へ進める。関所で休みの人の手番は自動で飛ばす
function advanceAction(room) {
  advanceTurn(room);
  skipRestingPlayers(room);
}

function skipRestingPlayers(room) {
  while (room.status === 'action') {
    const current = room.players.find(p => p.id === room.actionOrder[room.currentActionIndex]);
    if (!current || !current.skipNextTurn) break;
    current.skipNextTurn = false;
    addLog(room, `💤 ${current.name} は関所でお休み！`);
    room.skipNotices.push(current.name);
    advanceTurn(room);
  }
}

function takeSkipNotices(room) {
  const names = room.skipNotices;
  room.skipNotices = [];
  return names;
}

function advanceTurn(room) {
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

    // トラップを配布
    assignTrapsForRound(room);


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

  // Iterate over traps object
  for (const square in room.traps) {
    const squareTraps = room.traps[square];
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

  // ゲーム中なら終了チェック
  if (room.status === 'action' || room.status === 'placement') {
    if (checkGameEnd(room)) return room;
  }

  if (room.status === 'action') {
    // 手番済みの人が抜けた場合は、現在の手番がずれないよう詰める
    const orderIdx = room.actionOrder.indexOf(socketId);
    if (orderIdx !== -1) {
      room.actionOrder.splice(orderIdx, 1);
      if (orderIdx < room.currentActionIndex) room.currentActionIndex--;
    }
    if (room.currentActionIndex >= room.actionOrder.length) advanceAction(room);
    else skipRestingPlayers(room);
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
  
  const sanitizedBoard = [];
  const layout = BOARD_LAYOUTS[room.boardSize];
  if (layout) {
    for (const node of layout.nodes) {
      sanitizedBoard.push({
        square: node.id,
        label: node.label,
        row: node.row,
        col: node.col,
        type: node.type,
        myTraps: (room.traps[node.id] || []).filter(t => t.placerId === forSocketId).map(t => t.trapType),
      });
    }
  }

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
      forcedRollOne: p.forcedRollOne,
      finished: p.finished,
      finishRank: p.finishRank,
      preferredBranch: p.preferredBranch,
    })),
    board: sanitizedBoard,
    currentActionPlayerId: room.status === 'action'
      ? (room.actionOrder[room.currentActionIndex] || null)
      : null,
    myPlacedThisRound: room.placedThisRound.has(forSocketId),
    myHand: myPlayer ? myPlayer.hand : [],
    myPreferredRoute: myPlayer ? myPlayer.preferredBranch : 'B',
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
    p.position = '0';
    p.skipNextTurn = false;
    p.forcedRollOne = false;
    p.finished = false;
    p.finishRank = null;
    p.hand = getRandomHand();
    p.preferredBranch = 'B';
    p.lastRoute = null;
    p.color = PLAYER_COLORS[i % PLAYER_COLORS.length];
  });

  room.status = 'lobby';
  room.round = 1;

  // Reset traps object
  const traps = {};
  const layout = BOARD_LAYOUTS[room.boardSize];
  if (layout) {
    for (const node of layout.nodes) {
      traps[node.id] = [];
    }
  }
  room.traps = traps;

  room.placedThisRound = new Set();
  room.actionOrder = [];
  room.currentActionIndex = 0;
  room.finishCount = 0;
  room.log = [];
  room.skipNotices = [];

  return { room };
}

function getRoomList() {
  const list = [];
  for (const [, room] of rooms) {
    if (room.status === 'lobby' && !room.isPrivate) {
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

function changeRoute(socketId, route) {
  const room = getRoomBySocketId(socketId);
  if (!room) return { error: 'ルームが見つかりません' };
  const player = room.players.find(p => p.id === socketId);
  if (!player) return { error: 'プレイヤーが見つかりません' };

  if (route !== 'A' && route !== 'B' && route !== 'C') {
    return { error: '無効な進路です' };
  }

  player.preferredBranch = route;
  return { room };
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
  changeRoute,
  autoPlay,
  takeSkipNotices,
};
