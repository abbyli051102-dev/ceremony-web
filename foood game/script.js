"use strict";

// ======================================
// 01. 原来的图片素材
// ======================================
const ASSETS = {
  bg: "assets/bg.jpg",
  bin: "assets/bin.png",
  soup: "assets/soup.png",
  pepper: "assets/pepper.png",
  eggplant: "assets/eggplant.png",
  beef: "assets/beef.png",
  avocado: "assets/avocado.png",
  mushroom: "assets/mushroom.png",
  chicken: "assets/chicken.png",
  potato: "assets/potato.png",
  greens: "assets/greens.png",
  cabbage: "assets/cabbage.png",
  corn: "assets/corn.png",
  tomato: "assets/tomato.png",
  cauliflower: "assets/cauliflower.png"
};

const $ = id => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const video = $("video");
const handCanvas = $("handPreview");
const handCtx = handCanvas.getContext("2d");

const images = {};
const kinds = Object.keys(ASSETS).filter(
  key => !["bg", "bin", "soup"].includes(key)
);

for (const [key, src] of Object.entries(ASSETS)) {
  const image = new Image();
  image.src = src;
  images[key] = image;
}

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ======================================
// 02. 自适应布局
// ======================================

// 电脑：1648 × 928，位置与上一版一致。
// 手机竖屏：928 × 1648，底部三件物品重新排列。
const DESKTOP = {
  width: 1648,
  height: 928,

  // 左垃圾桶：向下移动 40px
  leftBin: {
    x: -28,
    y: 685,
    w: 385,
    h: 300
  },

  // 右垃圾桶：向下移动 40px
  rightBin: {
    x: 1290,
    y: 685,
    w: 385,
    h: 300
  },

  // 中间汤锅：向下移动 40px
  soup: {
    x: 380,
    y: 670,
    w: 880,
    h: 310
  },

  binEdge: 330,
  soupLeft: 420,
  soupRight: 1228,
  dropY: 745
};

const PORTRAIT = {
  width: 928,
  height: 1648,
  leftBin: { x: -24, y: 1310, w: 275, h: 245 },
  rightBin: { x: 677, y: 1310, w: 275, h: 245 },
  soup: { x: 210, y: 1290, w: 508, h: 260 },
  binEdge: 250,
  soupLeft: 260,
  soupRight: 668,
  dropY: 1370
};

let layout = DESKTOP;
let transform = { scale: 1, offsetX: 0, offsetY: 0 };

function isPortrait() {
  return (
    window.innerHeight > window.innerWidth &&
    window.innerWidth <= 800
  );
}

function getLayout() {
  return isPortrait() ? PORTRAIT : DESKTOP;
}

function updateLayout() {
  const next = getLayout();

  if (next === layout) return;

  const old = layout;
  layout = next;

  // 旋转手机时，现有食材同步映射。
  for (const item of items) {
    item.x = item.x / old.width * next.width;
    item.y = item.y / old.height * next.height;
  }

  // 释放可能还在被抓住的食材。
  for (const item of items) {
    item.held = null;
  }

  pointers.clear();
  handTracks.clear();
}

// ======================================
// 03. 游戏状态
// ======================================
let items = [];
let particles = [];
let hands = [];

const pointers = new Map();
const handTracks = new Map();

let playing = false;
let finished = false;
let mode = "mouse";

let score = 0;
let lives = 3;
let remaining = 60;
let elapsed = 0;
let spawnTimer = 0;
let nextId = 0;

let lastTime = performance.now();
let feedback = "";
let feedbackUntil = 0;

/* ===== 移动汤锅 ===== */

// 汤锅当前位置的水平偏移量
let soupOffsetX = 0;

// 汤锅移动方向：1 向右，-1 向左
let soupDirection = 1;

// 汤锅移动速度，单位：游戏坐标/秒
let soupSpeed = 130;

