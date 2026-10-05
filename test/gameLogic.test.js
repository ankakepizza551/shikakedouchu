const { test, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

// gameLogic はルーム一覧をモジュール内に持つので、テストごとに読み込み直す
function loadLogic() {
  const file = path.resolve(__dirname, '../server/gameLogic.js');
  delete require.cache[file];
  return require(file);
}

// 行動フェーズ開始直後（仕掛けなし、手番順は A→B→C→D 固定）のルームを作る
function setupActionPhase(g, playerCount, boardSize = 20, maxRounds = 20) {
  const ids = ['A', 'B', 'C', 'D'].slice(0, playerCount);
  const { roomCode, room } = g.createRoom(ids[0], ids[0], boardSize, maxRounds, false);
  for (const id of ids.slice(1)) g.joinRoom(id, roomCode, id);
  g.startGame(roomCode);
  for (const p of room.players) g.placeTrap(p.id, '1', p.hand[0]);
  for (const square in room.traps) room.traps[square] = [];
  room.actionOrder = [...ids];
  room.currentActionIndex = 0;
  return room;
}

const player = (room, id) => room.players.find(p => p.id === id);
const trap = (trapType, placerId = 'B') => ({ placerId, trapType, round: 1 });

// Math.random を固定して、指定した出目を出させる
const realRandom = Math.random;
function forceDice(n) { Math.random = () => (n - 0.5) / 6; }
afterEach(() => { Math.random = realRandom; });

test('手番済みのプレイヤーが退出しても現在の手番はずれない', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 4);
  room.currentActionIndex = 1; // B の手番
  g.removePlayer('A');
  assert.strictEqual(room.actionOrder[room.currentActionIndex], 'B');
});

test('手番中のプレイヤーが退出したら次の人の手番になる', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 4);
  room.currentActionIndex = 1;
  g.removePlayer('B');
  assert.strictEqual(room.actionOrder[room.currentActionIndex], 'C');
});

test('最後の手番のプレイヤーが退出したら次のラウンドへ進む', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 3);
  room.currentActionIndex = 2;
  g.removePlayer('C');
  assert.strictEqual(room.status, 'placement');
  assert.strictEqual(room.round, 2);
});

test('残り1人になったらゲーム終了', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 2);
  g.removePlayer('A');
  assert.strictEqual(room.status, 'finished');
  assert.strictEqual(player(room, 'B').finishRank, 1);
  assert.ok(room.log.some(l => l.includes('B の勝ち')));
  assert.ok(!room.log.some(l => l.includes('最下位')));
});

test('ラウンド上限時の順位はゴールまでの残りマス数で決まる', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 3, 20, 10);
  room.round = 10;
  // 残りマス数: B=6, A=8, C=10（藤ルートにいても近いとは限らない）
  Object.assign(player(room, 'A'), { position: '12A', preferredBranch: 'A' });
  Object.assign(player(room, 'B'), { position: '14' });
  Object.assign(player(room, 'C'), { position: '6C', preferredBranch: 'C' });
  room.currentActionIndex = 2; // 最後の手番の C が振り終えるとラウンド上限
  forceDice(1);
  g.rollDice('C');

  assert.strictEqual(room.status, 'finished');
  assert.deepStrictEqual(['B', 'A', 'C'].map(id => player(room, id).finishRank), [1, 2, 3]);
});

test('dicePos は仕掛け適用前のマスで、仕掛け結果には発動マスが入る', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 2, 30);
  room.traps['4'] = [trap('torrent')];
  forceDice(4);
  const r = g.rollDice('A');

  assert.strictEqual(r.diceResult, 4);
  assert.strictEqual(r.dicePos, '4');
  assert.strictEqual(player(room, 'A').position, '7');
  assert.deepStrictEqual(
    { pos: r.trapResults[0].pos, oldPos: r.trapResults[0].oldPos, newPos: r.trapResults[0].newPos },
    { pos: '4', oldPos: '4', newPos: '7' },
  );
});

