const socket = io();

const TRAP_DEFS = [
  { type: 'pitfall',    emoji: '🕳️', name: '落とし穴',    desc: '4マス戻る' },
  { type: 'blockade',   emoji: '🚧', name: '関所',        desc: '次の1ターンお休み' },
  { type: 'headwind',   emoji: '🌪️', name: '辻風',        desc: '次のサイコロの出目が1になる' },
  { type: 'swap',       emoji: '👥', name: '影武者',      desc: '設置者と位置を交換する' },
  { type: 'magnet',     emoji: '🧲', name: '引導石',      desc: '最も近い他プレイヤーと同じマスへ引き寄せる' },
  { type: 'torrent',    emoji: '🌊', name: '急流',        desc: '前方に3マス進む' },
  { type: 'involveAll', emoji: '🏚️', name: '大崩れ',      desc: '他の全員を2マス戻る' },
  { type: 'gather',     emoji: '📣', name: '呼び子',      desc: '射程内の全員を設置者のマスへ集める' },
  { type: 'fireworks',  emoji: '🎆', name: '大筒花火',    desc: '発動マスと隣接マスの全員を巻き込み後退' },
  { type: 'random',     emoji: '❓', name: '千両箱',      desc: '何が起きるかはお楽しみ！' },
];

// ========= Board Layouts =========
const BOARD_LAYOUTS = {
  15: {
    maxNode: 15,
    nodes: [
      { id: '0', label: '始', row: 1, col: 0, type: 'common', next: ['1'] },
      { id: '1', label: '1', row: 1, col: 1, type: 'common', next: ['2'] },
      { id: '2', label: '2', row: 1, col: 2, type: 'common', next: ['3'] },
      { id: '3', label: '3', row: 1, col: 3, type: 'common', next: ['4'] },
      { id: '4', label: '4', row: 1, col: 4, type: 'common', next: ['5A', '5B', '5C'] },
      // Route A (桜 - 6 steps to 11)
      { id: '5A', label: '5上', row: 0, col: 4, type: 'route-a', next: ['6A'] },
      { id: '6A', label: '6上', row: 0, col: 5, type: 'route-a', next: ['7A'] },
      { id: '7A', label: '7上', row: 0, col: 6, type: 'route-a', next: ['8A'] },
      { id: '8A', label: '8上', row: 0, col: 7, type: 'route-a', next: ['9A'] },
      { id: '9A', label: '9上', row: 0, col: 8, type: 'route-a', next: ['10A'] },
      { id: '10A', label: '10上', row: 1, col: 8, type: 'route-a', next: ['11'] },
      // Route B (竹 - 5 steps to 11)
      { id: '5B', label: '5中', row: 1, col: 5, type: 'route-b', next: ['6B'] },
      { id: '6B', label: '6中', row: 1, col: 6, type: 'route-b', next: ['7B'] },
      { id: '7B', label: '7中', row: 1, col: 7, type: 'route-b', next: ['8B'] },
      { id: '8B', label: '8中', row: 2, col: 6, type: 'route-b', next: ['11'] },
      // Route C (藤 - 4 steps to 11)
      { id: '5C', label: '5下', row: 2, col: 4, type: 'route-c', next: ['6C'] },
      { id: '6C', label: '6下', row: 2, col: 5, type: 'route-c', next: ['7C'] },
      { id: '7C', label: '7下', row: 3, col: 6, type: 'route-c', next: ['11'] },
      // Common End
      { id: '11', label: '11', row: 2, col: 7, type: 'common', next: ['12'] },
      { id: '12', label: '12', row: 2, col: 8, type: 'common', next: ['13'] },
      { id: '13', label: '13', row: 3, col: 8, type: 'common', next: ['14'] },
      { id: '14', label: '14', row: 3, col: 7, type: 'common', next: ['15'] },
      { id: '15', label: '終', row: 3, col: 5, type: 'common', next: [] },
    ]
  },
  20: {
    maxNode: 20,
    nodes: [
      { id: '0', label: '始', row: 1, col: 0, type: 'common', next: ['1'] },
      { id: '1', label: '1', row: 1, col: 1, type: 'common', next: ['2'] },
      { id: '2', label: '2', row: 1, col: 2, type: 'common', next: ['3'] },
      { id: '3', label: '3', row: 1, col: 3, type: 'common', next: ['4'] },
      { id: '4', label: '4', row: 1, col: 4, type: 'common', next: ['5'] },
      { id: '5', label: '5', row: 1, col: 5, type: 'common', next: ['6A', '6B', '6C'] },
      // Route A (桜 - 8 steps to 13)
      { id: '6A', label: '6上', row: 0, col: 5, type: 'route-a', next: ['7A'] },
      { id: '7A', label: '7上', row: 0, col: 6, type: 'route-a', next: ['8A'] },
      { id: '8A', label: '8上', row: 0, col: 7, type: 'route-a', next: ['9A'] },
      { id: '9A', label: '9上', row: 0, col: 8, type: 'route-a', next: ['10A'] },
      { id: '10A', label: '10上', row: 0, col: 9, type: 'route-a', next: ['11A'] },
      { id: '11A', label: '11上', row: 0, col: 10, type: 'route-a', next: ['12A'] },
      { id: '12A', label: '12上', row: 1, col: 10, type: 'route-a', next: ['13'] },
      // Route B (竹 - 6 steps to 13)
      { id: '6B', label: '6中', row: 1, col: 6, type: 'route-b', next: ['7B'] },
      { id: '7B', label: '7中', row: 1, col: 7, type: 'route-b', next: ['8B'] },
      { id: '8B', label: '8中', row: 1, col: 8, type: 'route-b', next: ['9B'] },
      { id: '9B', label: '9中', row: 1, col: 9, type: 'route-b', next: ['10B'] },
      { id: '10B', label: '10中', row: 2, col: 8, type: 'route-b', next: ['13'] },
      // Route C (藤 - 5 steps to 13)
      { id: '6C', label: '6下', row: 2, col: 5, type: 'route-c', next: ['7C'] },
      { id: '7C', label: '7下', row: 2, col: 6, type: 'route-c', next: ['8C'] },
      { id: '8C', label: '8下', row: 2, col: 7, type: 'route-c', next: ['9C'] },
      { id: '9C', label: '9下', row: 3, col: 8, type: 'route-c', next: ['13'] },
      // Common End
      { id: '13', label: '13', row: 2, col: 9, type: 'common', next: ['14'] },
      { id: '14', label: '14', row: 2, col: 10, type: 'common', next: ['15'] },
      { id: '15', label: '15', row: 3, col: 10, type: 'common', next: ['16'] },
      { id: '16', label: '16', row: 4, col: 10, type: 'common', next: ['17'] },
      { id: '17', label: '17', row: 4, col: 9, type: 'common', next: ['18'] },
      { id: '18', label: '18', row: 4, col: 8, type: 'common', next: ['19'] },
      { id: '19', label: '19', row: 4, col: 7, type: 'common', next: ['20'] },
      { id: '20', label: '終', row: 3, col: 7, type: 'common', next: [] },
    ]
  },
  30: {
    maxNode: 30,
    nodes: [
      { id: '0', label: '始', row: 1, col: 0, type: 'common', next: ['1'] },
      { id: '1', label: '1', row: 1, col: 1, type: 'common', next: ['2'] },
      { id: '2', label: '2', row: 1, col: 2, type: 'common', next: ['3'] },
      { id: '3', label: '3', row: 1, col: 3, type: 'common', next: ['4'] },
      { id: '4', label: '4', row: 1, col: 4, type: 'common', next: ['5'] },
      { id: '5', label: '5', row: 1, col: 5, type: 'common', next: ['6'] },
      { id: '6', label: '6', row: 1, col: 6, type: 'common', next: ['7'] },
      { id: '7', label: '7', row: 1, col: 7, type: 'common', next: ['8A', '8B', '8C'] },
      // Route A (桜 - 11 steps to 18)
      { id: '8A', label: '8上', row: 0, col: 7, type: 'route-a', next: ['9A'] },
      { id: '9A', label: '9上', row: 0, col: 8, type: 'route-a', next: ['10A'] },
      { id: '10A', label: '10上', row: 0, col: 9, type: 'route-a', next: ['11A'] },
      { id: '11A', label: '11上', row: 0, col: 10, type: 'route-a', next: ['12A'] },
      { id: '12A', label: '12上', row: 0, col: 11, type: 'route-a', next: ['13A'] },
      { id: '13A', label: '13上', row: 1, col: 11, type: 'route-a', next: ['14A'] },
      { id: '14A', label: '14上', row: 2, col: 11, type: 'route-a', next: ['15A'] },
      { id: '15A', label: '15上', row: 3, col: 11, type: 'route-a', next: ['16A'] },
      { id: '16A', label: '16上', row: 4, col: 11, type: 'route-a', next: ['17A'] },
      { id: '17A', label: '17上', row: 4, col: 10, type: 'route-a', next: ['18'] },
      // Route B (竹 - 8 steps to 18)
      { id: '8B', label: '8中', row: 1, col: 8, type: 'route-b', next: ['9B'] },
      { id: '9B', label: '9中', row: 1, col: 9, type: 'route-b', next: ['10B'] },
      { id: '10B', label: '10中', row: 1, col: 10, type: 'route-b', next: ['11B'] },
      { id: '11B', label: '11中', row: 2, col: 10, type: 'route-b', next: ['12B'] },
      { id: '12B', label: '12中', row: 3, col: 10, type: 'route-b', next: ['13B'] },
      { id: '13B', label: '13中', row: 3, col: 9, type: 'route-b', next: ['14B'] },
      { id: '14B', label: '14中', row: 3, col: 8, type: 'route-b', next: ['18'] },
      // Route C (藤 - 6 steps to 18)
      { id: '8C', label: '8下', row: 2, col: 7, type: 'route-c', next: ['9C'] },
      { id: '9C', label: '9下', row: 2, col: 6, type: 'route-c', next: ['10C'] },
      { id: '10C', label: '10下', row: 3, col: 6, type: 'route-c', next: ['11C'] },
      { id: '11C', label: '11下', row: 4, col: 6, type: 'route-c', next: ['12C'] },
      { id: '12C', label: '12下', row: 4, col: 7, type: 'route-c', next: ['18'] },
      // Common End
      { id: '18', label: '18', row: 4, col: 8, type: 'common', next: ['19'] },
      { id: '19', label: '19', row: 4, col: 9, type: 'common', next: ['20'] },
      { id: '20', label: '20', row: 5, col: 9, type: 'common', next: ['21'] },
      { id: '21', label: '21', row: 5, col: 8, type: 'common', next: ['22'] },
      { id: '22', label: '22', row: 5, col: 7, type: 'common', next: ['23'] },
      { id: '23', label: '23', row: 5, col: 6, type: 'common', next: ['24'] },
      { id: '24', label: '24', row: 5, col: 5, type: 'common', next: ['25'] },
      { id: '25', label: '25', row: 5, col: 4, type: 'common', next: ['26'] },
      { id: '26', label: '26', row: 5, col: 3, type: 'common', next: ['27'] },
      { id: '27', label: '27', row: 5, col: 2, type: 'common', next: ['28'] },
      { id: '28', label: '28', row: 5, col: 1, type: 'common', next: ['29'] },
      { id: '29', label: '29', row: 5, col: 0, type: 'common', next: ['30'] },
      { id: '30', label: '終', row: 4, col: 0, type: 'common', next: [] },
    ]
  }
};

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

