'use strict';

const ASSETS = {
  bg: 'assets/bg.jpg',
  soup: 'assets/soup.png',
  pepper: 'assets/pepper.png',
  eggplant: 'assets/eggplant.png',
  beef: 'assets/beef.png',
  avocado: 'assets/avocado.png',
  mushroom: 'assets/mushroom.png',
  chicken: 'assets/chicken.png',
  potato: 'assets/potato.png',
  greens: 'assets/greens.png',
  cabbage: 'assets/cabbage.png',
  corn: 'assets/corn.png',
  tomato: 'assets/tomato.png',
  cauliflower: 'assets/cauliflower.png'
};

const DESKTOP = {
  width: 1648,
  height: 928,
  soup: { x: 380, y: 670, w: 880, h: 310 },
  dropY: 745,
  range: 280
};

const PORTRAIT = {
  width: 928,
  height: 1648,
  soup: { x: 210, y: 1340, w: 508, h: 260 },
  dropY: 1420,
  range: 145
};

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const video = document.getElementById('video');

const el = id => document.getElementById(id);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rand = (a, b) => a + Math.random() * (b - a);

const images = {};

for (const [key, src] of Object.entries(ASSETS)) {
  const img = new Image();
  img.src = src;
  images[key] = img;
}

const kinds = [
  'pepper', 'eggplant', 'beef', 'avocado',
  'mushroom', 'chicken', 'potato', 'greens',
  'cabbage', 'corn', 'tomato', 'cauliflower'
];

const REWARDS = [
  ['蔊菜皮蛋', 'assets/dish1.png'],
  ['彩椒炒肉', 'assets/dish2.png'],
  ['牛油果减脂餐', 'assets/dish4.png'],
  ['肉末茄子', 'assets/dish5.png'],
  ['番茄炒蛋', 'assets/dish6.png'],
  ['花菜炒肉', 'assets/dish7.png'],
  ['小鸡炖蘑菇', 'assets/dish8.png']
];

const BAD_REWARD = [
  '黑暗料理',
  'assets/dish3.png'
];

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];

let layout = DESKTOP;
let items = [];
let particles = [];
let hands = [];
let pointers = new Map();
let handTracks = new Map();

let mode = 'mouse';
let playing = false;
let paused = false;
let finished = false;

let score = 0;
let lives = 3;
let remaining = 60;
let elapsed = 0;
let spawnTimer = 0.5;
let nextId = 0;

let soupOffsetX = 0;
let soupDirection = 1;
let soupSpeed = 65;

let lastTime = performance.now();
let feedback = '';
let feedbackUntil = 0;

let landmarker = null;
let stream = null;
let cameraBusy = false;
let cameraErrorCount = 0;
let lastVideoTime = -1;

// ===== 布局 =====

function getLayout() {
  return innerHeight > innerWidth && innerWidth <= 800
    ? PORTRAIT
    : DESKTOP;
}

function updateLayout() {
  const next = getLayout();

  if (next === layout) return;

  const old = layout;
  layout = next;

  for (const it of items) {
    it.x = it.x / old.width * next.width;
    it.y = it.y / old.height * next.height;
    it.held = null;
  }

  pointers.clear();
  handTracks.clear();

  soupOffsetX = clamp(
    soupOffsetX,
    -layout.range,
    layout.range
  );
}

// ===== HUD =====

function updateHud() {
  el('score').textContent = score.toLocaleString();

  el('time').textContent = Math.max(
    0,
    Math.ceil(remaining)
  );

  el('spoiled').textContent =
    items.filter(i => i.bad).length;

  el('lives').textContent =
    '♥ '.repeat(Math.max(0, lives)) +
    '♡ '.repeat(3 - Math.max(0, lives));
}

function status(text) {
  el('message').textContent = text;
}

function flash(text) {
  feedback = text;
  feedbackUntil = performance.now() + 1250;
  status(text);
}

// ===== 游戏开始与重置 =====

function resetGame() {
  updateLayout();

  playing = true;
  paused = false;
  finished = false;

  items = [];
  particles = [];
  hands = [];

  pointers.clear();
  handTracks.clear();

  score = 0;
  lives = 3;
  remaining = 60;
  elapsed = 0;
  spawnTimer = 0.5;
  nextId = 0;

  soupOffsetX = 0;
  soupDirection = 1;
  soupSpeed = 65;

  lastTime = performance.now();

  el('modal').classList.add('hidden');
  el('foodResult').classList.add('hidden');
  el('pauseOverlay').classList.add('hidden');
  el('pauseBtn').textContent = '⏸ 暂停';

  updateHud();
}

