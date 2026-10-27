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
  let food;
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

  function free() {
    let p;

    do {
      p = { x: rnd(N), y: rnd(N) };
    } while (
      snake.some(s => s.x === p.x && s.y === p.y) ||
      (bonus && bonus.x === p.x && bonus.y === p.y)
    );

    return p;
  }

  function spawn() {
    food = free();
    food.e = FOODS[rnd(FOODS.length)];
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

    spawn();

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
    dir = nd;

    const head = {
      x: snake[0].x + dir.x,
      y: snake[0].y + dir.y
    };

    const hitWall =
      head.x < 0 ||
      head.y < 0 ||
      head.x >= N ||
      head.y >= N;

    const hitSelf = snake.some(
      s => s.x === head.x && s.y === head.y
    );

    if (hitWall || hitSelf) {
      die();
      return;
    }

    snake.unshift(head);

    let ate = false;

    if (head.x === food.x && head.y === food.y) {
      score += 10;
      ate = true;
      spawn();

      if (!bonus && Math.random() < 0.2) {
        bonus = free();
        bonus.ttl = 50;
      }
    } else if (
      bonus &&
      head.x === bonus.x &&
      head.y === bonus.y
    ) {
      score += 20;
      ate = true;
      bonus = null;
    }

    if (ate) {
      if ($('sc')) $('sc').textContent = score;

      speed = Math.max(70, speed - 3);
      blip();
      khaichi();
    } else {
      snake.pop();
    }

    if (bonus && --bonus.ttl <= 0) {
      bonus = null;
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

    if (food) {
      ctx.font = '15px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillText(
        food.e,
        food.x * S + S / 2,
        food.y * S + S / 2 + 1
      );
    }

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

    snake.forEach((part, i) => {
      ctx.fillStyle = dead ? '#7a2a1a' : INK;

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

  // ---------- LEADERBOARD ----------
  const CFG = window.FIREBASE_CONFIG || {};

  const online = Boolean(
    CFG.apiKey &&
    CFG.projectId &&
    !/YOUR/i.test(CFG.apiKey + CFG.projectId)
  );

  const BASE = online
    ? 'https://firestore.googleapis.com/v1/projects/' +
      CFG.projectId +
      '/databases/(default)/documents'
    : '';

  const KEY = online
    ? '?key=' + encodeURIComponent(CFG.apiKey)
    : '';

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
        ? data.filter(r =>
            r &&
            typeof r.name === 'string' &&
            Number.isFinite(Number(r.score))
          )
        : [];
    } catch (e) {
      rows = [];
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

  function pid(name) {
    return 'p_' + Array.from(
      new TextEncoder().encode(name.toLowerCase())
    ).map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function fetchTop() {
    if (!online) {
      loadLocal();
      render();

      if ($('lbnote')) {
        $('lbnote').textContent =
          'Leaderboard on this device only.';
      }

      return;
    }

    try {
      const response = await fetch(
        BASE + ':runQuery' + KEY,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            structuredQuery: {
              from: [{ collectionId: 'scores' }],
              orderBy: [{
                field: { fieldPath: 'score' },
                direction: 'DESCENDING'
              }],
              limit: 200
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error('Leaderboard request failed: ' + response.status);
      }

      const data = await response.json();

      rows = data
        .filter(item => item.document)
        .map(item => ({
          name: item.document.fields.name.stringValue,
          score: parseInt(
            item.document.fields.score.integerValue,
            10
          ) || 0
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
          'Online leaderboard unavailable. Showing this device’s scores.';
      }

      console.warn('Leaderboard load failed:', e);
    }
  }

  async function submit(value) {
    const name =
      ($('nm') ? $('nm').value.trim().slice(0, 14) : '') ||
      'Player';

    // Save locally first, even when Firebase is enabled.
    saveLocalScore(name, value);

    if (!online) {
      if ($('lbnote')) {
        $('lbnote').textContent =
          'Leaderboard on this device only.';
      }
      return;
    }

    try {
      const url = BASE + '/scores/' + pid(name) + KEY;
      const response = await fetch(url);

      let oldScore = -1;

      if (response.ok) {
        const document = await response.json();
        oldScore = parseInt(
          document.fields.score.integerValue,
          10
        ) || 0;
      } else if (response.status !== 404) {
        throw new Error('Score lookup failed: ' + response.status);
      }

      if (value > oldScore) {
        const saved = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              name: { stringValue: name },
              score: { integerValue: String(value) },
              at: { integerValue: String(Date.now()) }
            }
          })
        });

        if (!saved.ok) {
          throw new Error('Score save failed: ' + saved.status);
        }
      }

      await fetchTop();
    } catch (e) {
      // The local score is already saved above.
      if ($('lbnote')) {
        $('lbnote').textContent =
          'Online leaderboard unavailable. Score saved on this device.';
      }

      console.warn('Leaderboard save failed:', e);
    }
  }

  // ---------- INITIALIZE ----------
  reset();

  if (online) {
    if ($('lb')) $('lb').innerHTML = '<div>Loading…</div>';
    fetchTop();
  } else {
    loadLocal();
    render();

    if ($('lbnote')) {
      $('lbnote').textContent =
        'Leaderboard on this device only (online leaderboard not set up).';
    }
  }
})();
