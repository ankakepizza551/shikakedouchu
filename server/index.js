const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const {
  createRoom, joinRoom, startGame, placeTrap, rollDice,
  getRoomBySocketId, removePlayer, sanitizeRoom, resetRoom, getRoomList,
  reconnectPlayer, changeRoute,
} = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../client')));

// ========= セッショントークン（再接続用）=========
const sessionTokens = new Map();   // token  -> { roomCode, socketId, playerName }
const socketToToken = new Map();   // socketId -> token
const pendingRemovals = new Map(); // socketId -> timer
const RECONNECT_GRACE_MS = 90 * 1000;

function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function storeSession(socketId, roomCode, playerName) {
  const token = generateToken();
  sessionTokens.set(token, { roomCode, socketId, playerName });
  socketToToken.set(socketId, token);
  return token;
}

function cleanupSession(socketId) {
  const token = socketToToken.get(socketId);
  if (token) sessionTokens.delete(token);
  socketToToken.delete(socketId);
}

function cancelPendingRemoval(socketId) {
  const timer = pendingRemovals.get(socketId);
  if (timer) { clearTimeout(timer); pendingRemovals.delete(socketId); }
}

// ========= キックタイマー =========
const kickTimers = new Map(); // socketId -> { timer, turnKey, deadline }
const KICK_TIMEOUT_MS = 60 * 1000;

function setKickTimer(socketId, turnKey) {
  clearKickTimer(socketId);
  const timer = setTimeout(() => {
    kickTimers.delete(socketId);
    cancelPendingRemoval(socketId);
    cleanupSession(socketId);
    const room = getRoomBySocketId(socketId);
    if (!room || room.status === 'lobby' || room.status === 'finished') return;
    const player = room.players.find(p => p.id === socketId);
    if (!player) return;

    io.to(socketId).emit('kicked', { reason: '60秒間操作がなかったためキックされました' });

    const updatedRoom = removePlayer(socketId, true);
    const sock = io.sockets.sockets.get(socketId);
    if (sock) sock.disconnect(true);
    if (updatedRoom) broadcastRoom(updatedRoom);
  }, KICK_TIMEOUT_MS);
  kickTimers.set(socketId, { timer, turnKey, deadline: Date.now() + KICK_TIMEOUT_MS });
}

function clearKickTimer(socketId) {
  const entry = kickTimers.get(socketId);
  if (entry) { clearTimeout(entry.timer); kickTimers.delete(socketId); }
}

// 操作待ちのプレイヤーにだけタイマーを張る。同じ手番の間は張り直さない
// （他プレイヤーの操作で残り時間がリセットされないようにするため）
function refreshKickTimers(room) {
  const waiting = new Set();
  if (room.status === 'action') {
    const currentId = room.actionOrder[room.currentActionIndex];
    if (currentId) waiting.add(currentId);
  } else if (room.status === 'placement') {
    for (const player of room.players) {
      if (!player.finished && !room.placedThisRound.has(player.id)) waiting.add(player.id);
    }
  }

  const turnKey = `${room.round}:${room.status}`;
  for (const player of room.players) {
    if (!waiting.has(player.id)) clearKickTimer(player.id);
    else if (kickTimers.get(player.id)?.turnKey !== turnKey) setKickTimer(player.id, turnKey);
  }
}

// ========= ブロードキャスト =========
function broadcastRoom(room) {
  refreshKickTimers(room);
  for (const player of room.players) {
    const view = sanitizeRoom(room, player.id);
    const kick = kickTimers.get(player.id);
    view.kickRemainingMs = kick ? Math.max(0, kick.deadline - Date.now()) : null;
    io.to(player.id).emit('room-update', view);
  }
}

// ========= 入力検証 =========
const MAX_NAME_LENGTH = 10;
const CHAT_INTERVAL_MS = 500;

function cleanName(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_NAME_LENGTH);
}

// クライアントからの不正な引数や例外でプロセスが落ちないようにハンドラを包む
function handle(socket, event, handler) {
  socket.on(event, (...args) => {
    const callback = typeof args[args.length - 1] === 'function' ? args.pop() : () => {};
    const payload = args[0] && typeof args[0] === 'object' ? args[0] : {};
    try {
      handler(payload, callback);
    } catch (e) {
      console.error(`[${event}]`, e);
      callback({ error: 'サーバーエラーが発生しました' });
    }
  });
}