function moveForward(fromNodeId, steps, preferredBranch, boardSize) {
  let current = fromNodeId;
  const layout = BOARD_LAYOUTS[boardSize];
  if (!layout) return current;
  
  for (let s = 0; s < steps; s++) {
    const node = layout.nodes.find(n => n.id === current);
    if (!node || !node.next || node.next.length === 0) break;
    
    if (node.next.length === 1) {
      current = node.next[0];
    } else {
      const pref = preferredBranch === 'C' ? 'C' : (preferredBranch === 'A' ? 'A' : 'B');
      current = node.next.find(n => n.endsWith(pref)) || node.next[0];
    }
  }
  return current;
}

const state = {
  myId: null,
  room: null,
  selectedBoardSize: 20,
  selectedMaxRounds: 20,
  isPrivate: false,
  isAnimating: false,
  selectedTrapType: null,
};

let pendingRoomUpdate = null;
let roomListInterval = null;
let chatMessages = [];
let chatToastTimer = null;

// 招待リンクのURLパラメータを検出
(function () {
  const code = new URLSearchParams(location.search).get('room');
  if (code) {
    document.getElementById('room-code-input').value = code.toUpperCase().slice(0, 4);
    document.getElementById('player-name').focus();
    history.replaceState(null, '', '/');
  }
})();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getTraditionalFace(num) {
  const kanji = ['', '一', '二', '三', '四', '五', '六'];
  return kanji[num] || '';
}