async function start(which) {
  resetGame();
  mode = which;

  if (which === 'camera') {
    playing = false;

    status('正在连接摄像头与手势识别…');

    const ok = await enableCamera();

    if (ok) {
      playing = true;
      lastTime = performance.now();
    } else {
      playing = false;
      el('modal').classList.remove('hidden');

      status(
        '摄像头不可用，请检查权限或选择鼠标模式'
      );
    }
  } else {
    status(
      '鼠标/触屏：拖动好食材入锅，坏食材向左右甩出'
    );
  }
}

// ===== 最终随机美食 =====

function showFoodResult() {
  if (!el('foodResult').classList.contains('hidden')) {
    return;
  }

  const reward = score < 500
    ? BAD_REWARD
    : REWARDS[Math.floor(Math.random() * REWARDS.length)];

  el('resultFoodImage').src = reward[1];
  el('resultFoodName').textContent = reward[0];

  el('resultFinalScore').textContent =
    score.toLocaleString();

  el('resultFoodMessage').textContent =
    score < 500
      ? '积分不足500分，今天只能吃黑暗料理啦！'
      : '恭喜！这是你今天努力拯救食物得到的美食！';

  el('modal').classList.add('hidden');
  el('pauseOverlay').classList.add('hidden');
  el('foodResult').classList.remove('hidden');
}

function endGame() {
  if (finished) return;

  playing = false;
  paused = false;
  finished = true;

  showFoodResult();
}

// ===== 暂停 / 继续 =====

function togglePause() {
  if (!playing || finished) return;

  paused = !paused;

  el('pauseBtn').textContent =
    paused ? '▶ 继续' : '⏸ 暂停';

  el('pauseOverlay').classList.toggle(
    'hidden',
    !paused
  );

  if (paused) {
    for (const [id, p] of pointers) {
      release(id, 0, 0, false);
    }

    pointers.clear();

    for (const [id, t] of handTracks) {
      release(id, 0, 0, false);
      t.closed = false;
      t.holding = false;
    }
  }

  lastTime = performance.now();
}

// ===== 汤锅移动：每20秒加速 =====

function updateSoupMovement(dt) {
  soupSpeed =
    elapsed < 20 ? 65 :
    elapsed < 40 ? 160 : 280;

  const range = layout.range;

  soupOffsetX += soupDirection * soupSpeed * dt;

  if (soupOffsetX >= range) {
    soupOffsetX = range;
    soupDirection = -1;
  } else if (soupOffsetX <= -range) {
    soupOffsetX = -range;
    soupDirection = 1;
  }
}

function getSoupPosition() {
  return {
    ...layout.soup,
    x: layout.soup.x + soupOffsetX
  };
}

// ===== 食材生成 =====

function spawn() {
  const size = layout === PORTRAIT
    ? rand(145, 185)
    : rand(155, 215);

  const margin = layout === PORTRAIT
    ? 110
    : 170;

  items.push({
    id: ++nextId,

    key: kinds[
      Math.floor(Math.random() * kinds.length)
    ],

    bad: Math.random() < 0.49,

    x: rand(margin, layout.width - margin),
    y: -size,

    vx: rand(-40, 40),
    vy: rand(75, 105) + elapsed * 2.8,

    rot: rand(-0.2, 0.2),
    spin: rand(-0.5, 0.5),

    size,
    held: null,
    age: 0,
    thrown: false,
    throwDirection: 0
  });
}

// ===== 粒子效果 =====

function burst(x, y, good) {
  for (let i = 0; i < 18; i++) {
    particles.push({
      x,
      y,
      vx: rand(-180, 180),
      vy: rand(-200, 70),
      life: rand(0.4, 0.85),
      max: 0.85,
      r: rand(3, 8),
      color: good ? '#7bba63' : '#d76255'
    });
  }
}

// ===== 食物分类 =====

function removeItem(item) {
  items = items.filter(i => i !== item);
}

