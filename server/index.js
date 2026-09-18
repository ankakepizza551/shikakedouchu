const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  createRoom, joinRoom, startGame, placeTrap, rollDice,
  getRoomBySocketId, removePlayer, sanitizeRoom, resetRoom, getRoomList,
  reconnectPlayer, changeRoute,
} = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, '../client')));

// ========= OG画像 (Twitter Card用) =========
let sharp;
try { sharp = require('sharp'); } catch (e) {}

app.get('/og.png', async (req, res) => {
  const svg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f0a05"/>
        <stop offset="100%" stop-color="#1a1008"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e8cf94"/>
        <stop offset="50%" stop-color="#c3a568"/>
        <stop offset="100%" stop-color="#dcbf82"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <rect x="0" y="0" width="1200" height="4" fill="url(#gold)"/>
    <rect x="0" y="626" width="1200" height="4" fill="url(#gold)"/>
    <rect x="0" y="0" width="4" height="630" fill="url(#gold)"/>
    <rect x="1196" y="0" width="4" height="630" fill="url(#gold)"/>
    <g transform="translate(600,200)">
      <circle cx="0" cy="0" r="90" fill="none" stroke="#c3a568" stroke-width="2.5"/>
      <circle cx="0" cy="0" r="80" fill="none" stroke="#97291c" stroke-width="1.4" stroke-dasharray="3 7" opacity="0.75"/>
      <circle cx="0" cy="0" r="76" fill="rgba(195,165,104,0.06)" stroke="#c3a568" stroke-width="1"/>
      <circle cx="0" cy="0" r="46" fill="none" stroke="#97291c" stroke-width="2" opacity="0.32"/>
      <polygon points="0,-90 8,-76 0,-62 -8,-76" fill="#c3a568"/>
      <polygon points="90,0 76,8 62,0 76,-8" fill="#c3a568"/>
      <polygon points="0,90 -8,76 0,62 8,76" fill="#c3a568"/>
      <polygon points="-90,0 -76,-8 -62,0 -76,8" fill="#c3a568"/>
      <text y="28" text-anchor="middle" font-size="80" fill="#c3a568" font-family="serif" font-weight="bold">道</text>
    </g>
    <text x="600" y="360" text-anchor="middle" font-size="72" fill="url(#gold)" font-family="serif" font-weight="bold" letter-spacing="16">仕掛け道中</text>
    <text x="600" y="430" text-anchor="middle" font-size="30" fill="#a09070" font-family="serif" letter-spacing="4">罠を仕込みながら進む、読み合いすごろく</text>
    <rect x="400" y="510" width="400" height="52" rx="26" fill="none" stroke="#c3a568" stroke-width="1.5"/>
    <text x="600" y="543" text-anchor="middle" font-size="22" fill="#c3a568" font-family="serif" letter-spacing="2">▶ 最大4人 オンライン対戦</text>
  </svg>`;

  if (!sharp) {
    res.set('Content-Type', 'image/svg+xml');
    return res.send(svg);
  }
  try {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(png);
  } catch (e) {
    res.status(500).send('OG image error: ' + e.message);
  }
});

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
  socket.on('create-room', ({ playerName, boardSize, maxRounds, isPrivate }, callback) => {
    const { roomCode, room } = createRoom(socket.id, playerName, boardSize, maxRounds, isPrivate);
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

  socket.on('place-trap', ({ square, trapType }, callback) => {
    clearKickTimer(socket.id);
    const result = placeTrap(socket.id, square, trapType);
    if (result.error) return callback({ error: result.error });
    broadcastRoom(result.room);
    callback({ success: true });
  });

  socket.on('change-route', ({ route }, callback) => {
    const result = changeRoute(socket.id, route);
    if (result.error) return callback ? callback({ error: result.error }) : null;
    broadcastRoom(result.room);
    if (callback) callback({ success: true });
  });

  socket.on('roll-dice', (callback) => {
    clearKickTimer(socket.id);
    // ロール前の位置を取得（アニメーション用）
    const preRoom = getRoomBySocketId(socket.id);
    const prePlayer = preRoom?.players.find(p => p.id === socket.id);
    const fromPos = prePlayer?.position ?? '0';

    const result = rollDice(socket.id);
    if (result.error) return callback({ error: result.error });

    const postPlayer = result.room.players.find(p => p.id === socket.id);
    const toPos = postPlayer ? postPlayer.position : fromPos;

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

  socket.on('get-rooms', (callback) => {
    callback(getRoomList());
  });

  socket.on('chat', ({ message }) => {
    const room = getRoomBySocketId(socket.id);
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    const msg = String(message || '').trim().slice(0, 40);
    if (!msg) return;
    for (const p of room.players) {
      io.to(p.id).emit('chat-message', { name: player.name, message: msg, color: player.color });
    }
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