// 汤锅移动范围
// 电脑横屏范围较大，手机竖屏范围较小
function getSoupMoveRange() {
  return layout === PORTRAIT ? 145 : 280;
}

// 每一帧更新汤锅位置
function updateSoupMovement(dt) {
  const range = getSoupMoveRange();

  soupOffsetX += soupDirection * soupSpeed * dt;

  if (soupOffsetX >= range) {
    soupOffsetX = range;
    soupDirection = -1;
  }

  if (soupOffsetX <= -range) {
    soupOffsetX = -range;
    soupDirection = 1;
  }
}

// 获取汤锅当前的位置
function getSoupPosition() {
  return {
    x: layout.soup.x + soupOffsetX,
    y: layout.soup.y,
    w: layout.soup.w,
    h: layout.soup.h
  };
}

function status(text) {
  $("message").textContent = text;
}

function updateHud() {
  $("score").textContent = score;
  $("time").textContent = Math.max(
    0,
    Math.ceil(remaining)
  );

  $("spoiled").textContent =
    items.filter(item => item.bad).length;

  $("lives").textContent =
    "♥ ".repeat(lives) +
    "♡ ".repeat(3 - lives);
}

function resetGame() {
  updateLayout();

  items = [];
  particles = [];
  hands = [];

  pointers.clear();
  handTracks.clear();

  score = 0;
  lives = 3;
  remaining = 60;
  elapsed = 0;
  spawnTimer = 0.4;
  nextId = 0;

  playing = true;
  finished = false;

  $("modal").classList.add("hidden");

  status(
    mode === "camera"
      ? "✋ 握拳抓取，张掌释放"
      : "🖱 拖拽食材进行分类"
  );

  updateHud();
}

function endGame() {
  if (finished) return;

  playing = false;
  finished = true;

  $("modal").classList.remove("hidden");

  $("modalTitle").textContent =
    lives <= 0 ? "GAME OVER" : "TIME UP";

  $("modalText").textContent =
    `最终得分：${score}。
    好食材进入汤锅，坏食材进入垃圾桶。`;
}

function flash(text) {
  feedback = text;
  feedbackUntil = performance.now() + 1300;
  status(text);
}

// ======================================
// 04. 随机生成食材
// ======================================
function spawnFood() {
  const mobile = layout === PORTRAIT;
  const margin = mobile ? 110 : 170;

  items.push({
    id: ++nextId,

    key: kinds[
      Math.floor(Math.random() * kinds.length)
    ],

    bad: Math.random() < 0.5,

    x: rand(
      margin,
      layout.width - margin
    ),

    y: -200,

    vx: rand(-40, 40),

    vy: rand(75, 105) + elapsed * 2.8,

    // 放大食材，接近参考图中的比例
    size: mobile
      ? rand(145, 185)
      : rand(155, 215),

    rotation: rand(-0.2, 0.2),

    spin: rand(-0.5, 0.5),

    held: null
  });
}

// ======================================
// 05. 分类判定
// ======================================
function burst(x, y, correct) {
  for (let i = 0; i < 22; i++) {
    particles.push({
      x,
      y,
      vx: rand(-180, 180),
      vy: rand(-200, 70),
      life: rand(0.4, 0.85),
      radius: rand(3, 8),
      color: correct ? "#7bba63" : "#d76255"
    });
  }
}

