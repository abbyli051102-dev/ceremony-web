/* =========================================
   SECOND CHANCE BITES
   食物的第二次机会
========================================= */

const ASSETS = {
  bg: "assets/bg.jpg",
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

const FOOD_REWARDS = [
  { name: "蔊菜皮蛋", image: "assets/dish1.png" },
  { name: "彩椒炒肉", image: "assets/dish2.png" },
  { name: "牛油果减脂餐", image: "assets/dish4.png" },
  { name: "肉末茄子", image: "assets/dish5.png" },
  { name: "番茄炒蛋", image: "assets/dish6.png" },
  { name: "花菜炒肉", image: "assets/dish7.png" },
  { name: "小鸡炖蘑菇", image: "assets/dish8.png" }
];

const DARK_FOOD = {
  name: "黑暗料理",
  image: "assets/dish3.png"
};

const DESKTOP = {
  width: 1648,
  height: 928,
  soup: {
    x: 380,
    y: 670,
    w: 880,
    h: 310
  }
};

const PORTRAIT = {
  width: 928,
  height: 1648,
  soup: {
    x: 210,
    y: 1340,
    w: 508,
    h: 260
  }
};

const HAND_SETTINGS = {
  leftColor: "#39B8FF",
  rightColor: "#FF994A",
  grabRadius: 1.15
};

const connections = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17]
];

const kinds = [
  "pepper",
  "eggplant",
  "beef",
  "avocado",
  "mushroom",
  "chicken",
  "potato",
  "greens",
  "cabbage",
  "corn",
  "tomato",
  "cauliflower"
];

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const video = document.getElementById("video");
const handPreview = document.getElementById("handPreview");
const handCtx = handPreview.getContext("2d");

const el = id => document.getElementById(id);

const clamp = (v, min, max) =>
  Math.max(min, Math.min(max, v));

const rand = (min, max) =>
  min + Math.random() * (max - min);

const images = {};

for (const [key, src] of Object.entries(ASSETS)) {
  const img = new Image();
  img.src = src;
  images[key] = img;
}

/* ===== 游戏状态 ===== */

let layout = DESKTOP;

let items = [];
let particles = [];
let hands = [];

let mode = "mouse";

let playing = false;
let finished = false;
let paused = false;

let score = 0;
let lives = 3;
let remaining = 60;
let elapsed = 0;
let spawnTimer = 0.6;
let nextId = 0;

let lastTime = performance.now();

let feedback = "";
let feedbackUntil = 0;

const pointers = new Map();
const handTracks = new Map();

/* ===== 汤锅移动 ===== */

let soupOffsetX = 0;
let soupDirection = 1;

const soupStartSpeed = 65;
const soupSpeed20 = 160;
const soupSpeed40 = 280;

let soupSpeed = soupStartSpeed;

function getSoupMoveRange() {
  return layout === PORTRAIT ? 145 : 280;
}

function getSoupPosition() {
  return {
    x: layout.soup.x + soupOffsetX,
    y: layout.soup.y,
    w: layout.soup.w,
    h: layout.soup.h
  };
}