test('分岐では進路設定のルートへ進む', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 2, 20);
  player(room, 'A').position = '5';
  g.changeRoute('A', 'C');
  forceDice(2);
  g.rollDice('A');
  assert.strictEqual(player(room, 'A').position, '7C');
});

test('後退は進路設定ではなく、実際に通ってきたルートを戻る', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 2, 20);
  const a = player(room, 'A');
  Object.assign(a, { position: '5', preferredBranch: 'C' });
  forceDice(6); // 5 → 6C,7C,8C,9C → 13 → 14（藤ルートを1回で通過）
  room.traps['14'] = [trap('pitfall')];
  g.rollDice('A');
  assert.strictEqual(a.position, '7C'); // 14 → 13 → 9C → 8C → 7C

  // 合流後に進路設定を変えていても、通ってきた道を戻る
  Object.assign(a, { position: '13' });
  g.changeRoute('A', 'A');
  room.traps['14'] = [trap('pitfall')];
  room.currentActionIndex = 0;
  forceDice(1);
  g.rollDice('A');
  assert.strictEqual(a.position, '7C'); // 桜ルートの 10A ではなく藤ルートへ戻る
});

test('連鎖は最大3回まで', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 2, 30);
  for (const sq of ['1', '4', '7', '10', '13A']) room.traps[sq] = [trap('torrent')];
  forceDice(1);
  const r = g.rollDice('A');
  assert.strictEqual(r.trapResults.length, 3);
  assert.strictEqual(player(room, 'A').position, '10B');
});

test('影武者は設置者と位置を入れ替える', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 2, 30);
  player(room, 'B').position = '20';
  room.traps['3'] = [trap('swap', 'B')];
  forceDice(3);
  g.rollDice('A');
  assert.strictEqual(player(room, 'A').position, '20');
  assert.strictEqual(player(room, 'B').position, '3');
});

test('関所で休みの人の手番は自動で飛ばされる', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 3, 30);
  room.traps['2'] = [trap('blockade', 'C')];
  forceDice(2);
  g.rollDice('A'); // A が関所を踏む → このラウンドは B, C と続く
  assert.strictEqual(player(room, 'A').skipNextTurn, true);
  g.rollDice('B');
  g.rollDice('C');

  // 次ラウンド: A が先頭なら振らずに B の手番になる
  assert.strictEqual(room.round, 2);
  for (const p of room.players) g.placeTrap(p.id, '29', p.hand[0]);
  room.traps['29'] = [];
  assert.strictEqual(room.status, 'action');
  const order = room.actionOrder;
  const current = order[room.currentActionIndex];
  assert.notStrictEqual(current, 'A');
  assert.deepStrictEqual(g.takeSkipNotices(room), order[0] === 'A' ? ['A'] : []);

  // A が先頭でなかった場合は、A の番が来た時点で飛ばされる
  while (room.status === 'action' && room.round === 2) {
    const id = room.actionOrder[room.currentActionIndex];
    assert.notStrictEqual(id, 'A', 'お休みの A に手番が回ってはいけない');
    forceDice(1);
    g.rollDice(id);
  }
  assert.ok(room.log.some(l => l.includes('A は関所でお休み')));
});

test('全員がお休みなら、誰も振らずに次のラウンドへ進む', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 2, 30);
  player(room, 'A').position = '10B';
  player(room, 'B').skipNextTurn = true;
  room.traps['11B'] = [trap('blockade', 'B')];
  forceDice(1);
  g.rollDice('A'); // A も関所へ。B は休みで飛ばされ、次ラウンドの配置へ

  assert.strictEqual(room.round, 2);
  assert.strictEqual(room.status, 'placement');
  assert.strictEqual(player(room, 'B').skipNextTurn, false);
  assert.strictEqual(player(room, 'A').skipNextTurn, true);
});

