(() => {
  // ====== Elements ======
  const startScreen   = document.getElementById('start-screen');
  const gameScreen    = document.getElementById('game-screen');
  const resultScreen  = document.getElementById('result-screen');
  const logo          = document.getElementById('logo');
  const playfield     = document.getElementById('playfield');
  const actions       = document.getElementById('actions');
  const timeEl        = document.getElementById('time');
  const scoreEl       = document.getElementById('score');
  const comboWrap     = document.getElementById('combo');
  const comboSpan     = comboWrap.querySelector('span');
  const finalScoreEl  = document.getElementById('final-score');
  const finalMaxCombo = document.getElementById('final-max-combo');
  const againBtn      = document.getElementById('again-btn');

  const modeBtns      = document.querySelectorAll('.mode-btn');
  const btnPoop       = document.getElementById('mode-poop');
  const btnTalisman   = document.getElementById('mode-talisman');

  const sfxThrow      = document.getElementById('sfx-throw');
  const sfxCry        = document.getElementById('sfx-cry');
  const sfxHappy      = document.getElementById('sfx-happy');

  // ====== Game constants ======
  const GAME_DURATION_MS = 40_000;
  const MIN_GHOSTS = 3;
  const MAX_GHOSTS = 7;

  // slower rise/drop: 20% speed => 5x duration
  const DROP_MS = 900 * 5;
  const RISE_MS = 1000 * 5;

  // Combo
  const COMBO_WINDOW_MS = 1500; // 1.5 秒內持續命中才延續 combo

  // ====== State ======
  let remainingMs = GAME_DURATION_MS;
  let timerTick    = null;
  let spawnTick    = null;
  let gameOver     = false;
  let score        = 0;
  let attackMode   = 'poop'; // 'poop' or 'talisman'
  let ghostIdSeed  = 0;

  // combo state
  let combo = 0;
  let maxCombo = 0;
  let lastHitAt = 0;

  // ====== Helpers ======
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand  = (a, b) => Math.random() * (b - a) + a;
  const rInt  = (a, b) => Math.floor(rand(a, b + 1));
  const now   = () => performance.now();

  const dims = () => ({
    w: playfield.clientWidth,
    h: playfield.clientHeight,
    actionsH: actions.offsetHeight || 0
  });

  const showEl = (el) => { el.classList.add('visible'); };
  const hideEl = (el) => { el.classList.remove('visible'); };

  function setActiveMode(mode) {
    attackMode = mode;
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  }

  // ====== Start wiring：讓首頁任何點擊都能開始（涵蓋 pointer/click/touch） ======
  ['pointerdown','click','touchstart'].forEach(evt => {
    startScreen.addEventListener(evt, startGame, { passive: true });
  });
  ['pointerdown','click','touchstart'].forEach(evt => {
    logo.addEventListener(evt, (e) => { e.stopPropagation(); startGame(); }, { passive: true });
  });
  ['pointerdown','click','touchstart'].forEach(evt => {
    againBtn.addEventListener(evt, () => { resetGame(); startGame(); }, { passive: true });
  });

  // Mode buttons
  modeBtns.forEach(btn => {
    ['pointerdown','click','touchstart'].forEach(evt => {
      btn.addEventListener(evt, (e) => {
        e.stopPropagation();
        setActiveMode(btn.dataset.mode);
      }, { passive: true });
    });
  });

  // Preload images
  [
    'images/bg.jpg',
    'images/Ghostfightinglogo.png',
    'images/char.png',
    'images/charsad.png',
    'images/charhappy.png',
    'images/shit.png',
    'images/talisman.png'
  ].forEach(src => { const i = new Image(); i.src = src; });

  // ====== 初始狀態：只顯示首頁（避免誤顯示） ======
  window.addEventListener('load', () => {
    showEl(startScreen);
    hideEl(gameScreen);
    hideEl(resultScreen);
  });

  // ====== Game flow ======
  function startGame() {
    // 顯示遊戲、關閉其他畫面（避免被遮）
    showEl(gameScreen);
    hideEl(resultScreen);
    hideEl(startScreen);

    gameOver   = false;
    score      = 0;
    remainingMs = GAME_DURATION_MS;
    scoreEl.textContent = '0';
    timeEl.textContent  = (remainingMs / 1000).toFixed(1);

    // combo reset
    combo = 0; maxCombo = 0; lastHitAt = 0;
    comboWrap.classList.add('hidden');
    comboSpan.textContent = '1';

    // 清場
    Array.from(document.querySelectorAll('.ghost, .projectile, .fx, .particle, .float-text'))
      .forEach(el => el.remove());

    // 初始鬼魂
    const initN = rInt(MIN_GHOSTS, MIN_GHOSTS + 2);
    for (let i = 0; i < initN; i++) spawnGhost();

    // 持續補怪
    spawnTick = setInterval(() => {
      if (gameOver) return;
      const alive = document.querySelectorAll('.ghost.alive').length;
      if (alive < MAX_GHOSTS) spawnGhost();
    }, 800);

    // 計時
    timerTick = setInterval(() => {
      if (gameOver) return;
      remainingMs -= 100;
      if (remainingMs <= 0) {
        remainingMs = 0;
        endGame();
      }
      timeEl.textContent = (remainingMs / 1000).toFixed(1);
    }, 100);

    setActiveMode('poop');
  }

  function endGame() {
    if (gameOver) return;
    gameOver = true;
    clearInterval(timerTick);
    clearInterval(spawnTick);

    finalScoreEl.textContent = String(score);
    finalMaxCombo.textContent = String(maxCombo);

    hideEl(gameScreen);
    showEl(resultScreen);

    document.querySelectorAll('.ghost').forEach(g => g.classList.add('dead'));
  }

  function resetGame() {
    clearInterval(timerTick);
    clearInterval(spawnTick);
  }

  // ====== Ghost logic ======
  function spawnGhost() {
    const g = document.createElement('div');
    g.className = 'ghost alive';
    g.dataset.state = 'alive';
    g.dataset.id = (++ghostIdSeed).toString();

    const img = document.createElement('img');
    img.src = 'images/char.png';
    img.alt = 'ghost';
    g.appendChild(img);

    const baseW = clamp(playfield.clientWidth * 0.12, 54, 100);
    g.style.width = `${baseW * rand(0.9, 1.15)}px`;

    g.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      if (gameOver) return;
      if (g.dataset.state !== 'alive') return;
      throwFromBottomToTarget(centerOf(g), () => resolveGhost(g));
    });

    playfield.appendChild(g);

    const entry = randomOffscreenPoint();
    setGhostTransform(g, entry.x, entry.y);
    requestAnimationFrame(() => ghostEnterLoop(g));
  }

  function ghostEnterLoop(g) {
    if (!g.isConnected || g.dataset.state !== 'alive' || gameOver) return;
    const { w, h, actionsH } = dims();

    const size = g.getBoundingClientRect();
    const pad = 10;
    const maxY = Math.max(0, h - actionsH - size.height - pad);

    const target = {
      x: rInt(pad, Math.max(pad, w - size.width - pad)),
      y: rInt(pad, Math.max(pad, maxY))
    };

    const flyInMs   = rInt(1200, 2000);
    const lingerMs  = rInt(700, 1400);
    const flyOutMs  = rInt(1000, 1800);

    animateTransform(g, target.x, target.y, flyInMs, 'linear', () => {
      if (!g.isConnected || g.dataset.state !== 'alive' || gameOver) return;
      setTimeout(() => {
        if (!g.isConnected || g.dataset.state !== 'alive' || gameOver) return;
        const exit = randomOffscreenPoint();
        animateTransform(g, exit.x, exit.y, flyOutMs, 'linear', () => {
          if (!g.isConnected || g.dataset.state !== 'alive' || gameOver) return;
          setGhostTransform(g, exit.x, exit.y);
          setTimeout(() => ghostEnterLoop(g), rInt(80, 300));
        });
      }, lingerMs);
    });
  }

  function randomOffscreenPoint() {
    const { w, h } = dims();
    const m = 80;
    const side = ['left', 'right', 'top', 'bottom'][rInt(0, 3)];
    if (side === 'left')   return { x: -m,      y: rInt(0, h - 100) };
    if (side === 'right')  return { x: w + m,   y: rInt(0, h - 100) };
    if (side === 'top')    return { x: rInt(0, w - 100), y: -m };
    return                   { x: rInt(0, w - 100), y: h + m };
  }

  function setGhostTransform(el, x, y, rotDeg = 0) {
    el._pos = { x, y, rotDeg };
    el.style.transition = 'none';
    el.style.transform  = `translate(${x}px, ${y}px) rotate(${rotDeg}deg)`;
  }

  function animateTransform(el, x, y, ms, easing = 'linear', cb) {
    el._pos = { x, y, rotDeg: 0 };
    el.style.transition = `transform ${ms}ms ${easing}`;
    requestAnimationFrame(() => {
      el.style.transform = `translate(${x}px, ${y}px)`;
    });
    const onEnd = (e) => {
      if (e.propertyName !== 'transform') return;
      el.removeEventListener('transitionend', onEnd);
      cb && cb();
    };
    el.addEventListener('transitionend', onEnd);
  }

  // ====== Throw logic ======
  function centerOf(el) {
    const pfRect = playfield.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2 - pfRect.left, y: r.top + r.height / 2 - pfRect.top };
  }

  // 從畫面下方中央往目標飛；抵達時執行 onArrive()
  function throwFromBottomToTarget(target, onArrive, visualOnly = false) {
    try { sfxThrow.currentTime = 0; sfxThrow.play(); } catch {}

    const { w, h } = dims();
    const start = { x: w / 2, y: h - 4 };
    const pSize = clamp(w * 0.08, 40, 64);

    const proj = document.createElement('div');
    proj.className = 'projectile';
    const img = document.createElement('img');
    img.src = attackMode === 'poop' ? 'images/shit.png' : 'images/talisman.png';
    img.alt = attackMode;
    proj.appendChild(img);
    proj.style.width = `${pSize}px`;
    proj.style.transform = `translate(${start.x - pSize/2}px, ${start.y - pSize/2}px)`;
    img.style.animation = 'spin 420ms linear infinite';
    playfield.appendChild(proj);

    requestAnimationFrame(() => {
      proj.style.transform = `translate(${target.x - pSize/2}px, ${target.y - pSize/2}px)`;
    });

    const arrive = () => {
      proj.removeEventListener('transitionend', arrive);
      proj.remove();
      createHitFx(target.x, target.y);
      if (!visualOnly) onArrive && onArrive();
    };
    proj.addEventListener('transitionend', arrive);
  }

  // 點空白處也能投擲：到達時找最近鬼魂判定命中
  playfield.addEventListener('pointerdown', onPlayfieldDown);
  playfield.addEventListener('click', onPlayfieldDown);
  function onPlayfieldDown(e) {
    if (gameOver) return;
    if (e.target.closest('.ghost')) return; // 點到鬼魂由其 listener 處理

    const pfRect = playfield.getBoundingClientRect();
    const target = { x: (e.clientX ?? 0) - pfRect.left, y: (e.clientY ?? 0) - pfRect.top };

    const ghosts = Array.from(document.querySelectorAll('.ghost.alive'));
    let best = null, bestDist = Infinity, bestSize = 0;
    ghosts.forEach(g => {
      const c = centerOf(g);
      const d = Math.hypot(c.x - target.x, c.y - target.y);
      const w = g.getBoundingClientRect().width;
      if (d < bestDist) { bestDist = d; best = g; bestSize = w; }
    });

    const threshold = best ? bestSize * 0.6 : 0; // 命中門檻

    if (best && bestDist <= threshold) {
      throwFromBottomToTarget(centerOf(best), () => resolveGhost(best));
    } else {
      throwFromBottomToTarget(target, null, true); // miss
    }
  }

  // ====== FX ======
  function createHitFx(x, y) {
    // 爆閃圈
    const fx = document.createElement('div');
    fx.className = 'fx';
    fx.style.position = 'absolute';
    fx.style.left = (x - 20) + 'px';
    fx.style.top  = (y - 20) + 'px';
    fx.style.width = '40px';
    fx.style.height = '40px';
    fx.style.borderRadius = '50%';
    fx.style.pointerEvents = 'none';
    fx.style.transition = 'transform 380ms ease-out, opacity 420ms ease-out';
    fx.style.background = attackMode === 'poop'
      ? 'radial-gradient(circle, rgba(139,90,43,.9), rgba(90,45,10,0) 65%)'
      : 'radial-gradient(circle, rgba(255,244,179,.95), rgba(255,215,64,0) 60%)';
    fx.style.opacity = '1';
    fx.style.transform = 'scale(0.6)';
    playfield.appendChild(fx);
    requestAnimationFrame(() => {
      fx.style.transform = 'scale(2.1)';
      fx.style.opacity = '0';
    });
    setTimeout(() => fx.remove(), 460);

    // 粒子噴散
    spawnParticles(x, y, attackMode === 'poop' ? '#b07a3c' : '#ffe87a');
  }

  function spawnParticles(x, y, color) {
    const N = 14;
    for (let i = 0; i < N; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.background = color;
      p.style.left = (x - 4) + 'px';
      p.style.top  = (y - 4) + 'px';
      playfield.appendChild(p);

      const ang = Math.random() * Math.PI * 2;
      const spd = rand(120, 280);
      const dx = Math.cos(ang) * spd * 0.5;
      const dy = Math.sin(ang) * spd * 0.5;

      p.style.transition = 'transform 500ms ease-out, opacity 520ms ease-out';
      requestAnimationFrame(() => {
        p.style.transform = `translate(${dx}px, ${dy}px) scale(${rand(0.6,1.1)})`;
        p.style.opacity = '0';
      });
      setTimeout(() => p.remove(), 540);
    }
  }

  function floatText(x, y, text) {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top  = `${y}px`;
    playfield.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => el.remove(), 600);
  }

  // ====== 命中 / 計分 / Combo ======
  function resolveGhost(ghostEl) {
    ghostEl.dataset.state = 'dead';
    ghostEl.classList.remove('alive');
    ghostEl.classList.add('dead');

    const img = ghostEl.querySelector('img');
    const { x, y } = ghostEl._pos || { x: 0, y: 0 };
    const { h } = dims();

    // Combo
    const t = now();
    if (t - lastHitAt <= COMBO_WINDOW_MS) combo += 1; else combo = 1;
    lastHitAt = t;
    maxCombo = Math.max(maxCombo, combo);
    comboSpan.textContent = String(combo);
    comboWrap.classList.remove('hidden');
    comboWrap.classList.add('pop');
    setTimeout(() => comboWrap.classList.remove('pop'), 120);

    floatText(x, y, '+1');
    if (combo >= 2) floatText(x + 22, y - 10, `×${combo}`);

    if (attackMode === 'poop') {
      img.src = 'images/charsad.png';
      try { sfxCry.currentTime = 0; sfxCry.play(); } catch {}
      const dropTo = y + h + 140;
      ghostEl.style.transition = `transform ${DROP_MS}ms cubic-bezier(.2,.7,.3,1.0)`;
      requestAnimationFrame(() => {
        ghostEl.style.transform = `translate(${x}px, ${dropTo}px) rotate(24deg)`;
      });
    } else {
      img.src = 'images/charhappy.png';
      try { sfxHappy.currentTime = 0; sfxHappy.play(); } catch {}
      const riseTo = y - (h + 160);
      ghostEl.style.transition = `transform ${RISE_MS}ms cubic-bezier(.2,.7,.3,1.0)`;
      requestAnimationFrame(() => {
        ghostEl.style.transform = `translate(${x}px, ${riseTo}px)`;
      });
    }

    score += 1;
    scoreEl.textContent = String(score);

    const cleanup = () => {
      ghostEl.removeEventListener('transitionend', cleanup);
      ghostEl.remove();
      if (!gameOver) {
        const alive = document.querySelectorAll('.ghost.alive').length;
        if (alive < MIN_GHOSTS) spawnGhost();
      }
    };
    ghostEl.addEventListener('transitionend', cleanup);
  }
})();
(() => {
  // ✅ 方法2：動態設定 #app 高度避免手機瀏覽器 vh 問題
  function setAppHeight() {
    const app = document.getElementById('app');
    app.style.height = window.innerHeight + 'px';
  }
  window.addEventListener('resize', setAppHeight);
  window.addEventListener('orientationchange', setAppHeight);
  setAppHeight();

  // ... 其餘程式碼保持不變（前面我們做好的 Combo、粒子特效、遊戲流程）
})();
