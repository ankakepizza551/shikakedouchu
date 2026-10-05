const { test, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

// 時間切れの挙動を確かめるため、制限時間を短くした専用サーバーを立てる
const PORT = process.env.TEST_TIMEOUT_PORT || '3198';
const URL = `http://localhost:${PORT}`;
const TIMEOUT_MS = 300;

let server;
const sockets = [];

before(async () => {
  server = spawn(process.execPath, [path.resolve(__dirname, '../server/index.js')], {
    env: { ...process.env, PORT, KICK_TIMEOUT_MS: String(TIMEOUT_MS) },
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

test('時間切れは自動で進行し、3回続いたらキックされる', async () => {
  const a = await connect();
  const b = await connect();
  const seen = new Map([[a, { updates: [], actions: [], kicked: false }], [b, { updates: [], actions: [], kicked: false }]]);
  for (const [s, log] of seen) {
    s.on('room-update', (room) => log.updates.push(room));
    s.on('player-action', (action) => log.actions.push(action));
    s.on('kicked', () => { log.kicked = true; });
  }

  const { roomCode } = await call(a, 'create-room', { playerName: 'A', boardSize: 30, maxRounds: 20 });
  await call(b, 'join-room', { roomCode, playerName: 'B' });
  await call(a, 'start-game');

  // 誰も操作しない: 配置(1回目) → サイコロ(2回目) → 次の配置(3回目)でキック
  const deadline = Date.now() + 20 * TIMEOUT_MS;
  while (Date.now() < deadline && ![...seen.values()].some(l => l.kicked)) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const logs = [...seen.values()];
  const kicked = logs.filter(l => l.kicked);
  const survivor = logs.find(l => !l.kicked);
  assert.strictEqual(kicked.length, 1, '先に3回目の時間切れを迎えた1人だけがキックされる');

  // 自動配置で行動フェーズまで進み、自動でサイコロが振られている
  const all = survivor.updates;
  assert.ok(all.some(r => r.status === 'action'), '自動配置で行動フェーズに進む');
  assert.ok(all.some(r => r.log.some(l => l.includes('仕掛けを自動で配置'))));
  assert.ok(all.some(r => r.log.some(l => l.includes('自動でサイコロ'))));
  assert.ok(all.some(r => r.round === 2), '2ラウンド目まで自動で進む');

  // 代行されたサイコロの演出は、振った本人にも届く
  const selfActions = [...seen].flatMap(([s, l]) => l.actions.filter(x => x.playerId === s.id));
  assert.ok(selfActions.length >= 1);
  assert.ok(selfActions.every(x => x.diceResult >= 1 && x.diceResult <= 6 && typeof x.toPos === 'string'));

  // 残った1人でゲーム終了
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.strictEqual(survivor.updates.at(-1).status, 'finished');
});

test('自分で操作すれば時間切れの回数はリセットされる', async () => {
  const a = await connect();
  const b = await connect();
  let kicked = false;
  let latestA;
  let latestB;
  a.on('kicked', () => { kicked = true; });
  b.on('kicked', () => { kicked = true; });
  a.on('room-update', (room) => { latestA = room; });
  b.on('room-update', (room) => { latestB = room; });

  const { roomCode } = await call(a, 'create-room', { playerName: 'A', boardSize: 30, maxRounds: 20 });
  await call(b, 'join-room', { roomCode, playerName: 'B' });
  await call(a, 'start-game');

  // 6ラウンド分、配置だけは自分で行い、サイコロは毎回時間切れに任せる
  const until = Date.now() + 40 * TIMEOUT_MS;
  let placedRounds = 0;
  while (Date.now() < until && placedRounds < 6 && !kicked && latestA?.status !== 'finished') {
    for (const [s, room] of [[a, latestA], [b, latestB]]) {
      if (room?.status === 'placement' && !room.myPlacedThisRound && room.myHand.length) {
        const res = await call(s, 'place-trap', { square: '29', trapType: room.myHand[0] });
        if (res.success && s === a) placedRounds++;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  assert.strictEqual(kicked, false, '時間切れが連続しなければキックされない');
  assert.ok(placedRounds >= 3, `rounds played: ${placedRounds}`);
});
