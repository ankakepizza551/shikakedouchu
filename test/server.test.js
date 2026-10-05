const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = process.env.TEST_PORT || '3199';
const URL = `http://localhost:${PORT}`;

let server;
const sockets = [];

before(async () => {
  server = spawn(process.execPath, [path.resolve(__dirname, '../server/index.js')], {
    env: { ...process.env, PORT },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (chunk) => { if (String(chunk).includes('Server running')) resolve(); });
    server.on('exit', (code) => reject(new Error(`server exited early (code ${code})`)));
  });
});

after(() => {
  for (const s of sockets) s.disconnect();
  server.kill();
});

function connect() {
  return new Promise((resolve) => {
    const s = io(URL, { forceNew: true, transports: ['websocket'] });
    sockets.push(s);
    s.on('connect', () => resolve(s));
  });
}
const call = (s, event, payload) => new Promise((resolve) => {
  if (payload === undefined) s.emit(event, resolve); else s.emit(event, payload, resolve);
});
const next = (s, event) => new Promise((resolve) => s.once(event, resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('不正な引数のイベントを送ってもサーバーは落ちない', async () => {
  const s = await connect();
  s.emit('create-room');
  s.emit('join-room', null);
  s.emit('join-room', { roomCode: 123 });
  s.emit('start-game');
  s.emit('place-trap');
  s.emit('roll-dice', 'x');
  s.emit('change-route');
  s.emit('chat');
  s.emit('reconnect-session', { token: {} });
  s.emit('get-rooms');
  s.emit('restart-game', 1, 2, 3);

  assert.ok((await call(s, 'create-room', { playerName: '   ' })).error);
  assert.ok((await call(s, 'create-room', { playerName: { a: 1 } })).error);
  assert.ok(Array.isArray(await call(s, 'get-rooms')));
});

test('ルーム作成から対戦・再接続まで', async () => {
  const a = await connect();
  const b = await connect();
  const viewer = await connect();

  // 作成: 名前は10文字に切り詰め、同じ接続からの二重作成は拒否
  const created = await call(a, 'create-room', { playerName: 'あ'.repeat(30), boardSize: 30, maxRounds: 20, isPrivate: false });
  assert.strictEqual(created.room.players[0].name.length, 10);
  assert.ok((await call(a, 'create-room', { playerName: 'again' })).error);
  assert.ok((await call(viewer, 'get-rooms')).some(r => r.code === created.roomCode));

  // 参加: コードは小文字でも可
  const joined = await call(b, 'join-room', { roomCode: created.roomCode.toLowerCase(), playerName: 'B' });
  assert.ok(!joined.error, joined.error);
  assert.ok((await call(b, 'start-game')).error, 'ホスト以外は開始できない');

  // 開始: 配置待ちの全員にキック期限が届く
  let updateA = next(a, 'room-update');
  let updateB = next(b, 'room-update');
  assert.ok((await call(a, 'start-game')).success);
  let roomA = await updateA;
  const roomB = await updateB;
  assert.ok(roomA.kickRemainingMs > 59000 && roomB.kickRemainingMs > 59000);
  assert.ok(!(await call(viewer, 'get-rooms')).some(r => r.code === created.roomCode), '開始後は公開一覧に出ない');

  // 他プレイヤーの操作でキック期限がリセットされない
  await sleep(1100);
  updateA = next(a, 'room-update');
  await call(b, 'change-route', { route: 'C' });
  roomA = await updateA;
  assert.ok(roomA.kickRemainingMs < 59000, `kick timer was reset: ${roomA.kickRemainingMs}`);

  // 配置 → 行動フェーズ
  await call(a, 'place-trap', { square: '29', trapType: roomA.myHand[0] });
  updateA = next(a, 'room-update');
  await call(b, 'place-trap', { square: '29', trapType: roomB.myHand[0] });
  roomA = await updateA;
  assert.strictEqual(roomA.status, 'action');

  // サイコロ: toPos は出目どおりのマスで、相手にも同じ内容が届く
  const roller = roomA.currentActionPlayerId === a.id ? a : b;
  const watcher = roller === a ? b : a;
  assert.ok((await call(watcher, 'roll-dice')).error, '手番でない人は振れない');
  const action = next(watcher, 'player-action');
  const rolled = await call(roller, 'roll-dice');
  assert.strictEqual(rolled.toPos, String(rolled.diceResult));
  assert.strictEqual((await action).toPos, rolled.toPos);

  // 切断 → 別の接続からトークンで復帰（ページ再読み込み相当）
  b.disconnect();
  const b2 = await connect();
  const rejoined = await call(b2, 'reconnect-session', { token: joined.reconnectToken });
  assert.ok(!rejoined.error, rejoined.error);
  assert.ok(rejoined.room.players.some(p => p.id === b2.id && p.name === 'B'));
  assert.ok((await call(viewer, 'reconnect-session', { token: 'invalid' })).error);
});