function updateSoupMovement(dt) {
  const range = getSoupMoveRange();

  if (elapsed < 20) {
    soupSpeed = soupStartSpeed;
  } else if (elapsed < 40) {
    soupSpeed = soupSpeed20;
  } else {
    soupSpeed = soupSpeed40;
  }

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

/* ===== 横屏与竖屏 ===== */

function getLayout() {
  return (
    innerHeight > innerWidth &&
    innerWidth <= 800
  ) ? PORTRAIT : DESKTOP;
}

function updateLayout() {
  const next = getLayout();

  if (next === layout) return;

  const old = layout;
  layout = next;

  for (const item of items) {
    item.x = item.x / old.width * next.width;
    item.y = item.y / old.height * next.height;
    item.held = null;
  }

  soupOffsetX = 0;
  pointers.clear();
  handTracks.clear();
}

window.addEventListener("resize", updateLayout);
updateLayout();

/* ===== 顶部信息 ===== */

function updateHud() {
  el("score").textContent = score.toLocaleString();

  el("time").textContent =
    Math.max(0, Math.ceil(remaining));

  el("spoiled").textContent =
    items.filter(item => item.bad).length;

  el("lives").textContent =
    "♥ ".repeat(Math.max(0, lives)) +
    "♡ ".repeat(Math.max(0, 3 - lives));
}

function flash(message) {
  feedback = message;
  feedbackUntil = performance.now() + 1250;
  el("message").textContent = message;
}

/* ===== 游戏开始 / 重置 ===== */

async function startGame(which) {
  mode = which;

  playing = false;
  finished = false;
  paused = false;

  items = [];
  particles = [];
  hands = [];

  pointers.clear();
  handTracks.clear();

  score = 0;
  lives = 3;
  remaining = 60;
  elapsed = 0;
  spawnTimer = 0.6;
  nextId = 0;

  soupOffsetX = 0;
  soupDirection = 1;
  soupSpeed = soupStartSpeed;

  el("modal").classList.add("hidden");
  el("foodResult").classList.add("hidden");
  el("pauseOverlay").classList.add("hidden");
  el("pauseBtn").textContent = "⏸ 暂停";

  updateHud();

  if (which === "camera") {
    el("message").textContent =
      "正在启动摄像头与手势识别...";

    const ok = await enableCamera();

    if (!ok) {
      mode = "mouse";
      el("message").textContent =
        "摄像头未启动，请使用鼠标模式或重试";
      return;
    }
  } else {
    el("message").textContent =
      "拖动食材：新鲜入锅，变质扔向两侧";
  }

  lastTime = performance.now();
  playing = true;
}

/* ===== 暂停 ===== */

function togglePause() {
  if (!playing || finished) return;

  paused = !paused;

  el("pauseOverlay").classList.toggle(
    "hidden",
    !paused
  );

  el("pauseBtn").textContent =
    paused ? "▶ 继续" : "⏸ 暂停";

  if (paused) {
    // 清理抓取状态，避免暂停期间拖动物品
    for (const item of items) {
      if (item.held !== null) {
        item.held = null;
        item.vx = 0;
        item.vy = Math.max(0, item.vy);
      }
    }

    pointers.clear();
    handTracks.clear();
  }

  lastTime = performance.now();
}

/* ===== 最终奖励 ===== */

function showFoodResult() {
  let reward;

  if (score < 500) {
    reward = DARK_FOOD;
  } else {
    reward = FOOD_REWARDS[
      Math.floor(Math.random() * FOOD_REWARDS.length)
    ];
  }

  el("resultFoodImage").src = reward.image;
  el("resultFoodName").textContent = reward.name;

  el("resultFinalScore").textContent =
    score.toLocaleString();

  el("resultFoodMessage").textContent =
    score < 500
      ? "食物拯救失败！今天只能吃黑暗料理啦！"
      : "恭喜！这是你今天获得的美食奖励！";

  el("modal").classList.add("hidden");
  el("pauseOverlay").classList.add("hidden");
  el("foodResult").classList.remove("hidden");
}

function endGame() {
  if (finished) return;

  playing = false;
  finished = true;
  paused = false;

  showFoodResult();
}

/* ===== 食材生成 ===== */

function spawnFood() {
  const mobile = layout === PORTRAIT;
  const margin = mobile ? 110 : 170;

  items.push({
    id: ++nextId,

    key: kinds[
      Math.floor(Math.random() * kinds.length)
    ],

    bad: Math.random() < 0.49,

    x: rand(margin, layout.width - margin),
    y: -200,

    vx: rand(-40, 40),
    vy: rand(75, 105) + elapsed * 2.8,

    size: mobile
      ? rand(145, 185)
      : rand(155, 215),

    rotation: rand(-0.2, 0.2),
    spin: rand(-0.5, 0.5),

    held: null,

    // 只有被玩家抓过的食材才能扔向两侧
    touched: false,

    // 松手后允许向左右飞出
    thrown: false
  });
}

/* ===== 粒子反馈 ===== */

function burst(x, y, correct) {
  for (let i = 0; i < 20; i++) {
    particles.push({
      x,
      y,
      vx: rand(-180, 180),
      vy: rand(-200, 70),
      life: rand(0.4, 0.85),
      max: 0.85,
      r: rand(3, 8),
      color: correct ? "#7bba63" : "#d76255"
    });
  }
}

/* ===== 食物分类 ===== */

function finishItem(item, correct, message, points) {
  if (!items.includes(item)) return;

  if (correct) {
    score += points;
  } else {
    lives--;
  }

  burst(item.x, item.y, correct);
  flash(message);

  items = items.filter(i => i !== item);

  updateHud();

  if (lives <= 0) {
    endGame();
  }
}

function classify(item) {
  const soup = getSoupPosition();

  const soupLeft = soup.x + soup.w * 0.15;
  const soupRight = soup.x + soup.w * 0.85;
  const soupTop = soup.y + soup.h * 0.25;

  const inSoup =
    item.x >= soupLeft &&
    item.x <= soupRight &&
    item.y >= soupTop &&
    item.y <= layout.height + item.size;

  // 只允许抓取过并已松手的食材触发侧边丢弃
  const sideZone = layout.width * 0.12;

  const thrownAway =
    item.touched &&
    item.held === null &&
    item.thrown &&
    (
      item.x < sideZone ||
      item.x > layout.width - sideZone
    ) &&
    item.y > layout.height * 0.15;

  if (thrownAway) {
    finishItem(
      item,
      item.bad,
      item.bad
        ? "✓ 变质食物成功丢弃 +150"
        : "✗ 新鲜食物被扔掉了！",
      150
    );

    return true;
  }

  if (inSoup && item.held === null) {
    finishItem(
      item,
      !item.bad,
      item.bad
        ? "✗ 变质食物进入汤锅！"
        : "✓ 新鲜食材进入汤锅 +100",
      100
    );

    return true;
  }

  return false;
}

/* ===== 抓取与释放 ===== */

function nearestFood(x, y) {
  let best = null;
  let distance = Infinity;

  for (const item of items) {
    if (item.held !== null) continue;

    const d = Math.hypot(
      item.x - x,
      item.y - y
    );

    if (
      d < item.size * HAND_SETTINGS.grabRadius &&
      d < distance
    ) {
      best = item;
      distance = d;
    }
  }

  return best;
}

function grab(id, x, y) {
  // 一只手只能抓一个食材
  const existing = items.find(
    item => item.held === id
  );

  if (existing) return existing;

  const item = nearestFood(x, y);

  if (item) {
    item.held = id;
    item.touched = true;
    item.thrown = false;
  }

  return item;
}

function moveHeld(id, x, y) {
  const item = items.find(
    i => i.held === id
  );

  if (!item) return;

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

function release(id, vx = 0, vy = 0) {
  for (const item of [...items]) {
    if (item.held !== id) continue;

    item.held = null;
    item.thrown = true;

    // 水平甩出，保留向左右扔的功能
    item.vx = clamp(vx * 1.4, -1600, 1600);

    // 取消向上回弹
    item.vy = Math.max(80, vy);

    classify(item);
  }
}

/* ===== 鼠标 / 触屏 ===== */

function pointerPos(event) {
  const rect = canvas.getBoundingClientRect();

  const scale = Math.min(
    rect.width / layout.width,
    rect.height / layout.height
  );

  const offsetX =
    (rect.width - layout.width * scale) / 2;

  const offsetY =
    (rect.height - layout.height * scale) / 2;

  return {
    x: (event.clientX - rect.left - offsetX) / scale,
    y: (event.clientY - rect.top - offsetY) / scale
  };
}

canvas.addEventListener("pointerdown", event => {
  if (!playing || paused || mode !== "mouse") return;

  canvas.setPointerCapture(event.pointerId);

  const p = pointerPos(event);
  const id = "mouse-" + event.pointerId;

  const obj = grab(id, p.x, p.y);

  pointers.set(event.pointerId, {
    ...p,
    t: performance.now(),
    obj,
    vx: 0,
    vy: 0
  });
});

canvas.addEventListener("pointermove", event => {
  if (!playing || paused || mode !== "mouse") return;

  const p = pointers.get(event.pointerId);
  if (!p) return;

  const q = pointerPos(event);
  const now = performance.now();

  const dt = Math.max(
    0.016,
    (now - p.t) / 1000
  );

  p.vx = (q.x - p.x) / dt;
  p.vy = (q.y - p.y) / dt;

  p.x = q.x;
  p.y = q.y;
  p.t = now;

  if (p.obj) {
    moveHeld(
      "mouse-" + event.pointerId,
      q.x,
      q.y
    );
  }
});

function pointerUp(event) {
  const p = pointers.get(event.pointerId);
  if (!p) return;

  if (playing && !paused) {
    release(
      "mouse-" + event.pointerId,
      p.vx,
      p.vy
    );
  }

  pointers.delete(event.pointerId);
}

canvas.addEventListener("pointerup", pointerUp);
canvas.addEventListener("pointercancel", pointerUp);

/* ===== MediaPipe 摄像头 ===== */

let handModel = null;
let stream = null;
let cameraBusy = false;
let cameraOn = false;
let lastVideoTime = -1;
let trackingErrors = 0;

async function enableCamera() {
  if (cameraBusy) return false;

  cameraBusy = true;

  const btn = el("cameraBtn");

  btn.disabled = true;
  btn.textContent = "📷 摄像头加载中...";

  try {
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error(
        "请通过 HTTPS 或 localhost 打开游戏"
      );
    }

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

    video.muted = true;
    video.playsInline = true;

    await video.play();

    video.style.display = "block";
    handPreview.style.display = "block";

    if (!handModel) {
      const cdn =
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

      const visionModule = await import(cdn + "/+esm");

      const vision =
        await visionModule.FilesetResolver.forVisionTasks(
          cdn + "/wasm"
        );

      const options = {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU"
        },

        runningMode: "VIDEO",
        numHands: 2,

        minHandDetectionConfidence: 0.45,
        minHandPresenceConfidence: 0.45,
        minTrackingConfidence: 0.45
      };

      try {
        handModel =
          await visionModule.HandLandmarker.createFromOptions(
            vision,
            options
          );
      } catch (error) {
        options.baseOptions.delegate = "CPU";

        handModel =
          await visionModule.HandLandmarker.createFromOptions(
            vision,
            options
          );
      }
    }

    cameraOn = true;
    lastVideoTime = -1;
    trackingErrors = 0;

    btn.textContent = "✓ 摄像头已连接";

    el("message").textContent =
      "摄像头已就绪：握拳抓取，张掌释放";

    return true;

  } catch (error) {
    console.error(error);

    btn.textContent = "📷 重试摄像头";

    el("message").textContent =
      "摄像头启动失败：" + error.message;

    cameraOn = false;
    return false;

  } finally {
    cameraBusy = false;
    btn.disabled = false;
  }
}