function playDiceRollAnimation(diceResult, rollerName) {
  return new Promise(async resolve => {
    const overlay = document.getElementById('dice-anim-overlay');
    if (!overlay) return resolve();

    // Show overlay
    overlay.classList.remove('hidden');
    
    const cupWrap = overlay.querySelector('.dice-cup-wrap');
    const tray = overlay.querySelector('#dice-tray');
    
    // Reset cup and tray
    cupWrap.className = 'dice-cup-wrap shake';
    tray.innerHTML = '';

    // Play shake sound
    SFX.diceRoll();
    await sleep(900);

    // Show name roll announcement in overlay
    const title = document.createElement('div');
    title.className = 'dice-roll-announcement';
    title.style.cssText = 'position:absolute;top:30px;color:#c9a84c;font-family:"Shippori Mincho",serif;font-size:1.2rem;font-weight:bold;text-shadow:0 2px 4px #000;z-index:1020;';
    title.textContent = `【${rollerName} の勝負】`;
    overlay.querySelector('.dice-anim-content').appendChild(title);

    // Rollout cup
    cupWrap.classList.remove('shake');
    cupWrap.classList.add('rollout');

    // Roll dice
    SFX.diceLand(diceResult);
    const dice = document.createElement('div');
    dice.className = `wood-dice face-${diceResult} roll`;
    dice.innerHTML = `<span class="wood-dice-face">${getTraditionalFace(diceResult)}</span>`;
    tray.appendChild(dice);

    await sleep(1500); // Watch dice for 1.5s

    // Hide overlay and clean up
    overlay.classList.add('hidden');
    title.remove();
    resolve();
  });
}

function createInkSplash(nodeId) {
  const boardEl = document.getElementById('board');
  if (!boardEl) return;
  const cell = boardEl.querySelector(`.board-cell[data-id="${nodeId}"]`);
  if (!cell) return;

  // Get or create overlay container
  let container = boardEl.parentElement.querySelector('.ink-splash-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'ink-splash-container';
    boardEl.parentElement.appendChild(container);
  }

  // Get cell center relative to the board-container
  const boardParent = boardEl.parentElement;
  const containerRect = boardParent.getBoundingClientRect();
  const cLeft = boardParent.clientLeft || 0;
  const cTop = boardParent.clientTop || 0;
  const cellRect = cell.getBoundingClientRect();
  const cx = cellRect.left - containerRect.left - cLeft + cellRect.width / 2;
  const cy = cellRect.top - containerRect.top - cTop + cellRect.height / 2;

  // Create particles
  const particleCount = 18;
  for (let i = 0; i < particleCount; i++) {
    const blot = document.createElement('div');
    blot.className = 'ink-blot';
    
    blot.style.left = `${cx}px`;
    blot.style.top = `${cy}px`;
    
    const size = Math.random() * 24 + 8;
    blot.style.width = `${size}px`;
    blot.style.height = `${size}px`;
    
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 70 + 30;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    const scale = Math.random() * 0.8 + 0.3;

    blot.style.setProperty('--tx', `${tx}px`);
    blot.style.setProperty('--ty', `${ty}px`);
    blot.style.setProperty('--scale', scale);

    container.appendChild(blot);
    
    blot.offsetHeight; // force reflow
    blot.classList.add('burst');

    setTimeout(() => {
      blot.remove();
      if (container.children.length === 0) {
        container.remove();
      }
    }, 800);
  }
}