function classify(item) {
  const x = item.x;
  const y = item.y;

  const soup = getSoupPosition();

  // 汤锅有效接取区域
  // 使用汤锅的中间区域，避免碰到边缘也算入锅
  const soupLeft = soup.x + soup.w * 0.15;
  const soupRight = soup.x + soup.w * 0.85;

  // 汤锅接取高度
  const soupTop = soup.y + soup.h * 0.25;

  // 食物是否落入移动的汤锅
  const inSoup =
    x >= soupLeft &&
    x <= soupRight &&
    y >= soupTop;

  // 食物是否被扔出左右边界
  const outLeft = x < -item.size * 0.35;
  const outRight =
    x > layout.width + item.size * 0.35;

  const thrownAway = outLeft || outRight;

  // 不在任何分类区域，不处理
  if (!inSoup && !thrownAway) {
    return false;
  }

  // 新鲜食物进入汤锅：正确
  // 变质食物扔到左右边界：正确
  const correct =
    (!item.bad && inSoup) ||
    (item.bad && thrownAway);

  if (correct) {
    score += item.bad ? 150 : 100;

    flash(
      item.bad
        ? "✓ 变质食物成功丢弃 +150"
        : "✓ 新鲜食材进入汤锅 +100"
    );
  } else {
    lives--;

    flash(
      item.bad
        ? "✗ 变质食物进入汤锅！"
        : "✗ 新鲜食物被扔掉了！"
    );
  }

  burst(item.x, item.y, correct);

  // 从画面中删除已经分类的食物
  items = items.filter(i => i !== item);

  updateHud();

  if (lives <= 0) {
    endGame();
  }

  return true;
}

// ======================================
// 06. 抓取、移动、释放
// ======================================
function nearestFood(x, y) {
  let nearest = null;
  let distance = Infinity;

  for (const item of items) {
    if (item.held !== null) continue;

    const d = Math.hypot(
      item.x - x,
      item.y - y
    );

    if (d < item.size * 0.8 && d < distance) {
      nearest = item;
      distance = d;
    }
  }

  return nearest;
}

function grab(id, x, y) {
  const item = nearestFood(x, y);

  if (item) item.held = id;

  return item;
}