function resolveItem(item, correct) {
  if (!items.includes(item)) return;

  if (correct) {
    score += item.bad ? 150 : 100;

    flash(
      item.bad
        ? '变质食物成功丢弃 +150'
        : '新鲜食材入锅 +100'
    );
  } else {
    lives--;

    flash(
      item.bad
        ? '变质食物进入汤锅！'
        : '新鲜食物被扔掉了！'
    );
  }

  burst(item.x, item.y, correct);
  removeItem(item);
  updateHud();

  if (lives <= 0) {
    endGame();
  }
}

function classify(item) {
  if (!playing || paused) return false;

  const soup = getSoupPosition();

  const inSoup =
    item.y >= soup.y + soup.h * 0.25 &&
    item.y <= soup.y + soup.h * 0.85 &&
    item.x >= soup.x + soup.w * 0.15 &&
    item.x <= soup.x + soup.w * 0.85;

  // 只有主动甩出/拖出才允许左右丢弃
  const side = layout.width * 0.12;

  const outSide =
    item.x < side ||
    item.x > layout.width - side;

  if (item.thrown && outSide) {
    resolveItem(item, item.bad);
    return true;
  }

  if (inSoup) {
    resolveItem(item, !item.bad);
    return true;
  }

  return false;
}

// ===== 抓取和释放 =====

function closest(x, y) {
  let best = null;
  let dist = Infinity;

  for (const item of items) {
    if (item.held !== null) continue;

    const d = Math.hypot(
      item.x - x,
      item.y - y
    );

    if (
      d < item.size * 1.15 &&
      d < dist
    ) {
      best = item;
      dist = d;
    }
  }

  return best;
}

function grab(id, x, y) {
  if (!playing || paused) return null;

  const already = items.find(i => i.held === id);
  if (already) return already;

  const item = closest(x, y);

  if (item) {
    item.held = id;
    item.thrown = false;
  }

  return item;
}

function moveHeld(id, x, y) {
  if (paused) return;

  for (const item of items) {
    if (item.held === id) {
      item.x = clamp(
        x,
        -item.size,
        layout.width + item.size
      );

      item.y = clamp(
        y,
        0,
        layout.height
      );
    }
  }
}

function release(id, vx = 0, vy = 0, allowThrow = true) {
  for (const item of [...items]) {
    if (item.held !== id) continue;

    item.held = null;

    item.vx = allowThrow
      ? clamp(vx * 1.4, -1600, 1600)
      : 0;

    item.vy = allowThrow
      ? Math.max(80, vy)
      : Math.max(80, item.vy);

    item.thrown =
      allowThrow &&
      (
        Math.abs(item.vx) > 170 ||
        item.x < layout.width * 0.12 ||
        item.x > layout.width * 0.88
      );

    item.throwDirection = Math.sign(item.vx);

    if (playing && !paused) {
      classify(item);
    }
  }
}

// ===== 鼠标与触屏 =====

function canvasPos(ev) {
  const r = canvas.getBoundingClientRect();

  const scale = Math.min(
    r.width / layout.width,
    r.height / layout.height
  );

  const ox = (r.width - layout.width * scale) / 2;
  const oy = (r.height - layout.height * scale) / 2;

  return {
    x: (ev.clientX - r.left - ox) / scale,
    y: (ev.clientY - r.top - oy) / scale
  };
}

canvas.addEventListener('pointerdown', ev => {
  if (!playing || paused || mode !== 'mouse') return;

  canvas.setPointerCapture(ev.pointerId);

  const p = canvasPos(ev);
  const id = 'mouse' + ev.pointerId;
  const obj = grab(id, p.x, p.y);

  pointers.set(ev.pointerId, {
    ...p,
    id,
    t: performance.now(),
    obj,
    vx: 0,
    vy: 0
  });
});

canvas.addEventListener('pointermove', ev => {
  const p = pointers.get(ev.pointerId);

  if (!p || paused) return;

  const q = canvasPos(ev);
  const now = performance.now();

  const dt = Math.max(
    0.016,
    (now - p.t) / 1000
  );

  p.vx = clamp(
    (q.x - p.x) / dt,
    -1400,
    1400
  );

  p.vy = clamp(
    (q.y - p.y) / dt,
    -1400,
    1400
  );

  p.x = q.x;
  p.y = q.y;
  p.t = now;

  moveHeld(p.id, q.x, q.y);
});

function pointerUp(ev) {
  const p = pointers.get(ev.pointerId);
  if (!p) return;

  release(p.id, p.vx, p.vy);
  pointers.delete(ev.pointerId);
}

