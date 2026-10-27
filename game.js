(function () {
  'use strict';

  // ---------- SETUP ----------
  const N = 20;
  const S = 18;
  const SIZE = N * S;

  const cv = document.getElementById('c');
  if (!cv) {
    console.error('Game canvas #c was not found.');
    return;
  }

  const ctx = cv.getContext('2d');
  const $ = id => document.getElementById(id);

  const gameOverSound = new Audio('./gameover.mp3');
  gameOverSound.preload = 'auto';

  const FOODS = ['🍔', '🍟', '🥤'];
  const INK = '#1d2a0c';

  let snake = [];
  let dir = { x: 1, y: 0 };
  let nd = { x: 1, y: 0 };
  let foods = [];
  let giant = null;        // giant food that triggers Dual Snake Mode
  let snakeB = null;       // second snake (only exists during Dual Mode)
  let dual = false;
  let dualEnd = 0;
  let sinceGiant = 0;
  let flash = null;

  const DUAL_MS = 30000;   // Dual Mode lasts 30 seconds
  const DUAL_POINTS = 50;  // points per regular food in Dual Mode
  const GIANT_POINTS = 20; // points for eating the giant food itself
  const GIANT_TTL = 80;    // ticks the giant food stays on the board
  const DUAL_MAX_LEN = 9;  // max length of each snake when splitting
  const INK_B = '#0f4c5c'; // colour of the second snake
  let score = 0;
  let alive = false;
  let timer = null;
  let speed = 150;
  let best = 0;
  let bonus = null;

  try {
    best = Number(localStorage.getItem('4p_best')) || 0;
  } catch (e) {}

  if ($('bs')) $('bs').textContent = best;

  // ---------- AUDIO ----------
  let AC = null;
  let master = null;
  let muted = false;
  let musicOn = false;
  let musicTimer = null;
  let musicStep = 0;
  let khBuf = null;
  let khLoading = false;
  let bnVoice = null;

  const melody = [
    523, 0, 659, 784, 659, 0, 523, 392,
    587, 0, 698, 880, 698, 0, 587, 440,
    523, 659, 784, 1047, 784, 659, 523, 0,
    392, 494, 587, 494, 392, 0, 330, 0
  ];

  const bass = [
    131, 131, 196, 196, 147, 147, 220, 220,
    131, 131, 196, 196, 98, 98, 165, 165
  ];

  function ac() {
    try {
      if (!AC) {
        const AudioCtx =
          window.AudioContext || window.webkitAudioContext;

        if (!AudioCtx) return null;

        AC = new AudioCtx();
        master = AC.createGain();
        master.gain.value = 0.5;
        master.connect(AC.destination);
      }

      if (AC.state === 'suspended') AC.resume();
      return AC;
    } catch (e) {
      console.warn('Audio unavailable:', e);
      return null;
    }
  }

  function tone(freq, time, duration, type, volume, destination) {
    if (!AC || !master) return;

    try {
      const osc = AC.createOscillator();
      const gain = AC.createGain();

      osc.type = type;
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(Math.max(volume, 0.0001), time);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        time + duration
      );

      osc.connect(gain);
      gain.connect(destination || master);

      osc.start(time);
      osc.stop(time + duration + 0.02);
    } catch (e) {}
  }

  function scheduleMusic() {
    if (!AC || !musicOn || muted) return;

    const time = AC.currentTime + 0.02;
    const i = musicStep % melody.length;

    if (melody[i]) {
      tone(melody[i], time, 0.16, 'square', 0.07);
    }

    if (i % 2 === 0) {
      tone(
        bass[(i >> 1) % bass.length],
        time,
        0.28,
        'triangle',
        0.12
      );
    }

    musicStep++;
  }

  function musicStart() {
    if (!ac()) return;

    musicOn = true;
    clearInterval(musicTimer);
    musicTimer = setInterval(scheduleMusic, 140);
  }

  function musicStop() {
    musicOn = false;
    clearInterval(musicTimer);
    musicTimer = null;
  }

  function blip() {
    if (!ac() || muted) return;

    const time = AC.currentTime;
    tone(880, time, 0.08, 'square', 0.12);
    tone(1320, time + 0.07, 0.1, 'square', 0.12);
  }

  function scream() {
    if (!ac() || muted) return;

    const time = AC.currentTime;

    try {
      const osc = AC.createOscillator();
      const gain = AC.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(500, time);
      osc.frequency.exponentialRampToValueAtTime(
        1500,
        time + 0.25
      );
      osc.frequency.exponentialRampToValueAtTime(
        350,
        time + 1.1
      );

      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.2, time + 0.05);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        time + 1.1
      );

      osc.connect(gain);
      gain.connect(master);
      osc.start(time);
      osc.stop(time + 1.15);
    } catch (e) {}
  }

  function pickVoice() {
    try {
      if (!('speechSynthesis' in window)) return;

      const voices = speechSynthesis.getVoices();
      const bengali = voices.filter(v =>
        /^bn/i.test(v.lang) ||
        /bengali|bangla/i.test(v.name)
      );

      bnVoice =
        bengali.find(v =>
          /\bmale\b|madhur|pradeep|bashkar/i.test(v.name) &&
          !/female/i.test(v.name)
        ) || bengali[0] || null;
    } catch (e) {}
  }

  try {
    pickVoice();

    if ('speechSynthesis' in window) {
      speechSynthesis.onvoiceschanged = pickVoice;
    }
  } catch (e) {}

  function loadKh() {
    if (
      khBuf ||
      !AC ||
      khLoading ||
      typeof KH64 === 'undefined'
    ) {
      return;
    }

    khLoading = true;

    try {
      const binary = atob(KH64);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      AC.decodeAudioData(
        bytes.buffer,
        buffer => {
          khBuf = buffer;
          khLoading = false;
        },
        () => {
          khLoading = false;
        }
      );
    } catch (e) {
      khLoading = false;
    }
  }

  function khaichi() {
    if (muted || !ac()) return;

    loadKh();

    if (khBuf) {
      try {
        const source = AC.createBufferSource();
        const gain = AC.createGain();

        source.buffer = khBuf;
        source.playbackRate.value = 1.03;
        gain.gain.value = 1.2;

        source.connect(gain);
        gain.connect(master);
        source.start();

        return;
      } catch (e) {}
    }

    try {
      if ('speechSynthesis' in window) {
        speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance('খাইছি!');
        utterance.lang = 'bn-BD';
        utterance.rate = 1.2;
        utterance.pitch = 0;

        if (bnVoice) {
          utterance.voice = bnVoice;
          utterance.lang = bnVoice.lang;
        }

        speechSynthesis.speak(utterance);
      }
    } catch (e) {}
  }

  // ---------- GAME LOGIC ----------
  function rnd(n) {
    return Math.floor(Math.random() * n);
  }

  function inBounds(x, y) {
    return x >= 0 && y >= 0 && x < N && y < N;
  }

  function onSnakes(x, y) {
    return (
      snake.some(s => s.x === x && s.y === y) ||
      (snakeB && snakeB.some(s => s.x === x && s.y === y))
    );
  }

  function onGiant(x, y) {
    return (
      !!giant &&
      x >= giant.x && x < giant.x + 2 &&
      y >= giant.y && y < giant.y + 2
    );
  }

  function occupied(x, y) {
    return (
      onSnakes(x, y) ||
      onGiant(x, y) ||
      foods.some(f => f.x === x && f.y === y) ||
      (bonus && bonus.x === x && bonus.y === y)
    );
  }

  function free() {
    let p;

    do {
      p = { x: rnd(N), y: rnd(N) };
    } while (occupied(p.x, p.y));

    return p;
  }

  function spawnFood() {
    const f = free();
    f.e = FOODS[rnd(FOODS.length)];
    foods.push(f);
  }

  // 1 food normally, 2 foods during Dual Mode (so both snakes have a target)
  function topUpFood() {
    const target = dual ? 2 : 1;
    while (foods.length < target) spawnFood();
  }

  function spawnGiant() {
    for (let t = 0; t < 200; t++) {
      const x = rnd(N - 1);
      const y = rnd(N - 1);

      if (
        !occupied(x, y) && !occupied(x + 1, y) &&
        !occupied(x, y + 1) && !occupied(x + 1, y + 1)
      ) {
        giant = {
          x: x,
          y: y,
          ttl: GIANT_TTL,
          e: FOODS[rnd(FOODS.length)]
        };
        sinceGiant = 0;
        return;
      }
    }
  }

  function say(text) {
    flash = { text: text, until: Date.now() + 1300 };
  }

  // ----- Dual Snake Mode -----
  function startDual() {
    const d = { x: dir.x, y: dir.y };
    const p = { x: Math.abs(d.y), y: Math.abs(d.x) }; // perpendicular lane direction

    const total = snake.length;
    const lenA = Math.min(DUAL_MAX_LEN, Math.max(2, Math.ceil(total / 2)));
    const lenB = Math.min(DUAL_MAX_LEN, Math.max(2, Math.floor(total / 2)));
    const len = Math.max(lenA, lenB);
    const head = snake[0];

    // The pair needs room: both lanes, a margin on each side, and 4 cells ahead.
    function fits(c) {
      for (let i = -4; i < len; i++) {
        for (let l = -2; l <= 2; l++) {
          if (!inBounds(
            c.x + p.x * l - d.x * i,
            c.y + p.y * l - d.y * i
          )) {
            return false;
          }
        }
      }
      return true;
    }

    // Place the pair as close as possible to where the snake currently is.
    let best = null;
    let bestDist = Infinity;

    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        const c = { x: x, y: y };
        if (!fits(c)) continue;

        const dist = Math.abs(x - head.x) + Math.abs(y - head.y);
        if (dist < bestDist) {
          best = c;
          bestDist = dist;
        }
      }
    }

    if (!best) best = { x: N >> 1, y: N >> 1 };

    const a = [];
    const b = [];

    for (let i = 0; i < lenA; i++) {
      a.push({
        x: best.x - p.x - d.x * i,
        y: best.y - p.y - d.y * i
      });
    }

    for (let i = 0; i < lenB; i++) {
      b.push({
        x: best.x + p.x - d.x * i,
        y: best.y + p.y - d.y * i
      });
    }

    snake = a;
    snakeB = b;
    dual = true;
    dualEnd = Date.now() + DUAL_MS;

    // Move anything the new snakes landed on.
    foods = foods.filter(f => !onSnakes(f.x, f.y));
    if (bonus && onSnakes(bonus.x, bonus.y)) bonus = null;

    say('DUAL SNAKE!');
  }

  function endDual() {
    // The second snake is a shifted copy of the first one's path, so sliding
    // it back onto the first snake and appending it makes the merged snake
    // "unfurl" to the combined length as it moves.
    const off = {
      x: snakeB[0].x - snake[0].x,
      y: snakeB[0].y - snake[0].y
    };

    const shifted = snakeB.map(c => ({
      x: c.x - off.x,
      y: c.y - off.y
    }));

    snake = snake.concat(shifted);
    snakeB = null;
    dual = false;
    dualEnd = 0;

    if (foods.length > 1) foods.length = 1; // back to a single food
    sinceGiant = 0;

    say('MERGED!');
  }

  function reset() {
    snake = [
      { x: 6, y: 10 },
      { x: 5, y: 10 },
      { x: 4, y: 10 }
    ];

    dir = { x: 1, y: 0 };
    nd = { x: 1, y: 0 };
    score = 0;
    speed = 150;
    bonus = null;
    foods = [];
    giant = null;
    snakeB = null;
    dual = false;
    dualEnd = 0;
    sinceGiant = 0;
    flash = null;

    topUpFood();

    if ($('sc')) $('sc').textContent = '0';

    draw();
  }

  function start() {
    ac();
    loadKh();

    setTimeout(loadKh, 300);

    clearTimeout(timer);
    reset();

    alive = true;

    if ($('start')) $('start').classList.add('hide');
    if ($('over')) $('over').classList.add('hide');

    musicStart();
    loop();
  }

  function loop() {
    clearTimeout(timer);

    if (!alive) return;

    tick();

    if (alive) {
      timer = setTimeout(loop, speed);
    }
  }

  function tick() {
    // Time's up: the two snakes merge back into one.
    if (dual && Date.now() >= dualEnd) endDual();

    dir = nd;

    const bodies = dual ? [snake, snakeB] : [snake];

    const heads = bodies.map(b => ({
      x: b[0].x + dir.x,
      y: b[0].y + dir.y
    }));

    // If EITHER snake crashes (wall, itself, or the other snake), the run ends.
    for (const h of heads) {
      if (!inBounds(h.x, h.y) || onSnakes(h.x, h.y)) {
        die();
        return;
      }
    }

    let ate = 0;
    let regular = 0;
    let giantHit = false;

    bodies.forEach((body, i) => {
      const h = heads[i];
      body.unshift(h);

      let got = false;
      const fi = foods.findIndex(f => f.x === h.x && f.y === h.y);

      if (fi >= 0) {
        foods.splice(fi, 1);
        score += dual ? DUAL_POINTS : 10;
        regular++;
        got = true;
      } else if (bonus && bonus.x === h.x && bonus.y === h.y) {
        score += dual ? DUAL_POINTS : 20;
        bonus = null;
        got = true;
      } else if (!dual && onGiant(h.x, h.y)) {
        score += GIANT_POINTS;
        giant = null;
        giantHit = true;
        got = true;
      }

      if (got) ate++;
      else body.pop();
    });

    // Giant food eaten -> split into two snakes.
    if (giantHit) startDual();

    topUpFood();

    if (regular && !dual) {
      if (!bonus && Math.random() < 0.2) {
        bonus = free();
        bonus.ttl = 50;
      }

      if (!giant && ++sinceGiant >= 5 && Math.random() < 0.5) {
        spawnGiant();
      }
    }

    if (ate) {
      if ($('sc')) $('sc').textContent = score;

      speed = Math.max(70, speed - 3);
      blip();
      khaichi();
    }

    if (bonus && --bonus.ttl <= 0) {
      bonus = null;
    }

    if (giant && --giant.ttl <= 0) {
      giant = null;
      sinceGiant = 0;
    }

    draw();
  }

  function die() {
    alive = false;
    clearTimeout(timer);
    musicStop();
    scream();

    try {
      gameOverSound.currentTime = 0;

      const playback = gameOverSound.play();

      if (playback && playback.catch) {
        playback.catch(e => {
          console.warn('Game-over sound could not play:', e);
        });
      }
    } catch (e) {}

    draw(true);

    if (score > best) {
      best = score;

      if ($('bs')) $('bs').textContent = best;

      try {
        localStorage.setItem('4p_best', String(best));
      } catch (e) {}
    }

    if ($('res')) {
      $('res').innerHTML =
        'YOU SCORED<br><b style="font-size:18px">' +
        score +
        '</b>';
    }

    if ($('over')) $('over').classList.remove('hide');

    submit(score);
  }

  function drawSnake(body, color, dead) {
    body.forEach((part, i) => {
      ctx.fillStyle = dead ? '#7a2a1a' : color;

      ctx.fillRect(
        part.x * S + 1,
        part.y * S + 1,
        S - 2,
        S - 2
      );

      if (i === 0) {
        ctx.fillStyle = '#b5d62b';

        const ex = dir.x ? (dir.x > 0 ? 11 : 3) : 4;
        const ey = dir.y ? (dir.y > 0 ? 11 : 3) : 4;

        ctx.fillRect(
          part.x * S + (dir.x ? ex : 4),
          part.y * S + (dir.y ? ey : 4),
          3,
          3
        );

        ctx.fillRect(
          part.x * S + (dir.x ? ex : 11),
          part.y * S + (dir.y ? ey : 11),
          3,
          3
        );
      }
    });
  }

  function draw(dead) {
    ctx.fillStyle = '#b5d62b';
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.fillStyle = '#a3c41f';

    for (let x = 0; x < N; x++) {
      for (let y = 0; y < N; y++) {
        if ((x + y) % 2 === 0) {
          ctx.fillRect(x * S, y * S, S, S);
        }
      }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // big faint countdown number behind everything (Dual Mode only)
    if (dual && !dead) {
      const secs = Math.max(0, Math.ceil((dualEnd - Date.now()) / 1000));
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = INK;
      ctx.font = '110px "Press Start 2P", monospace';
      ctx.fillText(String(secs), SIZE / 2, SIZE / 2);
      ctx.globalAlpha = 1;
    }

    ctx.font = '15px serif';

    foods.forEach(f => {
      ctx.fillText(
        f.e,
        f.x * S + S / 2,
        f.y * S + S / 2 + 1
      );
    });

    if (bonus) {
      ctx.globalAlpha =
        bonus.ttl < 12 && bonus.ttl % 2 ? 0.3 : 1;

      ctx.fillText(
        '🍋',
        bonus.x * S + S / 2,
        bonus.y * S + S / 2 + 1
      );

      ctx.globalAlpha = 1;
    }

    // giant food: 2x2, glowing, blinks before it disappears
    if (giant) {
      ctx.globalAlpha = giant.ttl < 15 && giant.ttl % 2 ? 0.35 : 1;

      const pulse = 0.35 + 0.25 * Math.sin(Date.now() / 150);
      ctx.fillStyle = 'rgba(255, 213, 0, ' + pulse + ')';
      ctx.fillRect(giant.x * S, giant.y * S, S * 2, S * 2);

      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        giant.x * S + 1,
        giant.y * S + 1,
        S * 2 - 2,
        S * 2 - 2
      );

      ctx.font = '30px serif';
      ctx.fillText(giant.e, giant.x * S + S, giant.y * S + S + 2);

      ctx.globalAlpha = 1;
      ctx.font = '15px serif';
    }

    drawSnake(snake, INK, dead);
    if (snakeB) drawSnake(snakeB, INK_B, dead);

    // countdown bar along the top edge during Dual Mode
    if (dual && !dead) {
      const left = Math.max(0, dualEnd - Date.now());
      const secs = Math.ceil(left / 1000);

      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, SIZE, 6);

      ctx.fillStyle = secs <= 5 ? '#ff6b3d' : '#ffd500';
      ctx.fillRect(1, 1, (SIZE - 2) * (left / DUAL_MS), 4);
    }

    // short announcement banner (DUAL SNAKE! / MERGED!)
    if (flash && !dead) {
      if (Date.now() < flash.until) {
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.fillStyle = INK;
        ctx.fillText(flash.text, SIZE / 2 + 2, SIZE / 2 + 2);
        ctx.fillStyle = '#ffd500';
        ctx.fillText(flash.text, SIZE / 2, SIZE / 2);
      } else {
        flash = null;
      }
    }
  }

  function turn(direction) {
    const moves = {
      u: { x: 0, y: -1 },
      d: { x: 0, y: 1 },
      l: { x: -1, y: 0 },
      r: { x: 1, y: 0 }
    };

    const move = moves[direction];

    if (!move) return;

    if (
      move.x === -dir.x &&
      move.y === -dir.y &&
      snake.length > 1
    ) {
      return;
    }

    nd = move;
  }

  // ---------- CONTROLS ----------
  window.addEventListener('keydown', e => {
    const keys = {
      ArrowUp: 'u',
      ArrowDown: 'd',
      ArrowLeft: 'l',
      ArrowRight: 'r',
      w: 'u',
      s: 'd',
      a: 'l',
      d: 'r',
      W: 'u',
      S: 'd',
      A: 'l',
      D: 'r'
    };

    const direction = keys[e.key];

    if (direction) {
      if (alive) e.preventDefault();
      turn(direction);
    }
  });

  document.querySelectorAll('.pad button').forEach(button => {
    button.addEventListener('pointerdown', e => {
      e.preventDefault();
      turn(button.dataset.d);
    });
  });

  let tx = null;
  let ty = null;

  cv.addEventListener('touchstart', e => {
    if (!e.touches.length) return;

    tx = e.touches[0].clientX;
    ty = e.touches[0].clientY;
  }, { passive: true });

  cv.addEventListener('touchmove', e => {
    if (tx === null || !e.touches.length) return;

    const dx = e.touches[0].clientX - tx;
    const dy = e.touches[0].clientY - ty;

    if (Math.abs(dx) > 22 || Math.abs(dy) > 22) {
      turn(
        Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? 'r' : 'l')
          : (dy > 0 ? 'd' : 'u')
      );

      tx = null;
      ty = null;
    }
  }, { passive: true });

  cv.addEventListener('touchend', () => {
    tx = null;
    ty = null;
  }, { passive: true });

  // ---------- BUTTONS ----------
  if ($('go')) {
    $('go').onclick = function () {
      try {
        const name = $('nm').value.trim();

        if (!name) {
          $('nm').focus();
          return;
        }

        localStorage.setItem('4p_name', name);
        start();
      } catch (e) {
        console.error(e);
        alert('Game error: ' + e.message);
      }
    };
  }

  if ($('again')) {
    $('again').onclick = start;
  }

  try {
    if ($('nm')) {
      $('nm').value = localStorage.getItem('4p_name') || '';
    }
  } catch (e) {}

  const muteButton = document.createElement('button');
  muteButton.className = 'mute';
  muteButton.textContent = '🔊';

  muteButton.onclick = () => {
    muted = !muted;
    muteButton.textContent = muted ? '🔇' : '🔊';

    if (muted && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  };

  const screen = document.querySelector('.scr');

  if (screen) screen.appendChild(muteButton);

 
  // ---------- LEADERBOARD (Cloudflare D1) ----------
  const API = 'https://4th-place-leaderboard.fahimzim12.workers.dev';

  let rows = [];

  function esc(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function render() {
    if (!$('lb')) return;

    const sorted = rows
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 200);

    const medals = ['🥇', '🥈', '🥉'];

    $('lb').innerHTML = sorted.length
      ? sorted.map((row, i) =>
          '<div><span class="n">' +
          (i < 3 ? medals[i] : '#' + (i + 1)) +
          ' ' + esc(row.name) +
          '</span><b>' + row.score + '</b></div>'
        ).join('')
      : '<div>No scores yet. Be the first!</div>';
  }

  function loadLocal() {
    try {
      const data = JSON.parse(
        localStorage.getItem('4p_lb') || '[]'
      );

      rows = Array.isArray(data)
        ? data.filter(row =>
            row &&
            typeof row.name === 'string' &&
            Number.isFinite(Number(row.score))
          )
        : [];
    } catch (e) {
      rows = [];
    }
  }

  function getPlayerId() {
    try {
      let id = localStorage.getItem('4p_player_id');

      if (!id) {
        id = 'p_' + (
          window.crypto && crypto.randomUUID
            ? crypto.randomUUID()
            : Date.now() + '_' + Math.random().toString(36).slice(2)
        );

        localStorage.setItem('4p_player_id', id);
      }

      return id;
    } catch (e) {
      return 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    }
  }

  async function fetchTop() {
    try {
      const response = await fetch(API + '/leaderboard');

      if (!response.ok) {
        throw new Error('Request failed: ' + response.status);
      }

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Leaderboard unavailable');
      }

      rows = (data.scores || []).map(item => ({
        name: item.player_name,
        score: Number(item.best_score) || 0
      }));

      render();

      if ($('lbnote')) {
        $('lbnote').textContent =
          'Live leaderboard · same for everyone.';
      }
    } catch (e) {
      loadLocal();
      render();

      if ($('lbnote')) {
        $('lbnote').textContent =
          'Online leaderboard unavailable. Showing this device’s saved scores.';
      }

      console.warn('Leaderboard loading failed:', e);
    }
  }

  async function submit(value) {
    const name =
      ($('nm') ? $('nm').value.trim().slice(0, 20) : '') ||
      'Player';

    // Keep a local backup in case the internet is unavailable.
    saveLocalScore(name, value);

    try {
      const response = await fetch(API + '/score', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          player_id: getPlayerId(),
          player_name: name,
          score: value
        })
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Score could not be saved');
      }

      await fetchTop();
    } catch (e) {
      if ($('lbnote')) {
        $('lbnote').textContent =
          'Online leaderboard unavailable. Score saved on this device.';
      }

      console.warn('Score submission failed:', e);
    }
  }

  function saveLocalScore(name, value) {
    loadLocal();

    const existing = rows.find(
      row => row.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) {
      existing.score = Math.max(Number(existing.score) || 0, value);
    } else {
      rows.push({ name, score: value });
    }

    try {
      localStorage.setItem('4p_lb', JSON.stringify(rows));
    } catch (e) {}

    render();
  }

  // ---------- INITIALIZE ----------
  reset();

  if ($('lb')) {
    $('lb').innerHTML = '<div>Loading…</div>';
  }

  fetchTop();
})();