function moveHeld(id, x, y) {
  for (const item of items) {
    if (item.held !== id) continue;

    // 允许食材被拖出屏幕左右两侧
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

function release(id, vx = 0, vy = 0) {
  for (const item of [...items]) {
    if (item.held !== id) continue;

    item.held = null;

    // 释放后保留手部移动方向和速度
    item.vx = clamp(vx, -1300, 1300);
    item.vy = clamp(vy, -950, 950);

    // 立即检查是否进入汤锅或扔出屏幕
    classify(item);
  }
}

// ======================================
// 07. 鼠标与手机触摸
// ======================================
function pointerPos(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x:
      (event.clientX - rect.left -
        transform.offsetX) /
      transform.scale,

    y:
      (event.clientY - rect.top -
        transform.offsetY) /
      transform.scale
  };
}

canvas.addEventListener("pointerdown", event => {
  if (!playing || mode !== "mouse") return;

  event.preventDefault();

  canvas.setPointerCapture(event.pointerId);

  const p = pointerPos(event);
  const id = "mouse-" + event.pointerId;

  grab(id, p.x, p.y);

  pointers.set(event.pointerId, {
    x: p.x,
    y: p.y,
    t: performance.now(),
    vx: 0,
    vy: 0
  });
});

canvas.addEventListener("pointermove", event => {
  const pointer = pointers.get(event.pointerId);
  if (!pointer) return;

  event.preventDefault();

  const p = pointerPos(event);
  const now = performance.now();

  const dt = Math.max(
    0.016,
    (now - pointer.t) / 1000
  );

  pointer.vx = (p.x - pointer.x) / dt;
  pointer.vy = (p.y - pointer.y) / dt;

  pointer.x = p.x;
  pointer.y = p.y;
  pointer.t = now;

  moveHeld(
    "mouse-" + event.pointerId,
    p.x,
    p.y
  );
});

function pointerUp(event) {
  const p = pointers.get(event.pointerId);
  if (!p) return;

  release(
    "mouse-" + event.pointerId,
    p.vx,
    p.vy
  );

  pointers.delete(event.pointerId);
}

canvas.addEventListener("pointerup", pointerUp);
canvas.addEventListener("pointercancel", pointerUp);

// ======================================
// 08. 摄像头：保留成功 Demo 的版本
// ======================================
const MP_VERSION = "0.10.14";

const MP_BASE =
  "https://cdn.jsdelivr.net/npm/" +
  "@mediapipe/tasks-vision@" + MP_VERSION;

const MODEL_URL =
  "https://storage.googleapis.com/" +
  "mediapipe-models/hand_landmarker/" +
  "hand_landmarker/float16/1/" +
  "hand_landmarker.task";

let handModel = null;
let stream = null;
let cameraOn = false;
let cameraBusy = false;

let lastVideoTime = -1;
let trackingErrors = 0;

function cameraError(error) {
  console.error("Camera error:", error);

  if (!window.isSecureContext) {
    return "请使用 localhost 或 HTTPS 打开网页。";
  }

  switch (error?.name) {
    case "NotAllowedError":
      return "摄像头权限被拒绝，请在浏览器中允许摄像头。";

    case "NotFoundError":
      return "没有检测到摄像头。";

    case "NotReadableError":
      return "摄像头可能被其他软件占用。";

    default:
      return error?.message || String(error);
  }
}

async function enableCamera() {
  if (cameraBusy) return false;

  cameraBusy = true;

  const btn = $("cameraBtn");
  btn.disabled = true;

  try {
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error(
        "摄像头需要 localhost 或 HTTPS 环境。"
      );
    }

    btn.textContent = "📷 连接摄像头…";
    status("① 正在申请摄像头权限…");

    if (!stream || !stream.active) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 }
        }
      });

      video.srcObject = stream;
    }

    video.style.display = "block";

    await video.play();

    if (video.readyState < 2) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("摄像头画面等待超时"));
        }, 10000);

        video.addEventListener(
          "loadeddata",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
      });
    }

    btn.textContent = "✋ 加载手势模型…";

    status(
      "② 摄像头画面正常，正在加载 MediaPipe 模型…"
    );

    if (!handModel) {
      const visionModule = await import(
        MP_BASE + "/+esm"
      );

      const {
        FilesetResolver,
        HandLandmarker
      } = visionModule;

      const vision =
        await FilesetResolver.forVisionTasks(
          MP_BASE + "/wasm"
        );

      const options = {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      };

      try {
        handModel =
          await HandLandmarker.createFromOptions(
            vision,
            options
          );
      } catch (gpuError) {
        console.warn(
          "GPU 初始化失败，切换 CPU",
          gpuError
        );

        options.baseOptions.delegate = "CPU";

        handModel =
          await HandLandmarker.createFromOptions(
            vision,
            options
          );
      }
    }

    cameraOn = true;
    lastVideoTime = -1;
    trackingErrors = 0;

    handCanvas.style.display = "block";

    btn.textContent = "✓ 摄像头已连接";

    status(
      "③ ✓ 摄像头和双手识别已启动！握拳抓取，张掌释放。"
    );

    return true;
  } catch (error) {
    status("⚠ " + cameraError(error));
    btn.textContent = "📷 重试摄像头";
    return false;
  } finally {
    cameraBusy = false;
    btn.disabled = false;
  }
}

// ======================================
// 09. 双手骨骼和握拳识别
// ======================================
const connections = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];

function isFist(points) {
  const tips = [8,12,16,20];
  const pips = [6,10,14,18];
  const wrist = points[0];

  let folded = 0;

  for (let i = 0; i < 4; i++) {
    const tip = points[tips[i]];
    const pip = points[pips[i]];

    const d1 = Math.hypot(
      tip.x - wrist.x,
      tip.y - wrist.y
    );

    const d2 = Math.hypot(
      pip.x - wrist.x,
      pip.y - wrist.y
    );

    if (d1 < d2 * 1.13) folded++;
  }

  return folded >= 3;
}