canvas.addEventListener('pointerup', pointerUp);
canvas.addEventListener('pointercancel', pointerUp);

// ===== 手势判断 =====

function gesture(points) {
  const fingers = [
    [5, 6, 8],
    [9, 10, 12],
    [13, 14, 16],
    [17, 18, 20]
  ];

  let folded = 0;
  let extended = 0;

  for (const [m, p, t] of fingers) {
    const a = points[m];
    const b = points[p];
    const c = points[t];

    const u = [
      a.x - b.x,
      a.y - b.y,
      (a.z || 0) - (b.z || 0)
    ];

    const v = [
      c.x - b.x,
      c.y - b.y,
      (c.z || 0) - (b.z || 0)
    ];

    const dot =
      u[0] * v[0] +
      u[1] * v[1] +
      u[2] * v[2];

    const len = Math.max(
      1e-7,
      Math.hypot(...u) * Math.hypot(...v)
    );

    const ang =
      Math.acos(clamp(dot / len, -1, 1)) *
      180 / Math.PI;

    if (ang < 120) folded++;
    if (ang > 145) extended++;
  }

  return {
    fist: folded >= 3,
    open: extended >= 3
  };
}

// ===== 摄像头启动 =====

function cameraErrorMessage(e) {
  if (!window.isSecureContext) {
    return '摄像头需要 HTTPS 或 localhost';
  }

  const name = e?.name || '';

  if (name === 'NotAllowedError') {
    return '摄像头权限被拒绝，请在浏览器地址栏允许摄像头';
  }

  if (name === 'NotFoundError') {
    return '未找到摄像头';
  }

  if (name === 'NotReadableError') {
    return '摄像头可能被其他软件占用';
  }

  return '摄像头启动失败：' +
    (e?.message || String(e));
}

async function enableCamera() {
  if (cameraBusy) return false;

  cameraBusy = true;

  const btn = el('cameraBtn');
  btn.disabled = true;
  btn.textContent = '📷 连接中…';

  try {
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw Error('需要 HTTPS 或 localhost');
    }

    if (!stream || !stream.active) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        }
      });

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
    }

    await video.play();
    video.style.display = 'block';

    if (!landmarker) {
      const cdn =
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

      const mod = await import(cdn + '/+esm');

      const vision =
        await mod.FilesetResolver.forVisionTasks(
          cdn + '/wasm'
        );

      const options = {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
          delegate: 'GPU'
        },

        runningMode: 'VIDEO',
        numHands: 2,

        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45
      };

      try {
        landmarker =
          await mod.HandLandmarker.createFromOptions(
            vision,
            options
          );
      } catch (e) {
        options.baseOptions.delegate = 'CPU';

        landmarker =
          await mod.HandLandmarker.createFromOptions(
            vision,
            options
          );
      }
    }

    mode = 'camera';
    lastVideoTime = -1;
    cameraErrorCount = 0;

    btn.textContent = '✓ 摄像头已连接';

    status(
      '摄像头已就绪：握拳抓取，张掌释放，左右甩出坏食材'
    );

    return true;

  } catch (e) {
    console.error(e);
    status('⚠ ' + cameraErrorMessage(e));
    btn.textContent = '📷 重试摄像头';
    return false;

  } finally {
    cameraBusy = false;
    btn.disabled = false;
  }
}

// ===== MediaPipe 双手识别 =====