function drawBoardPaths(room) {
  const svg = document.getElementById('board-paths-overlay');
  if (!svg) return;
  svg.innerHTML = '';

  const layout = BOARD_LAYOUTS[room.boardSize];
  if (!layout) return;

  const boardEl = document.getElementById('board');
  if (!boardEl) return;

  // Align SVG wrapper to the board elements size
  svg.style.width = `${boardEl.scrollWidth}px`;
  svg.style.height = `${boardEl.scrollHeight}px`;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <marker id="arrow-common" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 7 5 L 0 8.5 z" class="path-arrow-common"/>
    </marker>
    <marker id="arrow-route-a" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 7 5 L 0 8.5 z" class="path-arrow-a"/>
    </marker>
    <marker id="arrow-route-b" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 7 5 L 0 8.5 z" class="path-arrow-b"/>
    </marker>
    <marker id="arrow-route-c" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1.5 L 7 5 L 0 8.5 z" class="path-arrow-c"/>
    </marker>
  `;
  svg.appendChild(defs);

  const container = boardEl.parentElement;
  const containerRect = container.getBoundingClientRect();
  const cLeft = container.clientLeft || 0;
  const cTop = container.clientTop || 0;

  for (const node of layout.nodes) {
    if (!node.next || node.next.length === 0) continue;

    const fromCell = boardEl.querySelector(`.board-cell[data-id="${node.id}"]`);
    if (!fromCell) continue;

    const fromCellRect = fromCell.getBoundingClientRect();
    const fromRect = {
      x: fromCellRect.left - containerRect.left - cLeft + fromCellRect.width / 2,
      y: fromCellRect.top - containerRect.top - cTop + fromCellRect.height / 2,
    };

    for (const nxtId of node.next) {
      const toCell = boardEl.querySelector(`.board-cell[data-id="${nxtId}"]`);
      if (!toCell) continue;

      const toCellRect = toCell.getBoundingClientRect();
      const toRect = {
        x: toCellRect.left - containerRect.left - cLeft + toCellRect.width / 2,
        y: toCellRect.top - containerRect.top - cTop + toCellRect.height / 2,
      };

      let routeClass = 'route-common';
      let markerId = 'arrow-common';
      if (node.type === 'route-a' || nxtId.endsWith('A')) {
        routeClass = 'route-route-a';
        markerId = 'arrow-route-a';
      } else if (node.type === 'route-b' || nxtId.endsWith('B')) {
        routeClass = 'route-route-b';
        markerId = 'arrow-route-b';
      } else if (node.type === 'route-c' || nxtId.endsWith('C')) {
        routeClass = 'route-route-c';
        markerId = 'arrow-route-c';
      }

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const dx = toRect.x - fromRect.x;
      const dy = toRect.y - fromRect.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      let d = `M ${fromRect.x} ${fromRect.y} L ${toRect.x} ${toRect.y}`;
      if (node.next.length > 1) {
        const mx = (fromRect.x + toRect.x) / 2;
        const my = (fromRect.y + toRect.y) / 2;
        let ox = -dy / dist * 14;
        let oy = dx / dist * 14;
        
        if (nxtId.endsWith('A')) { ox = -dy/dist * 18; oy = dx/dist * 18; }
        else if (nxtId.endsWith('C')) { ox = dy/dist * 18; oy = -dx/dist * 18; }

        d = `M ${fromRect.x} ${fromRect.y} Q ${mx + ox} ${my + oy} ${toRect.x} ${toRect.y}`;
      }

      path.setAttribute('d', d);
      path.setAttribute('class', `board-path-line ${routeClass}`);
      path.setAttribute('marker-end', `url(#${markerId})`);

      svg.appendChild(path);
    }
  }
}

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
  myTurn() {
    tone(523, 'sine', 0.12, 0.35);
    tone(659, 'sine', 0.12, 0.38, 0.11);
    tone(784, 'sine', 0.18, 0.45, 0.22);
  },
  trap(type) {
    const map = {
      pitfall:    () => { tone(300,'sawtooth',0.07,0.5); tone(200,'sawtooth',0.18,0.4,0.1); tone(130,'sawtooth',0.28,0.35,0.22); },
      blockade:   () => { tone(200,'square',0.22,0.5); tone(160,'square',0.14,0.3,0.12); },
      headwind:   () => { for (let i=0;i<6;i++) tone(220-i*12,'sawtooth',0.1,0.22,i*0.05); },
      swap:       () => { [700,500,700].forEach((f,i)=>tone(f,'sine',0.09,0.4,i*0.1)); },
      magnet:     () => { [300,450,600,750].forEach((f,i)=>tone(f,'triangle',0.12,0.45,i*0.08)); },
      torrent:    () => { for (let i=0;i<8;i++) tone(400-i*30,'sine',0.08,0.2,i*0.05); },
      involveAll: () => { tone(180,'sawtooth',0.35,0.6); for (let i=0;i<4;i++) tone(140+i*15,'sawtooth',0.14,0.3,0.1+i*0.07); },
      random:     () => { for (let i=0;i<7;i++) tone(200+Math.random()*700,'sine',0.09,0.28,i*0.06); },
      gather:     () => { [400,480,560,640,560].forEach((f,i)=>tone(f,'sine',0.13,0.42,i*0.08)); },
      fireworks:  () => {
        tone(600, 'sawtooth', 0.2, 0.4);
        tone(300, 'sawtooth', 0.3, 0.5, 0.05);
        for (let i = 0; i < 5; i++) {
          tone(1000 + Math.random() * 400, 'sine', 0.05, 0.15, 0.2 + i * 0.08);
        }
      },
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

document.getElementById('btn-leave-waiting').addEventListener('click', () => {
  localStorage.removeItem('sugoroku_token');
  location.reload();
});

document.getElementById('btn-copy-code').addEventListener('click', () => {
  const code = document.getElementById('room-code-display').textContent.trim();
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    showNotification('コードをコピーしました！\n' + code, 1800);
  }).catch(() => {
    showNotification('コピーできませんでした\nコード: ' + code, 2500);
  });
});

document.getElementById('btn-copy-invite').addEventListener('click', () => {
  const code = document.getElementById('room-code-display').textContent.trim();
  if (!code) return;
  const url = `${location.origin}/?room=${code}`;
  navigator.clipboard.writeText(url).then(() => {
    showNotification('招待リンクをコピーしました！\nリンクを友達に送ってください', 2200);
  }).catch(() => {
    showNotification('招待リンク:\n' + url, 5000);
  });
});

// ========= Chat =========
function showChatToast(name, message, color) {
  const el = document.getElementById('chat-toast');
  if (!el) return;
  el.innerHTML = `💬 <span style="color:${escHtml(color)};font-weight:bold">${escHtml(name)}</span>: ${escHtml(message)}`;
  el.classList.remove('hidden');
  clearTimeout(chatToastTimer);
  chatToastTimer = setTimeout(() => el.classList.add('hidden'), 3000);
}

function renderChatLog() {
  const el = document.getElementById('chat-log');
  if (!el) return;
  el.innerHTML = chatMessages.map(c =>
    `<div class="chat-entry">💬 <span class="chat-name" style="color:${escHtml(c.color)}">${escHtml(c.name)}</span>: ${escHtml(c.message)}</div>`
  ).join('');
}