function detectHands(now) {
  if (!cameraOn || !handModel) return;
  if (video.readyState < 2) return;
  if (video.currentTime === lastVideoTime) return;

  lastVideoTime = video.currentTime;

  try {
    const result = handModel.detectForVideo(
      video,
      now
    );

    trackingErrors = 0;
    hands = [];

    handCtx.clearRect(
      0, 0,
      handCanvas.width,
      handCanvas.height
    );

    const active = new Set();
    const landmarks = result.landmarks || [];

    landmarks.forEach((points, index) => {
      const label =
        result.handednesses?.[index]?.[0]
          ?.categoryName || String(index);

      const id = "hand-" + label;
      active.add(id);

      const palm = points[9];

      // 关键适配：
      // 竖屏使用 928×1648，
      // 横屏使用 1648×928。
      const x = (1 - palm.x) * layout.width;
      const y = palm.y * layout.height;

      const fist = isFist(points);

      let track = handTracks.get(id);

      if (!track) {
        track = {
          x,
          y,
          t: now,
          closed: false,
          vx: 0,
          vy: 0
        };
      }

      const dt = Math.max(
        0.016,
        (now - track.t) / 1000
      );

      track.vx = clamp(
        (x - track.x) / dt,
        -1100,
        1100
      );

      track.vy = clamp(
        (y - track.y) / dt,
        -1100,
        1100
      );

      track.x = track.x * 0.35 + x * 0.65;
      track.y = track.y * 0.35 + y * 0.65;
      track.t = now;

      if (playing && mode === "camera") {
        if (fist && !track.closed) {
          grab(id, track.x, track.y);
        }

        if (fist) {
          moveHeld(id, track.x, track.y);
        }

        if (!fist && track.closed) {
          release(id, track.vx, track.vy);
        }
      }

      track.closed = fist;
      handTracks.set(id, track);

      hands.push({
        points,
        x: track.x,
        y: track.y,
        fist
      });

      // 摄像头预览中的手部骨骼。
      handCtx.strokeStyle =
        fist ? "#ffbd68" : "#74ffce";

      handCtx.lineWidth = 3;

      for (const [a, b] of connections) {
        handCtx.beginPath();

        handCtx.moveTo(
          (1 - points[a].x) * 320,
          points[a].y * 240
        );

        handCtx.lineTo(
          (1 - points[b].x) * 320,
          points[b].y * 240
        );

        handCtx.stroke();
      }

      for (const point of points) {
        handCtx.fillStyle = "#ffffff";
        handCtx.beginPath();

        handCtx.arc(
          (1 - point.x) * 320,
          point.y * 240,
          2.5,
          0,
          Math.PI * 2
        );

        handCtx.fill();
      }
    });

    for (const [id, track] of handTracks) {
      if (!active.has(id)) {
        release(id, track.vx, track.vy);
        handTracks.delete(id);
      }
    }
  } catch (error) {
    trackingErrors++;

    if (trackingErrors === 1) {
      console.error("Hand tracking error:", error);

      status(
        "手势推理错误：" + error.message
      );
    }
  }
}