// ========= ソケットハンドラ =========
io.on('connection', (socket) => {
  let lastChatAt = 0;

  handle(socket, 'create-room', ({ playerName, boardSize, maxRounds, isPrivate }, callback) => {
    const name = cleanName(playerName);
    if (!name) return callback({ error: '名前を入力してください' });
    const result = createRoom(socket.id, name, boardSize, maxRounds, isPrivate);
    if (result.error) return callback({ error: result.error });
    const { roomCode, room } = result;
    const token = storeSession(socket.id, roomCode, name);
    socket.join(roomCode);
    callback({ roomCode, room: sanitizeRoom(room, socket.id), reconnectToken: token });
  });

  handle(socket, 'join-room', ({ roomCode, playerName }, callback) => {
    const name = cleanName(playerName);
    if (!name) return callback({ error: '名前を入力してください' });
    const code = String(roomCode || '').toUpperCase().trim();
    const result = joinRoom(socket.id, code, name);
    if (result.error) return callback({ error: result.error });
    const token = storeSession(socket.id, code, name);
    socket.join(code);
    broadcastRoom(result.room);
    callback({ roomCode: code, room: sanitizeRoom(result.room, socket.id), reconnectToken: token });
  });

  handle(socket, 'start-game', (_, callback) => {
    const room = getRoomBySocketId(socket.id);
    if (!room) return callback({ error: 'ルームが見つかりません' });
    if (room.hostId !== socket.id) return callback({ error: 'ホストのみ開始できます' });
    if (room.status !== 'lobby') return callback({ error: 'ゲームはすでに始まっています' });
    if (room.players.length < 2) return callback({ error: '2人以上必要です' });

    const result = startGame(room.code);
    if (result.error) return callback({ error: result.error });
    broadcastRoom(result.room);
    callback({ success: true });
  });

  handle(socket, 'place-trap', ({ square, trapType }, callback) => {
    const result = placeTrap(socket.id, String(square), trapType);
    if (result.error) return callback({ error: result.error });
    broadcastRoom(result.room);
    callback({ success: true });
  });

  handle(socket, 'change-route', ({ route }, callback) => {
    const result = changeRoute(socket.id, route);
    if (result.error) return callback({ error: result.error });
    broadcastRoom(result.room);
    callback({ success: true });
  });

  handle(socket, 'roll-dice', (_, callback) => {
    // ロール前の位置を取得（アニメーション用）
    const preRoom = getRoomBySocketId(socket.id);
    const prePlayer = preRoom?.players.find(p => p.id === socket.id);
    const fromPos = prePlayer?.position ?? '0';

    const result = rollDice(socket.id);
    if (result.error) return callback({ error: result.error });

    // サイコロで止まったマス。仕掛けによる移動は trapResults 側で演出する
    const toPos = result.dicePos ?? fromPos;

    // 他プレイヤーへアニメーション情報を先行送信（room-update より前）
    for (const p of result.room.players) {
      if (p.id !== socket.id) {
        io.to(p.id).emit('player-action', {
          playerId: socket.id,
          diceResult: result.diceResult,
          skipped: result.skipped,
          fromPos,
          toPos,
          trapResults: result.trapResults,
        });
      }
    }

    broadcastRoom(result.room);
    callback({
      diceResult: result.diceResult,
      skipped: result.skipped,
      toPos,
      trapResults: result.trapResults,
    });
  });

  handle(socket, 'get-rooms', (_, callback) => {
    callback(getRoomList());
  });

  handle(socket, 'chat', ({ message }) => {
    const room = getRoomBySocketId(socket.id);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const msg = String(message || '').trim().slice(0, 40);
    if (!msg) return;
    const now = Date.now();
    if (now - lastChatAt < CHAT_INTERVAL_MS) return;
    lastChatAt = now;
    for (const p of room.players) {
      io.to(p.id).emit('chat-message', { name: player.name, message: msg, color: player.color });
    }
  });

  handle(socket, 'restart-game', (_, callback) => {
    const room = getRoomBySocketId(socket.id);
    if (!room) return callback({ error: 'ルームが見つかりません' });
    if (room.hostId !== socket.id) return callback({ error: 'ホストのみ再スタートできます' });
    const result = resetRoom(room.code);
    if (result.error) return callback({ error: result.error });
    broadcastRoom(result.room);
    callback({ success: true });
  });

  // ========= 再接続ハンドラ =========
  handle(socket, 'reconnect-session', ({ token }, callback) => {
    const session = typeof token === 'string' ? sessionTokens.get(token) : null;
    if (!session) return callback({ error: 'セッションが見つかりません' });
    if (getRoomBySocketId(socket.id)) return callback({ error: 'すでにルームに参加しています' });

    const { roomCode, socketId: oldSocketId } = session;
    const room = getRoomBySocketId(oldSocketId);
    if (!room) {
      sessionTokens.delete(token);
      return callback({ error: 'ルームが終了しています' });
    }

    // 猶予タイマーとキックタイマーを解除
    cancelPendingRemoval(oldSocketId);
    clearKickTimer(oldSocketId);

    // socket ID を新しいものに更新
    const ok = reconnectPlayer(oldSocketId, socket.id);
    if (!ok) {
      sessionTokens.delete(token);
      return callback({ error: '再接続に失敗しました' });
    }

    // セッション情報を更新
    session.socketId = socket.id;
    socketToToken.delete(oldSocketId);
    socketToToken.set(socket.id, token);

    // 古い接続がまだ残っていれば切る（切断検知前の再接続・タブ複製など）
    const oldSocket = io.sockets.sockets.get(oldSocketId);
    if (oldSocket) oldSocket.disconnect(true);

    socket.join(roomCode);

    const updatedRoom = getRoomBySocketId(socket.id);
    callback({ roomCode, room: sanitizeRoom(updatedRoom, socket.id) });
    broadcastRoom(updatedRoom);
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocketId(socket.id);

    if (room && (room.status === 'action' || room.status === 'placement')) {
      // ゲーム中は猶予期間を設けてから削除。
      // 手番中ならキックタイマー（60秒）がそのまま進み、先に自動スキップされる
      const playerName = room.players.find(p => p.id === socket.id)?.name || '???';

      for (const player of room.players) {
        if (player.id !== socket.id) {
          io.to(player.id).emit('player-disconnected', { playerName });
        }
      }

      const timer = setTimeout(() => {
        pendingRemovals.delete(socket.id);
        clearKickTimer(socket.id);
        cleanupSession(socket.id);
        const updatedRoom = removePlayer(socket.id);
        if (updatedRoom) broadcastRoom(updatedRoom);
      }, RECONNECT_GRACE_MS);
      pendingRemovals.set(socket.id, timer);
    } else {
      // ロビー・終了後は即削除
      clearKickTimer(socket.id);
      cleanupSession(socket.id);
      const updatedRoom = removePlayer(socket.id);
      if (updatedRoom) broadcastRoom(updatedRoom);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