function detectHands(now) {
  if (
    !landmarker ||
    !stream ||
    video.readyState < 2 ||
    video.currentTime === lastVideoTime
  ) {
    return;
  }

  lastVideoTime = video.currentTime;

  try {
    const result =
      landmarker.detectForVideo(video, now);

    cameraErrorCount = 0;
    hands = [];

    const active = new Set();

    for (
      let i = 0;
      i < (result.landmarks || []).length;
      i++
    ) {
      const points = result.landmarks[i];

      const label =
        result.handednesses?.[i]?.[0]
          ?.categoryName || String(i);

      const id = 'hand-' + label;

      const color = label === 'Left'
        ? '#39B8FF'
        : '#FF994A';

      active.add(id);

      const palm = points[9];

      const x = (1 - palm.x) * layout.width;
      const y = palm.y * layout.height;

      let t = handTracks.get(id) || {
        x,
        y,
        t: now,
        closed: false,
        vx: 0,
        vy: 0,
        holding: false
      };

      const g = gesture(points);

      const fist = g.open
        ? false
        : g.fist
          ? true
          : t.closed;

      const dt = Math.max(
        0.016,
        (now - t.t) / 1000
      );

      const vx = clamp(
        (x - t.x) / dt,
        -1300,
        1300
      );

      const vy = clamp(
        (y - t.y) / dt,
        -1300,
        1300
      );

      t.vx = t.vx * 0.35 + vx * 0.65;
      t.vy = t.vy * 0.35 + vy * 0.65;

      t.x = x;
      t.y = y;
      t.t = now;

      if (
        playing &&
        !paused &&
        mode === 'camera'
      ) {
        if (fist) {
          const held = grab(id, x, y);

          if (held) {
            moveHeld(id, x, y);
            t.holding = true;
          }
        }

        if (!fist && t.closed) {
          release(id, t.vx, t.vy);
          t.holding = false;
        }
      }

      t.closed = fist;

      handTracks.set(id, t);

      hands.push({
        points,
        x,
        y,
        fist,
        label,
        color
      });
    }

    for (const [id, t] of handTracks) {
      if (
        !active.has(id) &&
        now - t.t > 250
      ) {
        if (playing && !paused) {
          release(id, 0, 0, false);
        }

        handTracks.delete(id);
      }
    }

  } catch (e) {
    cameraErrorCount++;

    if (cameraErrorCount === 1) {
      console.warn('Hand tracking:', e);
    }
  }
}

// ===== 绘制工具 =====

function drawImage(key, x, y, w, h) {
  const im = images[key];

  if (im?.complete && im.naturalWidth) {
    ctx.drawImage(im, x, y, w, h);
  }
}