// ======================================
// 10. 在游戏画面上绘制手势
// ======================================
function drawHands() {
  for (const hand of hands) {
    ctx.save();

    ctx.strokeStyle =
      hand.fist ? "#f1a44b" : "#54b9a7";

    ctx.lineWidth = 5;
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 9;

    for (const [a, b] of connections) {
      const p = hand.points[a];
      const q = hand.points[b];

      ctx.beginPath();

      ctx.moveTo(
        (1 - p.x) * layout.width,
        p.y * layout.height
      );

      ctx.lineTo(
        (1 - q.x) * layout.width,
        q.y * layout.height
      );

      ctx.stroke();
    }

    for (const point of hand.points) {
      ctx.fillStyle = "#fffdf2";
      ctx.beginPath();

      ctx.arc(
        (1 - point.x) * layout.width,
        point.y * layout.height,
        4,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.font = "bold 19px sans-serif";
    ctx.fillStyle = "#315b4b";

    ctx.fillText(
      hand.fist ? "GRAB" : "OPEN",
      hand.x + 22,
      hand.y - 25
    );

    ctx.restore();
  }
}

// ======================================
// 11. 图片绘制
// ======================================
function drawImage(key, x, y, w, h) {
  const image = images[key];

  if (!image?.complete || !image.naturalWidth) {
    return;
  }

  ctx.drawImage(image, x, y, w, h);
}

function drawBackground() {
  const image = images.bg;

  if (!image?.complete || !image.naturalWidth) {
    ctx.fillStyle = "#f9f1d7";
    ctx.fillRect(
      0, 0,
      layout.width,
      layout.height
    );
    return;
  }

  if (layout === DESKTOP) {
    // 电脑端：完全保留原背景位置。
    drawImage(
      "bg",
      0, 0,
      layout.width,
      layout.height
    );
    return;
  }

  // 手机竖屏：背景等比覆盖整个画面，
  // 不压扁、不留白。
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;

  const scale = Math.max(
    layout.width / iw,
    layout.height / ih
  );

  const dw = iw * scale;
  const dh = ih * scale;

  const dx = (layout.width - dw) / 2;
  const dy = (layout.height - dh) / 2;

  ctx.drawImage(image, dx, dy, dw, dh);
}

function draw() {
  updateLayout();

  const rect = canvas.getBoundingClientRect();

  const dpr = Math.min(
    window.devicePixelRatio || 1,
    2
  );

  const cw = Math.max(
    1,
    Math.round(rect.width * dpr)
  );

  const ch = Math.max(
    1,
    Math.round(rect.height * dpr)
  );

  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }

  // 使用 contain：竖屏完整显示整个游戏区域。
  const scale = Math.min(
    rect.width / layout.width,
    rect.height / layout.height
  );

  const offsetX =
    (rect.width - layout.width * scale) / 2;

  const offsetY =
    (rect.height - layout.height * scale) / 2;

  transform = {
    scale,
    offsetX,
    offsetY
  };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#f9f1d7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.setTransform(
    dpr * scale,
    0,
    0,
    dpr * scale,
    offsetX * dpr,
    offsetY * dpr
  );

  drawBackground();

  // 垃圾桶和汤锅：
  // 电脑位置不变，竖屏自动排列。
  // 获取正在左右移动的汤锅位置
const soup = getSoupPosition();

// 只绘制汤锅，不再绘制垃圾桶
drawImage(
  "soup",
  soup.x,
  soup.y,
  soup.w,
  soup.h
);

  // 食材
  for (const item of items) {
    ctx.save();

    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation);

    const image = images[item.key];

    const aspect =
      image?.naturalWidth && image?.naturalHeight
        ? image.naturalWidth / image.naturalHeight
        : 1;

    let width = item.size * (
  aspect > 1 ? 1.22 : 1.05
);

let height = width / aspect;

// 保留图片原始宽高比例，避免食材变形
if (height > item.size * 1.45) {
  height = item.size * 1.45;
  width = height * aspect;
}

    ctx.shadowColor = "#685e4145";
    ctx.shadowBlur = 12;

    if (item.bad) {
      ctx.filter =
        "brightness(0.57) saturate(0.65)";
    }

    drawImage(
      item.key,
      -width / 2,
      -height / 2,
      width,
      height
    );

    ctx.filter = "none";
    ctx.shadowBlur = 0;

    if (item.bad) {
      ctx.fillStyle = "#786c58";

      for (let k = 0; k < 4; k++) {
        ctx.beginPath();

        ctx.arc(
          Math.sin(k * 17 + item.id) *
            width * 0.28,

          Math.cos(k * 13 + item.id) *
            height * 0.25,

          5 + (k % 3) * 2,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }
    }

    ctx.restore();
  }

  // 分类粒子
  for (const p of particles) {
    ctx.globalAlpha = clamp(
      p.life / 0.85,
      0,
      1
    );

    ctx.fillStyle = p.color;
    ctx.beginPath();

    ctx.arc(
      p.x,
      p.y,
      p.radius,
      0,
      Math.PI * 2
    );

    ctx.fill();
  }

  ctx.globalAlpha = 1;

  if (cameraOn && mode === "camera") {
    drawHands();
  }

  // 提示位置随画面宽度适配。
  if (performance.now() < feedbackUntil) {
    const boxWidth = Math.min(
      670,
      layout.width - 100
    );

    const boxX =
      (layout.width - boxWidth) / 2;

    const boxY =
      layout === PORTRAIT ? 390 : 275;

    ctx.fillStyle = "#fffdf1e8";
    ctx.beginPath();

    ctx.roundRect(
      boxX,
      boxY,
      boxWidth,
      72,
      22
    );

    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = "#526b42";
    ctx.font = "bold 28px sans-serif";

    ctx.fillText(
      feedback,
      layout.width / 2,
      boxY + 45,
      boxWidth - 30
    );

    ctx.textAlign = "left";
  }
}