/* ===== 手势判断 ===== */

function fingerAngle(a, b, c) {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const abz = (a.z || 0) - (b.z || 0);

  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const cbz = (c.z || 0) - (b.z || 0);

  const dot =
    abx * cbx + aby * cby + abz * cbz;

  const length =
    Math.hypot(abx, aby, abz) *
    Math.hypot(cbx, cby, cbz);

  const cosine = clamp(
    dot / Math.max(0.000001, length),
    -1,
    1
  );

  return Math.acos(cosine) * 180 / Math.PI;
}

function getHandGesture(points) {
  const fingers = [
    [5, 6, 8],
    [9, 10, 12],
    [13, 14, 16],
    [17, 18, 20]
  ];

  let folded = 0;
  let extended = 0;

  for (const [mcp, pip, tip] of fingers) {
    const angle = fingerAngle(
      points[mcp],
      points[pip],
      points[tip]
    );

    if (angle < 115) folded++;
    if (angle > 150) extended++;
  }

  return {
    fist: folded >= 3,
    open: extended >= 3
  };
}

function getHandColor(label) {
  return label === "Left"
    ? HAND_SETTINGS.leftColor
    : HAND_SETTINGS.rightColor;
}

/* ===== 双手检测 ===== */

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
      0,
      0,
      handPreview.width,
      handPreview.height
    );

    const active = new Set();

    const landmarks = result.landmarks || [];

    landmarks.forEach((points, index) => {
      const label =
        result.handednesses?.[index]?.[0]
          ?.categoryName || `Hand${index}`;

      const id = "hand-" + label;
      const color = getHandColor(label);

      active.add(id);

      const palm = points[9];

      const x = (1 - palm.x) * layout.width;
      const y = palm.y * layout.height;

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

      const gesture = getHandGesture(points);

      // 明确张掌时立即释放
      const fist = gesture.open
        ? false
        : gesture.fist
          ? true
          : track.closed;

      const dt = Math.max(
        0.016,
        (now - track.t) / 1000
      );

      const instantVx = clamp(
        (x - track.x) / dt,
        -1300,
        1300
      );

      const instantVy = clamp(
        (y - track.y) / dt,
        -1300,
        1300
      );

      track.vx =
        track.vx * 0.35 +
        instantVx * 0.65;

      track.vy =
        track.vy * 0.35 +
        instantVy * 0.65;

      // 不做弹性平滑，直接跟随
      track.x = x;
      track.y = y;
      track.t = now;

      if (playing && !paused && mode === "camera") {
        const heldItem = items.find(
          item => item.held === id
        );

        // 持续握拳时，没有抓到可继续尝试
        if (fist && !heldItem) {
          grab(id, track.x, track.y);
        }

        if (fist) {
          moveHeld(id, track.x, track.y);
        }

        if (!fist && track.closed) {
          release(
            id,
            track.vx,
            track.vy
          );
        }
      }

      track.closed = fist;
      handTracks.set(id, track);

      hands.push({
        points,
        x: track.x,
        y: track.y,
        fist,
        label,
        color
      });

      // 摄像头预览骨骼
      handCtx.strokeStyle = color;
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
        handCtx.fillStyle = "#FFFFFF";
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

    // 手离开镜头后清除旧状态
    for (const [id, track] of handTracks) {
      if (
        !active.has(id) &&
        now - track.t > 250
      ) {
        if (playing && !paused) {
          release(id, 0, 80);
        }

        handTracks.delete(id);
      }
    }

  } catch (error) {
    trackingErrors++;

    if (trackingErrors === 1) {
      console.error("手势识别错误：", error);
    }
  }
}