function drawHand(hand) {
  ctx.save();

  ctx.strokeStyle = hand.color;
  ctx.lineWidth = 5;
  ctx.shadowColor = hand.color;
  ctx.shadowBlur = 10;

  for (const [a, b] of CONNECTIONS) {
    ctx.beginPath();

    ctx.moveTo(
      (1 - hand.points[a].x) * layout.width,
      hand.points[a].y * layout.height
    );

    ctx.lineTo(
      (1 - hand.points[b].x) * layout.width,
      hand.points[b].y * layout.height
    );

    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  for (const p of hand.points) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();

    ctx.arc(
      (1 - p.x) * layout.width,
      p.y * layout.height,
      4,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = hand.color;

  ctx.fillText(
    (hand.label === 'Left' ? 'LEFT' : 'RIGHT') +
    ' · ' +
    (hand.fist ? 'GRAB' : 'OPEN'),
    hand.x + 22,
    hand.y - 24
  );

  ctx.restore();
}

// ===== 绘制游戏画面 =====

function draw() {
  const r = canvas.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;

  canvas.width = Math.max(
    1,
    Math.round(r.width * dpr)
  );

  canvas.height = Math.max(
    1,
    Math.round(r.height * dpr)
  );

  const scale = Math.min(
    r.width / layout.width,
    r.height / layout.height
  );

  const ox = (r.width - layout.width * scale) / 2;
  const oy = (r.height - layout.height * scale) / 2;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, r.width, r.height);

  ctx.fillStyle = '#faf1d7';
  ctx.fillRect(0, 0, r.width, r.height);

  ctx.setTransform(
    dpr * scale,
    0,
    0,
    dpr * scale,
    dpr * ox,
    dpr * oy
  );

  // 背景
  if (layout === DESKTOP) {
    drawImage(
      'bg',
      0,
      0,
      layout.width,
      layout.height
    );
  } else {
    const im = images.bg;

    if (im?.naturalWidth) {
      const s = Math.max(
        layout.width / im.width,
        layout.height / im.height
      );

      const w = im.width * s;
      const h = im.height * s;

      ctx.drawImage(
        im,
        (layout.width - w) / 2,
        (layout.height - h) / 2,
        w,
        h
      );
    }
  }

  // 移动汤锅
  const soup = getSoupPosition();

  drawImage(
    'soup',
    soup.x,
    soup.y,
    soup.w,
    soup.h
  );

  // 食材
  for (const item of items) {
    ctx.save();

    ctx.translate(item.x, item.y);
    ctx.rotate(item.rot);

    const im = images[item.key];

    const aspect =
      (im?.naturalWidth || 1) /
      (im?.naturalHeight || 1);

    let w = item.size * (
      aspect > 1 ? 1.22 : 1.05
    );

    let h = w / aspect;

    if (h > item.size * 1.45) {
      h = item.size * 1.45;
      w = h * aspect;
    }

    ctx.shadowColor = '#685e4145';
    ctx.shadowBlur = 12;

    if (item.bad) {
      ctx.filter = 'brightness(.57) saturate(.65)';
    }

    drawImage(
      item.key,
      -w / 2,
      -h / 2,
      w,
      h
    );

    ctx.filter = 'none';
    ctx.shadowBlur = 0;

    if (item.bad) {
      ctx.fillStyle = '#786c58';

      for (let k = 0; k < 4; k++) {
        ctx.beginPath();

        ctx.arc(
          Math.sin(k * 17 + item.id) * w * 0.28,
          Math.cos(k * 13 + item.id) * h * 0.25,
          5 + k % 3 * 2,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }
    }

    ctx.restore();
  }

  // 粒子
  for (const p of particles) {
    ctx.globalAlpha = clamp(
      p.life / p.max,
      0,
      1
    );

    ctx.fillStyle = p.color;
    ctx.beginPath();

    ctx.arc(
      p.x,
      p.y,
      p.r,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  ctx.globalAlpha = 1;

  // 手势骨骼
  if (mode === 'camera') {
    hands.forEach(drawHand);
  }

  // 提示消息
  if (performance.now() < feedbackUntil) {
    ctx.fillStyle = '#fffdf1e8';
    ctx.beginPath();

    ctx.roundRect(
      layout.width * 0.19,
      layout.height * 0.28,
      layout.width * 0.62,
      72,
      22
    );

    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#526b42';
    ctx.font = 'bold 28px sans-serif';

    ctx.fillText(
      feedback,
      layout.width / 2,
      layout.height * 0.28 + 46
    );

    ctx.textAlign = 'left';
  }
}

// ===== 游戏主循环 =====

function loop(now) {
  updateLayout();

  const dt = Math.min(
    0.045,
    (now - lastTime) / 1000 || 0
  );

  lastTime = now;

  if (
    mode === 'camera' &&
    !paused &&
    !finished
  ) {
    detectHands(now);
  }

  if (playing && !paused) {
    elapsed += dt;
    remaining -= dt;
    spawnTimer -= dt;

    updateSoupMovement(dt);

    if (spawnTimer <= 0) {
      spawn();

      spawnTimer =
        Math.max(
          0.47,
          2.1 - elapsed * 0.025
        ) * rand(0.75, 1.2);
    }

    for (const item of [...items]) {
      if (!playing) break;

      item.age += dt;

      if (item.held !== null) continue;

      item.vy += 125 * dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.rot += item.spin * dt;

      if (
        item.thrown &&
        Math.abs(item.vx) > 170
      ) {
        if (
          item.x < layout.width * 0.12 ||
          item.x > layout.width * 0.88
        ) {
          resolveItem(item, item.bad);
          continue;
        }
      } else if (
        item.x < 60 ||
        item.x > layout.width - 60
      ) {
        item.vx *= -1;
      }

      if (
        item.y > layout.dropY &&
        classify(item)
      ) {
        continue;
      }

      if (
        item.y > layout.height + item.size
      ) {
        removeItem(item);

        lives--;
        flash('食材掉落，失去一条命');

        updateHud();

        if (lives <= 0) {
          endGame();
        }
      }
    }

    if (remaining <= 0) {
      endGame();
    }

    updateHud();

    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 230 * dt;
      p.life -= dt;
    }

    particles = particles.filter(
      p => p.life > 0
    );
  }

  draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

// ===== 按钮事件 =====

el('startCamera').onclick = () => start('camera');

el('startMouse').onclick = () => start('mouse');

el('cameraBtn').onclick = async () => {
  if (!playing) {
    await start('camera');
  } else if (!paused) {
    await enableCamera();
  }
};

el('mouseBtn').onclick = () => {
  if (!playing) {
    start('mouse');
  } else {
    for (const [id] of handTracks) {
      release(id, 0, 0, false);
    }

    mode = 'mouse';

    status('鼠标 / 触屏模式已开启');
  }
};

el('restartBtn').onclick = () => start(mode);

el('resultRestartBtn').onclick = () => start(mode);

el('pauseBtn').onclick = togglePause;

el('resumeBtn').onclick = togglePause;

window.addEventListener('beforeunload', () => {
  stream?.getTracks().forEach(t => t.stop());
});