// ======================================
// 12. 游戏主循环
// ======================================
function loop(now) {
  const dt = Math.min(
    0.045,
    Math.max(0, (now - lastTime) / 1000)
  );

  lastTime = now;

  updateLayout();

  if (cameraOn) {
    detectHands(now);
  }

  if (playing) {
  elapsed += dt;
  remaining -= dt;
  spawnTimer -= dt;

  // 汤锅持续左右移动
  updateSoupMovement(dt);

    if (spawnTimer <= 0) {
      spawnFood();

      spawnTimer =
        Math.max(
          0.47,
          2.1 - elapsed * 0.025
        ) * rand(0.75, 1.2);
    }

    for (const item of [...items]) {

  // 被手势或鼠标抓住时，
  // 只跟随手移动，不受重力影响
  if (item.held !== null) continue;

  // 重力与掉落速度
  item.vy += 125 * dt;

  item.x += item.vx * dt;
  item.y += item.vy * dt;

  item.rotation += item.spin * dt;

  // 检测是否进入汤锅或被扔出左右边界
  if (classify(item)) {
    continue;
  }

  // 没接住的食材掉落到屏幕底部
  if (item.y > layout.height + item.size) {

    items = items.filter(
      i => i !== item
    );

    lives--;

    flash("食材掉落，失去一条命");

    if (lives <= 0) {
      endGame();
    }
  }
}

    if (remaining <= 0) {
      endGame();
    }

    updateHud();
  }

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 230 * dt;
    p.life -= dt;
  }

  particles = particles.filter(
    p => p.life > 0
  );

  draw();

  requestAnimationFrame(loop);
}

// ======================================
// 13. 按钮事件
// ======================================
$("startCamera").addEventListener(
  "click",
  async () => {
    $("modal").classList.add("hidden");

    const success = await enableCamera();

    if (success) {
      mode = "camera";
      resetGame();
    } else {
      $("modal").classList.remove("hidden");
      $("modalText").textContent =
        $("message").textContent;
    }
  }
);

$("startMouse").addEventListener(
  "click",
  () => {
    mode = "mouse";
    resetGame();
  }
);

$("cameraBtn").addEventListener(
  "click",
  async () => {
    const success = await enableCamera();

    if (success) {
      mode = "camera";

      if (!playing) {
        resetGame();
      }
    }
  }
);

$("mouseBtn").addEventListener(
  "click",
  () => {
    mode = "mouse";

    if (!playing) {
      resetGame();
    } else {
      for (const [id, track] of handTracks) {
        release(id, track.vx, track.vy);
      }

      handTracks.clear();
      status("已切换鼠标 / 触屏模式");
    }
  }
);

$("restartBtn").addEventListener(
  "click",
  resetGame
);

window.addEventListener(
  "beforeunload",
  () => {
    if (stream) {
      stream.getTracks().forEach(
        track => track.stop()
      );
    }
  }
);

window.addEventListener(
  "orientationchange",
  () => {
    updateLayout();
  }
);

window.addEventListener(
  "resize",
  updateLayout
);

updateHud();
requestAnimationFrame(loop);