/* ===== 绘制手部骨骼 ===== */

function drawHands() {
  for (const hand of hands) {
    ctx.save();

    ctx.strokeStyle = hand.color;
    ctx.lineWidth = 5;
    ctx.shadowColor = hand.color;
    ctx.shadowBlur = 12;

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
      ctx.fillStyle = "#FFFFFF";
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
    ctx.font = "bold 21px sans-serif";
    ctx.fillStyle = hand.color;

    const name =
      hand.label === "Left"
        ? "LEFT"
        : hand.label === "Right"
          ? "RIGHT"
          : "HAND";

    ctx.fillText(
      name + " · " +
      (hand.fist ? "GRAB" : "OPEN"),
      hand.x + 22,
      hand.y - 25
    );

    ctx.restore();
  }
}

/* ===== 绘制图片 ===== */

function drawImage(key, x, y, w, h) {
  const img = images[key];

  if (!img?.complete || !img.naturalWidth) {
    return;
  }

  ctx.drawImage(img, x, y, w, h);
}

function drawBackground() {
  const img = images.bg;

  if (!img?.complete || !img.naturalWidth) return;

  if (layout === DESKTOP) {
    drawImage(
      "bg",
      0,
      0,
      layout.width,
      layout.height
    );
  } else {
    const scale = Math.max(
      layout.width / img.width,
      layout.height / img.height
    );

    const w = img.width * scale;
    const h = img.height * scale;

    ctx.drawImage(
      img,
      (layout.width - w) / 2,
      (layout.height - h) / 2,
      w,
      h
    );
  }
}