test('時間切れの代行: 配置フェーズは手札から有効なマスに置く', () => {
  const g = loadLogic();
  const { roomCode, room } = g.createRoom('A', 'A', 15, 20, false);
  g.joinRoom('B', roomCode, 'B');
  g.startGame(roomCode);
  const handBefore = [...player(room, 'A').hand];

  const r = g.autoPlay('A');
  assert.strictEqual(r.kind, 'place');
  assert.ok(room.placedThisRound.has('A'));
  const placed = Object.entries(room.traps).filter(([, t]) => t.length);
  assert.strictEqual(placed.length, 1);
  const [square, [placedTrap]] = placed[0];
  assert.ok(square !== '0' && square !== '15');
  assert.ok(handBefore.includes(placedTrap.trapType));
  assert.ok(g.autoPlay('A').error, '配置済みなら何もしない');
});

test('時間切れの代行: 行動フェーズは手番の人だけサイコロを振る', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 2, 30);
  assert.ok(g.autoPlay('B').error, '手番でない人は代行されない');
  forceDice(5);
  const r = g.autoPlay('A');
  assert.deepStrictEqual({ kind: r.kind, fromPos: r.fromPos, dicePos: r.dicePos, dice: r.diceResult },
    { kind: 'roll', fromPos: '0', dicePos: '5', dice: 5 });
  assert.strictEqual(room.actionOrder[room.currentActionIndex], 'B');
});

test('ゴールしたら順位が付き、2人対戦ならそこで終了', () => {
  const g = loadLogic();
  const room = setupActionPhase(g, 2, 15);
  player(room, 'A').position = '14';
  forceDice(3);
  g.rollDice('A');
  assert.strictEqual(player(room, 'A').finishRank, 1);
  assert.strictEqual(player(room, 'B').finishRank, 2);
  assert.strictEqual(room.status, 'finished');
});

test('手札にない仕掛け・スタートとゴール・存在しないマスには置けない', () => {
  const g = loadLogic();
  const { roomCode, room } = g.createRoom('A', 'A', 20, 20, false);
  g.joinRoom('B', roomCode, 'B');
  g.startGame(roomCode);
  const hand = player(room, 'A').hand;
  const notInHand = ['pitfall', 'blockade', 'headwind', 'swap'].find(t => !hand.includes(t));

  assert.ok(g.placeTrap('A', '3', notInHand).error);
  assert.ok(g.placeTrap('A', '0', hand[0]).error);
  assert.ok(g.placeTrap('A', '20', hand[0]).error);
  assert.ok(g.placeTrap('A', '99', hand[0]).error);
  assert.ok(!g.placeTrap('A', '3', hand[0]).error);
  assert.ok(g.placeTrap('A', '4', hand[1]).error, '同じラウンドに2回は置けない');
});

test('同じソケットからの二重作成は拒否され、退出後にルームが残らない', () => {
  const g = loadLogic();
  g.createRoom('X', 'X', 20, 20, false);
  assert.ok(g.createRoom('X', 'X', 20, 20, false).error);
  g.removePlayer('X');
  assert.strictEqual(g.getRoomList().length, 0);
});

test('他人の仕掛けの位置や手札はクライアントに送らない', () => {
  const g = loadLogic();
  const { roomCode, room } = g.createRoom('A', 'A', 20, 20, false);
  g.joinRoom('B', roomCode, 'B');
  g.startGame(roomCode);
  g.placeTrap('A', '3', player(room, 'A').hand[0]);

  const placed = room.traps['3'][0].trapType;
  const viewA = g.sanitizeRoom(room, 'A');
  assert.deepStrictEqual(viewA.board.find(n => n.square === '3').myTraps, [placed], '自分の仕掛けは種類まで見える');

  const viewB = g.sanitizeRoom(room, 'B');
  assert.deepStrictEqual(viewB.board.find(n => n.square === '3').myTraps, []);
  assert.deepStrictEqual(viewB.myHand, player(room, 'B').hand);
  assert.ok(!JSON.stringify(viewB).includes('"traps"'));
  assert.ok(viewB.players.every(p => p.hand === undefined));
});
