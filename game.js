(() => {
  'use strict';

  /* =====================================================================
   *  1. SETTINGS  — change numbers here, no need to touch the code below
   * ===================================================================== */
  const CFG = {
    grid: 20,                 // board is grid x grid cells
    cell: 18,                 // pixel size of one cell (canvas = grid * cell)
    startSpeed: 150,          // ms per move at start (lower = faster)
    minSpeed: 70,             // fastest the game can get
    speedStep: 3,             // speed-up (ms) every time something is eaten

    foods: ['🍔', '🍟', '🥤'],

    points: { food: 10, lemon: 20, giant: 20, dual: 50, triple: 20 },

    lemon:  { chance: 0.2, ttl: 50 },            // rare bonus after eating
    big:    { afterEats: 5, chance: 0.5, ttl: 80 }, // 🍔 giant / 🍫 chocolate
    dual:   { ms: 30000, maxLen: 9 },            // Dual Snake mode
    triple: { ms: 20000, foods: 3 },             // Three-Headed mode (3 foods on board)
    enemy:  { len: 4, everyTicks: 1 },           // enemy snake in Three-Headed mode
                                                 // everyTicks: 1 = same speed as you, 2 = half speed

    api: 'https://4th-place-leaderboard.fahimzim12.workers.dev',
    leaderboardRefreshMs: 20000,

    colors: {
      bg: '#b5d62b', bgAlt: '#a3c41f', ink: '#1d2a0c',
      snakeA: '#1d2a0c', snakeB: '#0f4c5c',
      snakeC: '#7b3fb5', snakeD: '#d45a24', enemy: '#c0201a',
      dead: '#7a2a1a', gold: '#ffd500'
    }
  };

  const N = CFG.grid, S = CFG.cell, SIZE = N * S, C = CFG.colors;
  const $ = id => document.getElementById(id);
  const setText = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const rnd = n => Math.floor(Math.random() * n);
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  const cv = $('c');
  if (!cv) { console.error('Canvas #c not found'); return; }
  const ctx = cv.getContext('2d');

  /* =====================================================================
   *  2. AUDIO
   * ===================================================================== */
  const gameOverSound = new Audio('./gameover.mp3');
  const bigFoodSound = new Audio('./Link Road 9 20.m4a');
  let AC = null, master = null, muted = false;
  let musicTimer = null, musicStep = 0, khBuf = null, khLoading = false;

  const MELODY = [523,0,659,784,659,0,523,392, 587,0,698,880,698,0,587,440,
                  523,659,784,1047,784,659,523,0, 392,494,587,494,392,0,330,0];
  const BASS = [131,131,196,196,147,147,220,220, 131,131,196,196,98,98,165,165];

  function ac() {
    try {
      if (!AC) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        AC = new Ctor();
        master = AC.createGain();
        master.gain.value = 0.5;
        master.connect(AC.destination);
      }
      if (AC.state === 'suspended') AC.resume();
      return AC;
    } catch (e) { return null; }
  }

  function tone(freq, time, dur, type, vol) {
    if (!AC) return;
    try {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(Math.max(vol, 0.0001), time);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);
      o.connect(g); g.connect(master);
      o.start(time); o.stop(time + dur + 0.02);
    } catch (e) {}
  }

  function musicTick() {
    if (!AC || muted) return;
    const t = AC.currentTime + 0.02, i = musicStep % MELODY.length;
    if (MELODY[i]) tone(MELODY[i], t, 0.16, 'square', 0.07);
    if (i % 2 === 0) tone(BASS[(i >> 1) % BASS.length], t, 0.28, 'triangle', 0.12);
    musicStep++;
  }
  function musicStart() { if (!ac()) return; clearInterval(musicTimer); musicTimer = setInterval(musicTick, 140); }
  function musicStop() { clearInterval(musicTimer); musicTimer = null; }

  function blip() {
    if (muted || !ac()) return;
    const t = AC.currentTime;
    tone(880, t, 0.08, 'square', 0.12);
    tone(1320, t + 0.07, 0.1, 'square', 0.12);
  }

  function scream() {
    if (muted || !ac()) return;
    try {
      const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(500, t);
      o.frequency.exponentialRampToValueAtTime(1500, t + 0.25);
      o.frequency.exponentialRampToValueAtTime(350, t + 1.1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 1.15);
    } catch (e) {}
  }

  // Decode the embedded "khaichi" sound (from khaichi-data.js) once.
  function loadKh() {
    if (khBuf || khLoading || !AC || typeof KH64 === 'undefined') return;
    khLoading = true;
    try {
      const bin = atob(KH64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      AC.decodeAudioData(bytes.buffer, b => { khBuf = b; khLoading = false; }, () => { khLoading = false; });
    } catch (e) { khLoading = false; }
  }

  function khaichi() {
    if (muted || !ac()) return;
    loadKh();
    if (khBuf) {
      try {
        const src = AC.createBufferSource(), g = AC.createGain();
        src.buffer = khBuf; src.playbackRate.value = 1.03; g.gain.value = 1.2;
        src.connect(g); g.connect(master); src.start();
        return;
      } catch (e) {}
    }
    // Fallback: browser voice (only used if the embedded sound isn't ready yet)
    try {
      if (!('speechSynthesis' in window)) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance('খাইছি!');
      u.lang = 'bn-BD'; u.rate = 1.2; u.pitch = 0;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* =====================================================================
   *  3. GAME STATE
   * ===================================================================== */
  // snakes = [{ body: [{x,y}, ...], color }]
  //   normal mode: 1 snake · dual mode: 2 snakes · triple mode: 3 snakes
  let snakes, dir, queue, foods, lemon, big, mode, modeEnd, sinceBig, flash;
  let enemy = null, enemyTick = 0;   // enemy: { y, left, dx, len } — a bar sliding along row y
  let score = 0, speed = CFG.startSpeed, alive = false, timer = null;
  let best = Number(store.get('4p_best', 0)) || 0;
  setText('bs', best);

  // mode: 'normal' | 'dual' | 'triple'
  // enemy: only exists in triple mode. It patrols ONE row, left->right then right->left.
  //        Touching it (with any of your snakes) = game over.
  // big : the 2x2 power-up on the board -> { x, y, ttl, kind: 'giant'|'choco', e }

  const onSnakes = (x, y) => snakes.some(s => s.body.some(c => c.x === x && c.y === y));
  const onBig = (x, y) => !!big && x >= big.x && x < big.x + 2 && y >= big.y && y < big.y + 2;
  const isLemon = (x, y) => !!lemon && lemon.x === x && lemon.y === y;
  const foodAt = (x, y) => foods.findIndex(f => f.x === x && f.y === y);
  const onEnemy = (x, y) => !!enemy && y === enemy.y && x >= enemy.left && x < enemy.left + enemy.len;
  const occupied = (x, y) => onSnakes(x, y) || onEnemy(x, y) || onBig(x, y) || isLemon(x, y) || foodAt(x, y) >= 0;

  // Random empty cell (or null if the board is full). Can never loop forever.
  function free() {
    for (let i = 0; i < N * N * 2; i++) {
      const x = rnd(N), y = rnd(N);
      if (!occupied(x, y)) return { x, y };
    }
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++)
        if (!occupied(x, y)) return { x, y };
    return null;
  }

  // Normal = 1 food on the board, Dual = 2, Triple = 3 (see CFG.triple.foods).
  function topUpFood() {
    const target = mode === 'triple' ? CFG.triple.foods : mode === 'dual' ? 2 : 1;
    while (foods.length < target) {
      const p = free();
      if (!p) break;
      p.e = CFG.foods[rnd(CFG.foods.length)];
      foods.push(p);
    }
  }

  function spawnBig() {
    if (big || mode !== 'normal') return;
    for (let t = 0; t < 200; t++) {
      const x = rnd(N - 1), y = rnd(N - 1);
      if (!occupied(x, y) && !occupied(x + 1, y) && !occupied(x, y + 1) && !occupied(x + 1, y + 1)) {
        big = {
          x, y, ttl: CFG.big.ttl,
          kind: Math.random() < 0.5 ? 'giant' : 'choco',
          e: CFG.foods[rnd(CFG.foods.length)]
        };
        sinceBig = 0;
        return;
      }
    }
  }

  const say = text => { flash = { text, until: Date.now() + 1300 }; };

  /* ---------- Dual Snake mode (🍔 giant food) ---------- */
  function startDual() {
    const d = { x: dir.x, y: dir.y };
    const p = { x: Math.abs(d.y), y: Math.abs(d.x) };       // sideways direction
    const total = snakes[0].body.length;
    const lenA = Math.min(CFG.dual.maxLen, Math.max(2, Math.ceil(total / 2)));
    const lenB = Math.min(CFG.dual.maxLen, Math.max(2, Math.floor(total / 2)));
    const len = Math.max(lenA, lenB);
    const head = snakes[0].body[0];

    // Does a pair of side-by-side snakes fit with centre cell c?
    const fits = c => {
      for (let i = -4; i < len; i++)
        for (let l = -2; l <= 2; l++)
          if (!inBounds(c.x + p.x * l - d.x * i, c.y + p.y * l - d.y * i)) return false;
      return true;
    };

    // Use the fitting spot closest to where the snake is now.
    let spot = null, bestDist = Infinity;
    for (let x = 0; x < N; x++)
      for (let y = 0; y < N; y++) {
        if (!fits({ x, y })) continue;
        const dist = Math.abs(x - head.x) + Math.abs(y - head.y);
        if (dist < bestDist) { spot = { x, y }; bestDist = dist; }
      }
    if (!spot) spot = { x: N >> 1, y: N >> 1 };

    const make = (side, length) => {
      const body = [];
      for (let i = 0; i < length; i++)
        body.push({ x: spot.x + p.x * side - d.x * i, y: spot.y + p.y * side - d.y * i });
      return body;
    };

    snakes = [{ body: make(-1, lenA), color: C.snakeA }, { body: make(1, lenB), color: C.snakeB }];
    mode = 'dual';
    modeEnd = Date.now() + CFG.dual.ms;
    lemon = null; big = null;
    foods = foods.filter(f => !onSnakes(f.x, f.y));
    say('DUAL SNAKE!');
  }

  function endDual() {
    // Slide snake B back onto A's path and append it: the merged snake "unfurls".
    const [A, B] = snakes;
    const off = { x: B.body[0].x - A.body[0].x, y: B.body[0].y - A.body[0].y };
    A.body = A.body.concat(B.body.map(c => ({ x: c.x - off.x, y: c.y - off.y })));
    snakes = [A];
    mode = 'normal';
    if (foods.length > 1) foods.length = 1;
    sinceBig = 0;
    say('MERGED!');
  }

  /* ---------- Three-Headed mode (🍫 chocolate) ---------- */
  function startTriple() {
    const p = { x: Math.abs(dir.y), y: Math.abs(dir.x) };
    const head = snakes[0].body[0];
    const axis = p.x ? head.x : head.y;
    const offsets = axis >= 2 ? [-2, -1] : [1, 2];

    const make = off => {
      const body = [];
      for (let i = 0; i < Math.min(3, snakes[0].body.length); i++)
        body.push({ x: head.x + p.x * off - dir.x * i, y: head.y + p.y * off - dir.y * i });
      return body;
    };
    const b = make(offsets[0]), c = make(offsets[1]);

    if (![...b, ...c].every(q => inBounds(q.x, q.y))) { say('NO ROOM!'); return; }

    snakes.push({ body: b, color: C.snakeC }, { body: c, color: C.snakeD });
    mode = 'triple';
    modeEnd = Date.now() + CFG.triple.ms;
    foods = []; lemon = null; big = null;
    spawnEnemy(head);
    say('THREE HEADS!');
  }

  // Enemy patrols a random row that none of your snakes are on right now,
  // and starts at the side farthest from you.
  function spawnEnemy(head) {
    const len = CFG.enemy.len;
    const busy = new Set();
    snakes.forEach(s => s.body.forEach(c => busy.add(c.y)));
    let rows = [];
    for (let y = 0; y < N; y++) if (!busy.has(y)) rows.push(y);
    if (!rows.length) for (let y = 0; y < N; y++) rows.push(y);
    const fromLeft = head.x >= N / 2;           // you're on the right -> enemy starts at the left
    enemy = { y: rows[rnd(rows.length)], left: fromLeft ? 0 : N - len, dx: fromLeft ? 1 : -1, len };
    enemyTick = 0;
  }

  // Slide the enemy one cell; turn around when it reaches either wall.
  function moveEnemy() {
    if (!enemy) return;
    if (++enemyTick < CFG.enemy.everyTicks) return;
    enemyTick = 0;
    if (enemy.left + enemy.dx < 0 || enemy.left + enemy.dx + enemy.len > N) enemy.dx = -enemy.dx;
    enemy.left += enemy.dx;
  }

  function endTriple() {
    snakes = [snakes[0]];
    mode = 'normal';
    enemy = null;
    foods = [];
    topUpFood();
    sinceBig = 0;
    say('BACK TO NORMAL!');
  }

  /* =====================================================================
   *  4. GAME LOOP
   * ===================================================================== */
  function reset() {
    snakes = [{ body: [{ x: 6, y: 10 }, { x: 5, y: 10 }, { x: 4, y: 10 }], color: C.snakeA }];
    dir = { x: 1, y: 0 };
    queue = [];
    foods = []; lemon = null; big = null; enemy = null;
    mode = 'normal'; modeEnd = 0; sinceBig = 0; flash = null;
    score = 0; speed = CFG.startSpeed;
    topUpFood();
    setText('sc', 0);
    draw();
  }

  function start() {
    ac(); loadKh(); setTimeout(loadKh, 300);
    clearTimeout(timer);
    reset();
    alive = true;
    $('start') && $('start').classList.add('hide');
    $('over') && $('over').classList.add('hide');
    musicStart();
    loop();
  }

  // The loop ALWAYS schedules the next step, even if tick() throws an error.
  // (A missing function inside tick() used to stop the loop = frozen snake.)
  function loop() {
    clearTimeout(timer);
    if (!alive) return;
    try { tick(); } catch (e) { console.error('tick error:', e); }
    if (alive) timer = setTimeout(loop, speed);
  }

  // Would this head cell eat something? (no changes made)
  function canEat(h) {
    return foodAt(h.x, h.y) >= 0 ||
      (mode === 'normal' && (isLemon(h.x, h.y) || onBig(h.x, h.y)));
  }

  // Eat whatever is at h. Returns 'food' | 'lemon' | 'giant' | 'choco' | null
  function eat(h) {
    const fi = foodAt(h.x, h.y);
    if (fi >= 0) {
      foods.splice(fi, 1);
      score += mode === 'triple' ? 500 : CFG.points[mode === 'normal' ? 'food' : mode];   // food / dual / triple
      return 'food';
    }
    if (mode !== 'normal') return null;
    if (isLemon(h.x, h.y)) { score += CFG.points.lemon; lemon = null; return 'lemon'; }
    if (onBig(h.x, h.y)) {
      const kind = big.kind;
      if (kind === 'giant') score += CFG.points.giant;
      big = null;
      return kind;
    }
    return null;
  }

  function tick() {
    const now = Date.now();
    if (mode === 'dual' && now >= modeEnd) endDual();
    if (mode === 'triple' && now >= modeEnd) endTriple();

    if (queue.length) dir = queue.shift();

    // Enemy moves first; if it ran into any part of your snakes, you lose.
    moveEnemy();
    if (enemy && snakes.some(s => s.body.some(c => onEnemy(c.x, c.y)))) return die();

    const heads = snakes.map(s => ({ x: s.body[0].x + dir.x, y: s.body[0].y + dir.y }));

    // 1) wall / self collision
    for (let i = 0; i < heads.length; i++) {
      const h = heads[i], body = snakes[i].body;
      if (!inBounds(h.x, h.y) || onEnemy(h.x, h.y)) return die();
      const check = canEat(h) ? body : body.slice(0, -1);   // tail moves away unless we grow
      if (check.some(c => c.x === h.x && c.y === h.y)) return die();
    }

    // 2) move + eat
    let ate = 0, regular = 0, bigKind = null;
    snakes.forEach((s, i) => {
      s.body.unshift(heads[i]);
      const r = eat(heads[i]);
      if (r) {
        ate++;
        if (r === 'food') regular++;
        if (r === 'giant' || r === 'choco') bigKind = r;
      }
      if (!r) s.body.pop();                        // grow only when something was eaten
    });

    if (bigKind === 'giant') startDual();
    else if (bigKind === 'choco') startTriple();

    topUpFood();

    // 3) maybe spawn lemon / big power-up (normal mode only)
    if (regular && mode === 'normal') {
      if (!lemon && Math.random() < CFG.lemon.chance) {
        const p = free();
        if (p) lemon = { x: p.x, y: p.y, ttl: CFG.lemon.ttl };
      }
      if (!big && ++sinceBig >= CFG.big.afterEats && Math.random() < CFG.big.chance) spawnBig();
    }

    // 4) score, speed, sound
    if (ate) {
      setText('sc', score);
      speed = Math.max(CFG.minSpeed, speed - CFG.speedStep);
      if (bigKind) {
        try { bigFoodSound.currentTime = 0; bigFoodSound.play().catch(() => {}); } catch (e) {}
      } else { blip(); khaichi(); }
    }

    // 5) timers for items on the board
    if (lemon && --lemon.ttl <= 0) lemon = null;
    if (big && --big.ttl <= 0) { big = null; sinceBig = 0; }

    draw();
  }

  function die() {
    alive = false;
    clearTimeout(timer);
    musicStop();
    scream();
    try { gameOverSound.currentTime = 0; const p = gameOverSound.play(); p && p.catch && p.catch(() => {}); } catch (e) {}
    draw(true);

    if (score > best) { best = score; setText('bs', best); store.set('4p_best', String(best)); }
    if ($('res')) $('res').innerHTML = 'YOU SCORED<br><b style="font-size:18px">' + score + '</b>';
    $('over') && $('over').classList.remove('hide');
    submit(score);
  }

  /* =====================================================================
   *  5. DRAWING
   * ===================================================================== */
  function drawSnake(s, dead) {
    s.body.forEach((part, i) => {
      ctx.fillStyle = dead ? C.dead : s.color;
      ctx.fillRect(part.x * S + 1, part.y * S + 1, S - 2, S - 2);
      if (i === 0) {                                  // eyes
        ctx.fillStyle = C.bg;
        const ex = dir.x ? (dir.x > 0 ? 11 : 3) : 4;
        const ey = dir.y ? (dir.y > 0 ? 11 : 3) : 4;
        ctx.fillRect(part.x * S + (dir.x ? ex : 4),  part.y * S + (dir.y ? ey : 4),  3, 3);
        ctx.fillRect(part.x * S + (dir.x ? ex : 11), part.y * S + (dir.y ? ey : 11), 3, 3);
      }
    });
  }

  function drawEnemy() {
    for (let i = 0; i < enemy.len; i++) {
      const x = enemy.left + i;
      ctx.fillStyle = C.enemy;
      ctx.fillRect(x * S + 1, enemy.y * S + 1, S - 2, S - 2);
      ctx.fillStyle = '#fff';                                    // belly stripe
      ctx.fillRect(x * S + 4, enemy.y * S + 8, S - 8, 2);
    }
    const hx = enemy.dx > 0 ? enemy.left + enemy.len - 1 : enemy.left;   // head = leading end
    ctx.fillStyle = C.gold;                                      // angry eyes
    ctx.fillRect(hx * S + (enemy.dx > 0 ? 11 : 3), enemy.y * S + 3, 3, 3);
    ctx.fillRect(hx * S + (enemy.dx > 0 ? 11 : 3), enemy.y * S + 11, 3, 3);
  }

  function drawBig() {
    const blink = big.ttl < 15 && big.ttl % 2;
    ctx.globalAlpha = blink ? 0.35 : 1;
    if (big.kind === 'giant') {
      ctx.fillStyle = 'rgba(255,213,0,' + (0.35 + 0.25 * Math.sin(Date.now() / 150)) + ')';
    } else {
      ctx.fillStyle = '#6b351b';
    }
    ctx.fillRect(big.x * S, big.y * S, S * 2, S * 2);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    ctx.strokeRect(big.x * S + 1, big.y * S + 1, S * 2 - 2, S * 2 - 2);
    ctx.font = '30px serif';
    ctx.fillText(big.kind === 'giant' ? big.e : '🍫', big.x * S + S, big.y * S + S + 2);
    ctx.globalAlpha = 1;
  }

  function drawCountdown(total, normalColor) {
    const left = Math.max(0, modeEnd - Date.now());
    const secs = Math.ceil(left / 1000);
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, SIZE, 6);
    ctx.fillStyle = secs <= 5 ? '#ff6b3d' : normalColor;
    ctx.fillRect(1, 1, (SIZE - 2) * (left / total), 4);
  }

  function drawBigNumber(px) {          // faint countdown number behind everything
    const secs = Math.max(0, Math.ceil((modeEnd - Date.now()) / 1000));
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = C.ink;
    ctx.font = px + 'px "Press Start 2P", monospace';
    ctx.fillText(String(secs), SIZE / 2, SIZE / 2);
    ctx.globalAlpha = 1;
  }

  function draw(dead) {
    // background checkerboard
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = C.bgAlt;
    for (let x = 0; x < N; x++)
      for (let y = 0; y < N; y++)
        if ((x + y) % 2 === 0) ctx.fillRect(x * S, y * S, S, S);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (!dead && mode === 'dual') drawBigNumber(110);
    if (!dead && mode === 'triple') drawBigNumber(90);

    ctx.font = '15px serif';
    const emojiAt = (e, x, y) => ctx.fillText(e, x * S + S / 2, y * S + S / 2 + 1);

    foods.forEach(f => emojiAt(f.e, f.x, f.y));

    if (lemon) {
      ctx.globalAlpha = lemon.ttl < 12 && lemon.ttl % 2 ? 0.3 : 1;
      emojiAt('🍋', lemon.x, lemon.y);
      ctx.globalAlpha = 1;
    }

    if (big) { drawBig(); ctx.font = '15px serif'; }

    if (enemy) drawEnemy();
    for (let i = snakes.length - 1; i >= 0; i--) drawSnake(snakes[i], dead);

    if (!dead && mode === 'dual') drawCountdown(CFG.dual.ms, C.gold);
    if (!dead && mode === 'triple') drawCountdown(CFG.triple.ms, '#b46cff');

    if (flash && !dead) {               // short banner: DUAL SNAKE! / MERGED! ...
      if (Date.now() < flash.until) {
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.fillStyle = C.ink;  ctx.fillText(flash.text, SIZE / 2 + 2, SIZE / 2 + 2);
        ctx.fillStyle = C.gold; ctx.fillText(flash.text, SIZE / 2, SIZE / 2);
      } else flash = null;
    }
  }

  /* =====================================================================
   *  6. CONTROLS (keyboard, on-screen pad, swipe)
   * ===================================================================== */
  const DIRS = {
    u: { x: 0, y: -1 }, d: { x: 0, y: 1 }, l: { x: -1, y: 0 }, r: { x: 1, y: 0 }
  };
  const KEYS = {
    arrowup: 'u', arrowdown: 'd', arrowleft: 'l', arrowright: 'r',
    w: 'u', s: 'd', a: 'l', d: 'r'
  };

  // Turns are queued (max 2) so quick double-taps like "up, left" are never lost,
  // and each one is checked against the previous turn so you can't reverse into yourself.
  function turn(name) {
    const m = DIRS[name];
    if (!m || !alive) return;
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (m.x === last.x && m.y === last.y) return;       // same direction
    if (m.x === -last.x && m.y === -last.y) return;     // 180° reverse
    if (queue.length < 2) queue.push(m);
  }

  window.addEventListener('keydown', e => {
    const name = KEYS[String(e.key).toLowerCase()];
    if (!name) return;
    if (alive) e.preventDefault();
    turn(name);
  });

  document.querySelectorAll('.pad button').forEach(b =>
    b.addEventListener('pointerdown', e => { e.preventDefault(); turn(b.dataset.d); })
  );

  let tx = null, ty = null;
  cv.addEventListener('touchstart', e => {
    if (!e.touches.length) return;
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  cv.addEventListener('touchmove', e => {
    if (tx === null || !e.touches.length) return;
    const dx = e.touches[0].clientX - tx, dy = e.touches[0].clientY - ty;
    if (Math.abs(dx) > 22 || Math.abs(dy) > 22) {
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'd' : 'u'));
      tx = ty = null;
    }
  }, { passive: true });
  cv.addEventListener('touchend', () => { tx = ty = null; }, { passive: true });

  /* =====================================================================
   *  7. BUTTONS
   * ===================================================================== */
  if ($('go')) $('go').onclick = () => {
    const name = $('nm').value.trim();
    if (!name) { $('nm').focus(); return; }
    store.set('4p_name', name);
    start();
  };
  if ($('again')) $('again').onclick = start;
  if ($('nm')) $('nm').value = store.get('4p_name', '');

  const muteBtn = document.createElement('button');
  muteBtn.className = 'mute';
  muteBtn.textContent = '🔊';
  muteBtn.onclick = () => {
    muted = !muted;
    muteBtn.textContent = muted ? '🔇' : '🔊';
    if (muted && 'speechSynthesis' in window) speechSynthesis.cancel();
  };
  const screenEl = document.querySelector('.scr');
  if (screenEl) screenEl.appendChild(muteBtn);

  /* =====================================================================
   *  8. LEADERBOARD (Cloudflare worker, with this-device fallback)
   * ===================================================================== */
  let rows = [];

  const esc = v => String(v).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

  function render() {
    if (!$('lb')) return;
    const medals = ['🥇', '🥈', '🥉'];
    const sorted = rows.slice().sort((a, b) => b.score - a.score).slice(0, 200);
    $('lb').innerHTML = sorted.length
      ? sorted.map((r, i) =>
          '<div><span class="n">' + (i < 3 ? medals[i] : '#' + (i + 1)) + ' ' + esc(r.name) +
          '</span><b>' + r.score + '</b></div>').join('')
      : '<div>No scores yet. Be the first!</div>';
  }

  function loadLocal() {
    try {
      const data = JSON.parse(store.get('4p_lb', '[]'));
      rows = Array.isArray(data)
        ? data.filter(r => r && typeof r.name === 'string' && Number.isFinite(Number(r.score)))
        : [];
    } catch (e) { rows = []; }
  }

  function saveLocalScore(name, value) {
    loadLocal();
    const old = rows.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (old) old.score = Math.max(Number(old.score) || 0, value);
    else rows.push({ name, score: value });
    store.set('4p_lb', JSON.stringify(rows));
    render();
  }

  function getPlayerId() {
    let id = store.get('4p_player_id', '');
    if (!id) {
      id = 'p_' + (window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now() + '_' + Math.random().toString(36).slice(2));
      store.set('4p_player_id', id);
    }
    return id;
  }

  async function fetchTop() {
    try {
      const res = await fetch(CFG.api + '/leaderboard');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Leaderboard unavailable');
      rows = (data.scores || []).map(s => ({ name: s.player_name, score: Number(s.best_score) || 0 }));
      render();
      setText('lbnote', 'Live leaderboard · same for everyone.');
    } catch (e) {
      loadLocal(); render();
      setText('lbnote', 'Online leaderboard unavailable. Showing this device’s saved scores.');
      console.warn('Leaderboard load failed:', e);
    }
  }

  async function submit(value) {
    const name = ($('nm') ? $('nm').value.trim().slice(0, 20) : '') || 'Player';
    saveLocalScore(name, value);          // local backup first
    try {
      const res = await fetch(CFG.api + '/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: getPlayerId(), player_name: name, score: value })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Score could not be saved');
      await fetchTop();
    } catch (e) {
      setText('lbnote', 'Online leaderboard unavailable. Score saved on this device.');
      console.warn('Score submit failed:', e);
    }
  }

  /* =====================================================================
   *  9. START UP
   * ===================================================================== */
  reset();
  if ($('lb')) $('lb').innerHTML = '<div>Loading…</div>';
  fetchTop();
  setInterval(fetchTop, CFG.leaderboardRefreshMs);

  // Test hook (does nothing in the real game)
  if (window.__TEST__) window.__TEST__({ start, tick, turn, get: () => ({ alive, mode, score, snakes, big, foods, enemy }) });
})();