function drawFood(item) {
  ctx.save();

  ctx.translate(item.x, item.y);
  ctx.rotate(item.rotation);

  const img = images[item.key];

  const iw = img?.naturalWidth || 1;
  const ih = img?.naturalHeight || 1;

  const aspect = iw / ih;

  let w = item.size * (
    aspect > 1 ? 1.22 : 1.05
  );

  let h = w / aspect;

  if (h > item.size * 1.45) {
    h = item.size * 1.45;
    w = h * aspect;
  }

  ctx.shadowColor = "#685e4145";
  ctx.shadowBlur = 12;

  if (item.bad) {
    ctx.filter =
      "brightness(0.57) saturate(0.65)";
  }

  drawImage(
    item.key,
    -w / 2,
    -h / 2,
    w,
    h
  );

  ctx.filter = "none";
  ctx.shadowBlur = 0;

  if (item.bad) {
    ctx.fillStyle = "#786c58";

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

/* ===== 绘制游戏 ===== */

function draw() {
  const rect = canvas.getBoundingClientRect();

  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);

  const scale = Math.min(
    rect.width / layout.width,
    rect.height / layout.height
  );

  const offsetX =
    (rect.width - layout.width * scale) / 2;

  const offsetY =
    (rect.height - layout.height * scale) / 2;

  ctx.setTransform(
    dpr * scale,
    0,
    0,
    dpr * scale,
    dpr * offsetX,
    dpr * offsetY
  );

  ctx.clearRect(
    -layout.width,
    -layout.height,
    layout.width * 3,
    layout.height * 3
  );

  drawBackground();

  // 只保留移动汤锅
  const soup = getSoupPosition();

  drawImage(
    "soup",
    soup.x,
    soup.y,
    soup.w,
    soup.h
  );

  for (const item of items) {
    drawFood(item);
  }

  for (const p of particles) {
    ctx.globalAlpha = clamp(
      p.life / p.max,
      0,
      1
    );

    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;

  if (mode === "camera") {
    drawHands();
  }

  if (
    !paused &&
    performance.now() < feedbackUntil
  ) {
    const centerX = layout.width / 2;
    const boxY = layout.height * 0.3;

    ctx.fillStyle = "#fffdf1e8";
    ctx.beginPath();

    ctx.roundRect(
      centerX - 335,
      boxY,
      670,
      72,
      22
    );

    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = "#526b42";
    ctx.font = "bold 30px sans-serif";

    ctx.fillText(
      feedback,
      centerX,
      boxY + 45
    );

    ctx.textAlign = "left";
  }
}

/* ===== 游戏主循环 ===== */

function loop(now) {
  const dt = Math.min(
    0.045,
    (now - lastTime) / 1000 || 0
  );

  lastTime = now;

  // 摄像头持续更新，但暂停时不执行游戏操作
  if (mode === "camera" && !paused) {
    detectHands(now);
  }

  if (playing && !paused) {
    elapsed += dt;
    remaining -= dt;
    spawnTimer -= dt;

    updateSoupMovement(dt);

    if (spawnTimer <= 0) {
      spawnFood();

      spawnTimer = Math.max(
        0.47,
        2.1 - elapsed * 0.025
      ) * rand(0.75, 1.2);
    }

    for (const item of [...items]) {
      if (finished) break;
      if (item.held !== null) continue;

      item.vy += 125 * dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;

      item.rotation += item.spin * dt;

      // 未被玩家甩出的食物只做普通漂移
      if (!item.thrown) {
        if (
          item.x < 60 ||
          item.x > layout.width - 60
        ) {
          item.vx *= -1;
          item.x = clamp(
            item.x,
            60,
            layout.width - 60
          );
        }
      }

      if (classify(item)) continue;

      // 被甩出画面但尚未触发边缘判定
      if (
        item.thrown &&
        (
          item.x < -item.size ||
          item.x > layout.width + item.size
        )
      ) {
        finishItem(
          item,
          item.bad,
          item.bad
            ? "✓ 变质食物成功丢弃 +150"
            : "✗ 新鲜食物被扔掉了！",
          150
        );

        continue;
      }

      // 掉出底部，扣生命
      if (item.y > layout.height + item.size) {
        items = items.filter(i => i !== item);

        lives--;
        flash("食材掉落，失去一条命");

        if (lives <= 0) {
          endGame();
        }
      }
    }

    if (!finished && remaining <= 0) {
  remaining = 0;
  playing = false;
  finished = true;

  el("modalTitle").textContent = "时间到！";
  el("modalText").textContent =
    "最终得分：" + score.toLocaleString();

  el("modal").classList.remove("hidden");
}

    updateHud();
  }

  if (playing && !paused) {
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

/* ===== 按钮事件 ===== */

el("startCamera").addEventListener(
  "click",
  () => startGame("camera")
);

el("startMouse").addEventListener(
  "click",
  () => startGame("mouse")
);

el("cameraBtn").addEventListener(
  "click",
  async () => {
    if (!playing) {
      startGame("camera");
    } else {
      const ok = await enableCamera();

      if (ok) {
        mode = "camera";
      }
    }
  }
);

el("mouseBtn").addEventListener(
  "click",
  () => {
    if (!playing) {
      startGame("mouse");
    } else {
      // 切换模式时释放正在抓取的食物
      for (const item of items) {
        if (item.held !== null) {
          item.held = null;
          item.vx = 0;
          item.vy = Math.max(80, item.vy);
        }
      }

      handTracks.clear();
      pointers.clear();
      mode = "mouse";

      el("message").textContent =
        "鼠标 / 触屏模式已开启";
    }
  }
);

el("pauseBtn").addEventListener(
  "click",
  togglePause
);

el("resumeBtn").addEventListener(
  "click",
  togglePause
);

el("restartBtn").addEventListener(
  "click",
  () => startGame(mode)
);

el("resultRestartBtn").addEventListener(
  "click",
  () => startGame(mode)
);

/* ===== 页面关闭时停止摄像头 ===== */

window.addEventListener("beforeunload", () => {
  if (stream) {
    stream.getTracks().forEach(
      track => track.stop()
    );
  }
});

/* ===== 启动渲染 ===== */

updateHud();
requestAnimationFrame(loop);