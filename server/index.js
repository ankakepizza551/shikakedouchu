const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  createRoom, joinRoom, startGame, placeTrap, rollDice,
  getRoomBySocketId, removePlayer, sanitizeRoom, resetRoom, getRoomList,
  reconnectPlayer,
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
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
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
const kickTimers = new Map();
const KICK_TIMEOUT_MS = 60 * 1000;

function setKickTimer(socketId) {
  clearKickTimer(socketId);
  kickTimers.set(socketId, setTimeout(() => {
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
  }, KICK_TIMEOUT_MS));
}

function clearKickTimer(socketId) {
  const timer = kickTimers.get(socketId);
  if (timer) { clearTimeout(timer); kickTimers.delete(socketId); }
}

function refreshKickTimers(room) {
  for (const player of room.players) clearKickTimer(player.id);
  if (room.status === 'finished' || room.status === 'lobby') return;

  if (room.status === 'action') {
    const currentId = room.actionOrder[room.currentActionIndex];
    if (currentId) setKickTimer(currentId);
  } else if (room.status === 'placement') {
    for (const player of room.players) {
      if (!player.finished && !room.placedThisRound.has(player.id)) {
        setKickTimer(player.id);
      }
    }
  }
}

// ========= ブロードキャスト =========
function broadcastRoom(room) {
  for (const player of room.players) {
    io.to(player.id).emit('room-update', sanitizeRoom(room, player.id));
  }
  refreshKickTimers(room);
}

// ========= ソケットハンドラ =========
io.on('connection', (socket) => {
  socket.on('create-room', ({ playerName, boardSize, maxRounds }, callback) => {
    const { roomCode, room } = createRoom(socket.id, playerName, boardSize, maxRounds);
    const token = storeSession(socket.id, roomCode, playerName);
    socket.join(roomCode);
    callback({ roomCode, room: sanitizeRoom(room, socket.id), reconnectToken: token });
  });

  socket.on('join-room', ({ roomCode, playerName }, callback) => {
    const code = roomCode.toUpperCase().trim();
    const result = joinRoom(socket.id, code, playerName);
    if (result.error) return callback({ error: result.error });
    const token = storeSession(socket.id, code, playerName);
    socket.join(code);
    broadcastRoom(result.room);
    callback({ roomCode: code, room: sanitizeRoom(result.room, socket.id), reconnectToken: token });
  });

  socket.on('start-game', (callback) => {
    const room = getRoomBySocketId(socket.id);
    if (!room) return callback({ error: 'ルームが見つかりません' });
    if (room.hostId !== socket.id) return callback({ error: 'ホストのみ開始できます' });
    if (room.players.length < 2) return callback({ error: '2人以上必要です' });

    const result = startGame(room.code);
    if (result.error) return callback({ error: result.error });
    broadcastRoom(result.room);
    callback({ success: true });
  });

  socket.on('place-trap', ({ square }, callback) => {
    clearKickTimer(socket.id);
    const result = placeTrap(socket.id, square);
    if (result.error) return callback({ error: result.error });
    broadcastRoom(result.room);
    callback({ success: true });
  });

  socket.on('roll-dice', (callback) => {
    clearKickTimer(socket.id);
    const result = rollDice(socket.id);
    if (result.error) return callback({ error: result.error });
    broadcastRoom(result.room);
    callback({
      diceResult: result.diceResult,
      skipped: result.skipped,
      trapResults: result.trapResults,
    });
  });

  socket.on('get-rooms', (callback) => {
    callback(getRoomList());
  });

  socket.on('restart-game', (callback) => {
    const room = getRoomBySocketId(socket.id);
    if (!room) return callback({ error: 'ルームが見つかりません' });
    if (room.hostId !== socket.id) return callback({ error: 'ホストのみ再スタートできます' });
    const result = resetRoom(room.code);
    if (result.error) return callback({ error: result.error });
    broadcastRoom(result.room);
    callback({ success: true });
  });

  // ========= 再接続ハンドラ =========
  socket.on('reconnect-session', ({ token }, callback) => {
    const session = sessionTokens.get(token);
    if (!session) return callback({ error: 'セッションが見つかりません' });

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

    socket.join(roomCode);

    const updatedRoom = getRoomBySocketId(socket.id);
    callback({ roomCode, room: sanitizeRoom(updatedRoom, socket.id) });
    broadcastRoom(updatedRoom);
  });

  socket.on('disconnect', () => {
    clearKickTimer(socket.id);
    const room = getRoomBySocketId(socket.id);

    if (room && (room.status === 'action' || room.status === 'placement')) {
      // ゲーム中は猶予期間を設けてから削除
      const playerName = room.players.find(p => p.id === socket.id)?.name || '???';

      for (const player of room.players) {
        if (player.id !== socket.id) {
          io.to(player.id).emit('player-disconnected', { playerName });
        }
      }

      const timer = setTimeout(() => {
        pendingRemovals.delete(socket.id);
        cleanupSession(socket.id);
        const updatedRoom = removePlayer(socket.id);
        if (updatedRoom) broadcastRoom(updatedRoom);
      }, RECONNECT_GRACE_MS);
      pendingRemovals.set(socket.id, timer);

      // ターン中なら通常のキックタイマーも起動（60秒で自動スキップ）
      if (room.status === 'action' && room.actionOrder[room.currentActionIndex] === socket.id) {
        setKickTimer(socket.id);
      } else if (room.status === 'placement' && !room.placedThisRound.has(socket.id)) {
        setKickTimer(socket.id);
      }
    } else {
      // ロビー・終了後は即削除
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