function sendChat() {
  const input = document.getElementById('chat-input');
  if (!input) return;
  const msg = input.value.trim();
  if (!msg || !state.room) return;
  socket.emit('chat', { message: msg });
  input.value = '';
}

document.getElementById('btn-chat-send').addEventListener('click', sendChat);
document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendChat();
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

document.getElementById('toggle-private').addEventListener('change', e => {
  state.isPrivate = e.target.checked;
});

// ========= Lobby =========
document.getElementById('btn-create').addEventListener('click', () => {
  const name = getPlayerName();
  if (!name) return;
  socket.emit('create-room', { playerName: name, boardSize: state.selectedBoardSize, maxRounds: state.selectedMaxRounds, isPrivate: state.isPrivate }, ({ roomCode, room, error, reconnectToken }) => {
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

let turnAnnouncementTimer = null;

function showTurnAnnouncement(text, isMyTurn, duration = 2200) {
  document.querySelectorAll('.turn-announcement').forEach(el => el.remove());
  clearTimeout(turnAnnouncementTimer);
  const el = document.createElement('div');
  el.className = 'turn-announcement' + (isMyTurn ? ' is-my-turn' : '');
  el.textContent = text;
  document.body.appendChild(el);
  turnAnnouncementTimer = setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => { if (el.parentNode) el.remove(); }, 400);
  }, duration);
}

function applyRoomUpdate(room) {
  const prev = state.room;

  // 自分のゴールを検出
  if (prev) {
    const prevMe = prev.players.find(p => p.id === state.myId);
    const nextMe = room.players.find(p => p.id === state.myId);
    if (prevMe && nextMe && !prevMe.finished && nextMe.finished) SFX.goal();
  }

  // フェーズ・ターン変化アナウンス
  if (prev) {
    const ps = prev.status, ns = room.status;
    // ゲーム開始
    if (ps === 'lobby' && ns === 'placement') {
      showTurnAnnouncement('🎲 ゲーム開始！', false, 2000);
    }
    // アクション→配置フェーズ
    else if (ps === 'action' && ns === 'placement') {
      showTurnAnnouncement(`🃏 第${room.round}回 配置フェーズ`, false, 1800);
    }
    // アクションターン変化
    if (ns === 'action') {
      const prevId = prev.currentActionPlayerId;
      const nextId = room.currentActionPlayerId;
      if (nextId && prevId !== nextId) {
        if (nextId === state.myId) {
          showTurnAnnouncement('🎲 あなたのターン！', true, 2500);
          SFX.myTurn();
        } else {
          const p = room.players.find(q => q.id === nextId);
          if (p) showTurnAnnouncement(`🎲 ${p.name} のターン`, false, 1800);
        }
      }
    }
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

// ========= 他プレイヤーのアクションアニメーション =========
socket.on('player-action', async ({ playerId, diceResult, skipped, fromPos, toPos, trapResults }) => {
  if (state.isAnimating || !state.room) return;
  const roller = state.room.players.find(p => p.id === playerId);
  if (!roller) return;

  state.isAnimating = true;

  if (skipped) {
    SFX.skip();
    showNotification(`💤 ${escHtml(roller.name)} はお休み`, 1500);
    await sleep(700);
  } else if (diceResult) {
    // 他のプレイヤーのサイコロも筒アニメーションで演出
    await playDiceRollAnimation(diceResult, roller.name);
    if (toPos && toPos !== fromPos) {
      await animatePlayerMove(playerId, fromPos, toPos, state.room);
    }
  }

  if (trapResults && trapResults.length > 0) {
    for (const r of trapResults) {
      await animateTrapEffect(r, playerId);
    }
  }

  state.isAnimating = false;

  if (pendingRoomUpdate) {
    const room = pendingRoomUpdate;
    pendingRoomUpdate = null;
    applyRoomUpdate(room);
  }
});

socket.on('room-update', (room) => {
  if (state.isAnimating) { pendingRoomUpdate = room; return; }
  applyRoomUpdate(room);
});

socket.on('chat-message', ({ name, message, color }) => {
  chatMessages.unshift({ name, message, color });
  if (chatMessages.length > 15) chatMessages.length = 15;
  renderChatLog();
  showChatToast(name, message, color);
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
  const layout = BOARD_LAYOUTS[bs];
  if (!layout) return;

  const colCount = Math.max(...layout.nodes.map(n => n.col)) + 1;
  const rowCount = Math.max(...layout.nodes.map(n => n.row)) + 1;

  const { cellSize, rowHeight, gap } = calcCellLayout(colCount);
  boardEl.style.gridTemplateColumns = `repeat(${colCount}, ${cellSize}px)`;
  boardEl.style.gridTemplateRows = `repeat(${rowCount}, ${rowHeight}px)`;
  boardEl.style.gap = `${gap}px`;

  const isPlacement = room.status === 'placement' && !room.myPlacedThisRound;
  const myPlayer = room.players.find(p => p.id === state.myId);

  for (const node of room.board) {
    const cell = document.createElement('div');
    cell.className = 'board-cell';
    cell.dataset.id = node.square;
    cell.style.gridRow = node.row + 1;
    cell.style.gridColumn = node.col + 1;

    // Deterministic hash based on node.square to assign stone shape/rotation class
    const hash = String(node.square).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const stoneType = (hash % 4) + 1;
    cell.classList.add(`stone-${stoneType}`);

    if (node.type) {
      cell.classList.add(node.type);
    }

    if (node.square === '0') {
      cell.classList.add('start');
    } else if (node.square === String(room.boardSize)) {
      cell.classList.add('goal');
    }

    const label = document.createElement('div');
    label.className = 'cell-label';
    label.textContent = node.label;
    cell.appendChild(label);

    // 自分が置いた仕掛けのみ表示
    if (node.myTrapCount > 0) {
      const trapDiv = document.createElement('div');
      trapDiv.className = 'trap-indicator my-trap';
      trapDiv.textContent = '📌'.repeat(Math.min(node.myTrapCount, 3));
      trapDiv.title = `自分の仕掛け ${node.myTrapCount}個`;
      cell.appendChild(trapDiv);
    }

    // プレイヤートークン
    const tokensHere = room.players.filter(p => p.finished ? node.square === String(room.boardSize) : p.position === node.square);
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

    // 配置クリック（スタート・ゴールを除く全マス）
    const isStartOrGoal = (node.square === '0' || node.square === String(room.boardSize));
    const isCardSelected = state.selectedTrapType !== null || room.myForcedTrapType !== null;
    const canPlace = isPlacement && myPlayer && !myPlayer.finished && !isStartOrGoal && isCardSelected;

    if (canPlace) {
      cell.classList.add('placeable');
      cell.addEventListener('click', () => doPlaceTrap(node.square));
    }

    boardEl.appendChild(cell);
  }
  // 街道接続線を再描画 ＆ モバイル縮小フィット
  setTimeout(() => {
    resetBoardScale();
    drawBoardPaths(room);
    adjustBoardScale();
  }, 0);
}

function doPlaceTrap(square) {
  if (state.isAnimating) return;
  const trapType = state.room?.myForcedTrapType || state.selectedTrapType;
  if (!trapType) {
    showError('仕掛けが選択されていません');
    return;
  }
  stopCountdown();
  socket.emit('place-trap', { square, trapType }, ({ error }) => {
    if (error) { startCountdown(); return showError(error); }
    SFX.place();
    state.selectedTrapType = null;
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

  const path = findPath(fromPos, toPos, baseRoom.boardSize);
  if (path.length <= 1) return;

  const ms = path.length >= 7 ? 100 : path.length >= 5 ? 130 : 160;

  for (let i = 1; i < path.length; i++) {
    player.position = path[i];
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

async function animateTrapEffect(r, rollerId = state.myId) {
  const base = getTrapBase(r.type);
  SFX.trap(base);
  showTrapReveal(r);

  // トラップ発動時の墨しぶきパーティクル演出
  const currentPos = state.room?.players.find(p => p.id === rollerId)?.position;
  if (currentPos) {
    createInkSplash(currentPos);
  }

  // トークンアニメーション
  if (r.type === 'involveAll') {
    document.querySelectorAll('.player-token').forEach(t => addTokenAnim(t, 'anim-trap-shake'));
  } else if (r.type === 'gather') {
    document.querySelectorAll('.player-token').forEach(t => addTokenAnim(t, 'anim-trap-gather'));
  } else if (r.type === 'fireworks') {
    const ids = [rollerId, ...r.affectedDetails.map(a => a.id)];
    ids.forEach(id => {
      const token = document.querySelector(`.player-token[data-pid="${id}"]`);
      if (token) addTokenAnim(token, 'anim-trap-shake');
    });
  } else {
    const token = document.querySelector(`.player-token[data-pid="${rollerId}"]`);
    if (token) {
      let animClass = `anim-trap-${base}`;
      if (base === 'magnet') animClass = 'anim-trap-swap';
      if (base === 'torrent') animClass = 'anim-trap-shake';
      addTokenAnim(token, animClass);
    }
  }

  await sleep(1300);

  if (state.room) {
    // 単体移動系: roller のみ移動
    const singleMoveTypes = ['pitfall', 'swap-fail', 'gather-fail', 'magnet-fail', 'magnet', 'torrent'];
    if (singleMoveTypes.includes(r.type) && r.oldPos !== undefined && r.newPos !== undefined && r.oldPos !== r.newPos) {
      const tempPlayers = state.room.players.map(p => ({ ...p }));
      const tempRoom = { ...state.room, players: tempPlayers };
      const player = tempRoom.players.find(p => p.id === rollerId);
      if (player) {
        player.position = r.oldPos;
        renderBoard(tempRoom);
        await sleep(120);
        await animatePlayerMove(rollerId, r.oldPos, r.newPos, tempRoom);
      }
    }

    // スワップ: roller と placer 両方を移動
    if (r.type === 'swap' && r.playerOldPos !== undefined && r.placerId) {
      const tempPlayers = state.room.players.map(p => ({
        ...p,
        position: p.id === rollerId ? r.playerOldPos : p.position,
      }));
      const tempRoom = { ...state.room, players: tempPlayers };
      renderBoard(tempRoom);
      await sleep(120);
      await animatePlayerMove(rollerId, r.playerOldPos, r.playerNewPos, tempRoom);
      const rollerInTemp = tempRoom.players.find(p => p.id === rollerId);
      if (rollerInTemp) rollerInTemp.position = r.playerNewPos;
      await animatePlayerMove(r.placerId, r.placerOldPos, r.placerNewPos, tempRoom);
    }

    // 全員巻き込み: 影響を受けた全プレイヤーを後退
    if (r.type === 'involveAll' && r.affectedDetails && r.affectedDetails.length > 0) {
      const posMap = Object.fromEntries(r.affectedDetails.map(a => [a.id, a.oldPos]));
      const tempPlayers = state.room.players.map(p => ({
        ...p,
        position: p.id === rollerId ? r.rollerPos
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

    // 大筒花火: 発動者が後退したのち、巻き込まれた全員が後退
    if (r.type === 'fireworks' && r.rollerOldPos !== undefined && r.rollerNewPos !== undefined && r.rollerOldPos !== r.rollerNewPos) {
      const tempPlayers = state.room.players.map(p => ({ ...p }));
      const tempRoom = { ...state.room, players: tempPlayers };
      const player = tempRoom.players.find(p => p.id === rollerId);
      if (player) {
        player.position = r.rollerOldPos;
        r.affectedDetails.forEach(a => {
          const p = tempRoom.players.find(q => q.id === a.id);
          if (p) p.position = a.oldPos;
        });

        renderBoard(tempRoom);
        await sleep(150);

        // 発動者を4マス後退
        await animatePlayerMove(rollerId, r.rollerOldPos, r.rollerNewPos, tempRoom);
        const playerInTemp = tempRoom.players.find(p => p.id === rollerId);
        if (playerInTemp) playerInTemp.position = r.rollerNewPos;

        // 巻き込まれた隣接プレイヤー全員を2マス後退
        for (const a of r.affectedDetails) {
          if (a.oldPos !== a.newPos) {
            await animatePlayerMove(a.id, a.oldPos, a.newPos, tempRoom);
            const tp = tempRoom.players.find(p => p.id === a.id);
            if (tp) tp.position = a.newPos;
          }
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
  
  const layout = BOARD_LAYOUTS[room.boardSize];

  for (const p of room.players) {
    const entry = document.createElement('div');
    entry.className = 'player-entry';
    if (p.id === room.currentActionPlayerId) entry.classList.add('current-turn');
    if (p.finished) entry.classList.add('finished');

    const statuses = [];
    if (p.finished) statuses.push(`${p.finishRank}位 🏁`);
    if (p.skipNextTurn) statuses.push('お休み');
    if (p.halfDice) statuses.push('逆風中');

    const node = layout ? layout.nodes.find(n => n.id === p.position) : null;
    const posLabel = node ? node.label : p.position;
    const posText = p.finished ? 'GOAL' : (posLabel === '始' || posLabel === '終' ? posLabel : `${posLabel}マス目`);

    // Route badge
    let routeBadge = '';
    if (!p.finished && p.preferredBranch) {
      if (p.preferredBranch === 'A') routeBadge = '<span class="p-route-badge route-a-badge" title="桜街道 (上路)">🌸</span>';
      else if (p.preferredBranch === 'B') routeBadge = '<span class="p-route-badge route-b-badge" title="竹林街道 (中路)">🎋</span>';
      else if (p.preferredBranch === 'C') routeBadge = '<span class="p-route-badge route-c-badge" title="藤街道 (下路)">🌊</span>';
    }

    const isSelf = p.id === state.myId;
    entry.innerHTML = `
      <div class="p-token" style="background:${p.color}"></div>
      <div class="p-info">
        <div class="p-name">${isSelf ? '★ ' : ''}${escHtml(p.name)} ${routeBadge}</div>
        <div class="p-pos">${posText}</div>
      </div>
      ${statuses.length ? `<div class="p-status">${statuses.join(' ')}</div>` : ''}
    `;
    list.appendChild(entry);
  }
}

// ========= Route Selector =========
function renderRouteSelector() {
  const myPlayer = state.room?.players.find(p => p.id === state.myId);
  if (!myPlayer || myPlayer.finished) return null;

  const currentRoute = state.room.myPreferredRoute || 'B';

  const wrap = document.createElement('div');
  wrap.className = 'route-selector-wrap';

  const label = document.createElement('div');
  label.className = 'route-selector-label';
  label.textContent = '📍 進路選択 (道標)';
  wrap.appendChild(label);

  const btnGroup = document.createElement('div');
  btnGroup.className = 'route-selector-btns';

  const routes = [
    { key: 'A', name: '🌸 桜街道 (安全/長)', cls: 'route-btn-a' },
    { key: 'B', name: '🎋 竹林街道 (標準)', cls: 'route-btn-b' },
    { key: 'C', name: '🌊 藤街道 (近道/難)', cls: 'route-btn-c' },
  ];

  routes.forEach(r => {
    const btn = document.createElement('button');
    btn.className = `route-select-btn ${r.cls}`;
    if (currentRoute === r.key) {
      btn.classList.add('selected');
    }
    btn.textContent = r.name;
    btn.addEventListener('click', () => {
      if (currentRoute === r.key) return;
      SFX.step();
      socket.emit('change-route', { route: r.key }, ({ error }) => {
        if (error) showError(error);
      });
    });
    btnGroup.appendChild(btn);
  });

  wrap.appendChild(btnGroup);
  return wrap;
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

  // 進路選択の道標をコントロールパネル上部に表示
  const routeSelector = renderRouteSelector();
  if (routeSelector) {
    panel.appendChild(routeSelector);
  }

  const phaseDiv = document.createElement('div');
  phaseDiv.className = 'phase-controls-wrap';
  panel.appendChild(phaseDiv);

  if (room.status === 'placement') {
    if (room.myPlacedThisRound) {
      const waiting = room.waitingForPlacement;
      phaseDiv.innerHTML = `<div class="waiting-turn">⏳ 待機中... あと ${waiting.length}人 (${waiting.map(n => escHtml(n)).join(', ')})</div>`;
    } else {
      renderTrapSelection(phaseDiv, room);
    }
    return;
  }

  if (room.status === 'action') {
    if (room.currentActionPlayerId === state.myId) {
      renderDiceRoll(phaseDiv);
    } else {
      const current = room.players.find(p => p.id === room.currentActionPlayerId);
      phaseDiv.innerHTML = `<div class="waiting-turn">⏳ ${current ? escHtml(current.name) : '?'} のターンです...</div>`;
    }
  }
}

function renderTrapSelection(panel, room) {
  const wrap = document.createElement('div');
  wrap.className = 'trap-selection';

  // ヘッダー
  const header = document.createElement('div');
  header.className = 'trap-selection-title';
  header.textContent = '手札から配置する仕掛けを選択してください';
  wrap.appendChild(header);

  // 手札3枚表示
  const cardsContainer = document.createElement('div');
  cardsContainer.className = 'trap-cards-container';

  const hand = room.myHand || [];
  
  // 現在選択されているトラップが手札に無ければリセット
  if (state.selectedTrapType && !hand.includes(state.selectedTrapType)) {
    state.selectedTrapType = null;
  }

  hand.forEach(type => {
    const def = TRAP_DEFS.find(t => t.type === type);
    if (!def) return;
    
    const card = document.createElement('div');
    card.className = 'assigned-trap-card hand-card';
    if (state.selectedTrapType === type) {
      card.classList.add('selected');
    }
    card.innerHTML = `
      <span class="trap-card-emoji">${def.emoji}</span>
      <div class="trap-card-info">
        <div class="trap-card-name">${def.name}</div>
        <div class="trap-card-desc">${def.desc}</div>
      </div>
    `;
    card.addEventListener('click', () => {
      SFX.step();
      if (state.selectedTrapType === type) {
        state.selectedTrapType = null;
      } else {
        state.selectedTrapType = type;
      }
      renderBoard(room); // 盤面の配置ハイライトを更新
      renderTrapSelection(panel, room); // 手札の選択表示を更新
    });
    cardsContainer.appendChild(card);
  });
  wrap.appendChild(cardsContainer);

  // 配置指示
  const hint = document.createElement('div');
  hint.className = 'trap-placement-hint';
  const activeSelected = state.selectedTrapType;
  if (activeSelected) {
    hint.textContent = '👆 スタートとゴールを除く、盤面のいずれかのマスをクリックして設置';
  } else {
    hint.textContent = '👈 設置する仕掛け札（木札）を選択してください';
  }
  wrap.appendChild(hint);

  const timer = document.createElement('div');
  timer.id = 'kick-timer';
  timer.className = 'kick-timer';
  wrap.appendChild(timer);
  updateCountdown();

  panel.innerHTML = '';
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

    // サイコロ筒の演出オーバーレイを表示
    const overlay = document.getElementById('dice-anim-overlay');
    if (overlay) {
      overlay.classList.remove('hidden');
      const cupWrap = overlay.querySelector('.dice-cup-wrap');
      const tray = overlay.querySelector('#dice-tray');
      cupWrap.className = 'dice-cup-wrap shake';
      tray.innerHTML = '';
    }
    SFX.diceRoll();

    const myPlayer = state.room?.players.find(p => p.id === state.myId);
    const fromPos = myPlayer ? myPlayer.position : '0';

    // サーバーへロール要求（通信とアニメーションの並行処理）
    const resultPromise = new Promise(resolve => socket.emit('roll-dice', resolve));
    
    // 最低限900msはシェイクアニメーションを見せる
    const [result] = await Promise.all([
      resultPromise,
      sleep(900),
    ]);

    const { diceResult, skipped, toPos, trapResults, error } = result;

    if (error) {
      if (overlay) overlay.classList.add('hidden');
      state.isAnimating = false;
      showError(error);
      return;
    }

    if (skipped) {
      if (overlay) overlay.classList.add('hidden');
      SFX.skip();
      showNotification('お休みです！', 1500);
      await sleep(800);
    } else if (diceResult) {
      if (overlay) {
        const cupWrap = overlay.querySelector('.dice-cup-wrap');
        const tray = overlay.querySelector('#dice-tray');
        cupWrap.classList.remove('shake');
        cupWrap.classList.add('rollout');

        // サイコロを盆に転がす
        SFX.diceLand(diceResult);
        const dice = document.createElement('div');
        dice.className = `wood-dice face-${diceResult} roll`;
        dice.innerHTML = `<span class="wood-dice-face">${getTraditionalFace(diceResult)}</span>`;
        tray.appendChild(dice);
      }

      await sleep(1500); // 出目をじっくり見せる
      if (overlay) {
        overlay.classList.add('hidden');
        const title = overlay.querySelector('.dice-roll-announcement');
        if (title) title.remove();
      }

      // コマ移動アニメーション
      if (toPos && toPos !== fromPos && state.room) {
        await animatePlayerMove(state.myId, fromPos, toPos, state.room);
      }
    } else {
      if (overlay) overlay.classList.add('hidden');
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
    fireworks:    `${base}🎆 大筒花火！\n${r.placerName} の罠！\n発動マスと隣接マスの全員を巻き込む！`,
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
// ========= 遊び方 / 更新情報 =========
document.getElementById('btn-howto').addEventListener('click', () => {
  document.getElementById('howto-modal').classList.remove('hidden');
});
document.getElementById('btn-close-howto').addEventListener('click', () => {
  document.getElementById('howto-modal').classList.add('hidden');
});
document.getElementById('howto-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

document.getElementById('btn-changelog').addEventListener('click', () => {
  document.getElementById('changelog-modal').classList.remove('hidden');
});
document.getElementById('btn-close-changelog').addEventListener('click', () => {
  document.getElementById('changelog-modal').classList.add('hidden');
});
document.getElementById('changelog-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
});

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

// 画面リサイズ時に縮小フィット・接続線を再計算するイベント
window.addEventListener('resize', () => {
  if (state.room) {
    resetBoardScale();
    drawBoardPaths(state.room);
    adjustBoardScale();
  }
});

function resetBoardScale() {
  const wrapper = document.querySelector('.board-wrapper');
  const container = document.querySelector('.board-container');
  if (!wrapper || !container) return;

  container.style.transform = 'none';
  container.style.margin = '0';
  wrapper.style.height = 'auto';

  // Force reflow to get true unscaled dimensions
  container.offsetHeight;
}

function adjustBoardScale() {
  if (!state.room) return;
  const wrapper = document.querySelector('.board-wrapper');
  const container = document.querySelector('.board-container');
  if (!wrapper || !container) return;

  const wrapperWidth = wrapper.clientWidth - 20; // 10px padding on each side
  const containerWidth = container.offsetWidth;

  if (containerWidth > wrapperWidth && wrapperWidth > 100) {
    const scale = wrapperWidth / containerWidth;
    container.style.transform = `scale(${scale})`;
    container.style.transformOrigin = 'top left';
    
    const scaledHeight = container.offsetHeight * scale;
    wrapper.style.height = `${scaledHeight + 20}px`;
  } else {
    container.style.transform = 'none';
    container.style.margin = '0 auto';
    wrapper.style.height = 'auto';
  }
}
