/* SECOND CHANCE BITES — Level 2 / Endless Mode
   This extension is loaded before the original script.js.
   It uses the original game's global variables and drawing functions.
*/
window.levelTwo = (() => {
  const $ = id => document.getElementById(id);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const between = (a,b) => a + Math.random()*(b-a);
  const keep = (v,a,b) => Math.min(b,Math.max(a,v));
  const modelURL = 'https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task';
  const sdkURL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const game = {stage:1, drops:[], x:0.5, direction:0, lastPoseAt:0, nextSpawn:1, heartAt:15,
    stageTime:0, poseModel:null, poseLoading:null, lastVideo:-1, lastPoseError:0, lastIntent:0,
    rankingSaved:false, keyboard:0, lucky:null, runId:0};
  const camp = new Image(); camp.src = 'assets/camp.webp';
  const rewardImgs = [1,2,4,5,6,7,8].map(i => 'assets/dish'+i+'.webp');
  const mealNames = {1:'蔊菜皮蛋',2:'彩椒炒肉',4:'牛油果减脂餐',5:'肉末茄子',6:'番茄炒蛋',7:'花菜炒肉',8:'小鸡炖蘑菇'};
  const bomb = {symbol:'💣'};
  const heart = {symbol:'💗'};

  function reset() {
    game.runId++;
    game.stage=1; game.drops=[]; game.x=.5; game.direction=0; game.keyboard=0;
    game.nextSpawn=1; game.heartAt=15; game.stageTime=0; game.lastPoseAt=0;
    game.lastVideo=-1; game.rankingSaved=false; game.lucky=null;
    $('stageBadge').textContent='LEVEL 1 · 厨房拯救 · 1000分过关';
    $('bodyGuide').classList.add('hidden');
    $('levelTransition').classList.add('hidden');
    $('rankingOverlay').classList.add('hidden');
    $('foodResult').classList.add('hidden');
    $('modalTitle').textContent='食物的第二次机会';
    $('modalText').textContent='新鲜食材放进汤锅，变质食材向两侧丢弃。累计1000分解锁湖畔露营！';
    $('cardWheel').replaceChildren();
  }

  function winLevelOne() {
    if (game.stage !== 1 || finished) return;
    game.stage=1.5;
    playing=false; paused=false;
    pointers.clear(); handTracks.clear();
    for (const item of items) item.held=null;
    $('stageBadge').textContent='LEVEL 1 COMPLETE · 幸运抽卡';
    $('levelTransition').classList.remove('hidden');
    $('enterLevel2').disabled=true;
    $('luckyReveal').classList.add('hidden');
    const wheel=$('cardWheel'); wheel.replaceChildren();
    for (let i=0;i<7;i++) {
      const card=document.createElement('div'); card.className='spinCard';
      card.style.setProperty('--delay',(-i*.15)+'s');
      const img=document.createElement('img'); img.src=rewardImgs[i]; img.alt='幸运菜品';
      card.appendChild(img); wheel.appendChild(card);
    }
    const thisRun=game.runId;
    setTimeout(() => {
      if (game.stage!==1.5 || game.runId!==thisRun) return;
      const n=pick([1,2,4,5,6,7,8]);
      game.lucky=n;
      wheel.classList.add('hidden');
      $('luckyImage').src='assets/dish'+n+'.webp';
      $('luckyName').textContent=mealNames[n];
      $('luckyReveal').classList.remove('hidden');
      $('enterLevel2').disabled=false;
    },2600);
    wheel.classList.remove('hidden');
  }

  async function enterLevel2() {
    if (game.stage!==1.5 || !game.lucky) return;
    const button=$('enterLevel2');
    button.disabled=true;
    button.textContent='正在准备湖畔关卡…';
    // Camera model loads on entering the level, without blocking fallback play.
    game.stage=2;
    game.drops=[]; game.x=.5; game.direction=0; game.keyboard=0;
    game.nextSpawn=.7; game.stageTime=0; game.heartAt=15; game.lastVideo=-1;
    items=[]; particles=[]; hands=[];
    remaining=60; elapsed=0; spawnTimer=1; lives=3; updateHud();
    $('levelTransition').classList.add('hidden');
    $('bodyGuide').classList.remove('hidden');
    $('stageBadge').textContent='LEVEL 2 · 湖畔接食物 · 1500分解锁无限模式';
    $('message').textContent='双臂同时向左/右伸展控制汤锅，坏食物不要接，炸弹 -300，爱心 +1命';
    lastTime=performance.now(); playing=true; finished=false; paused=false;
    $('pauseBtn').textContent='⏸ 暂停';
    if (mode==='camera') initHolistic();
    button.textContent='🎪 进入第二关';
  }

  async function initHolistic() {
    if (game.poseModel) return game.poseModel;
    if (game.poseLoading) return game.poseLoading;
    game.poseLoading=(async()=>{
      try {
        $('message').textContent='正在加载 Holistic 全身姿态模型…（可先使用方向键）';
        const sdk=await import(sdkURL+'/+esm');
        const files=await sdk.FilesetResolver.forVisionTasks(sdkURL+'/wasm');
        let options={baseOptions:{modelAssetPath:modelURL,delegate:'GPU'},runningMode:'VIDEO',
          minPoseDetectionConfidence:.42,minPosePresenceConfidence:.42,minHandLandmarksConfidence:.42};
        try { game.poseModel=await sdk.HolisticLandmarker.createFromOptions(files,options); }
        catch(e) {options.baseOptions.delegate='CPU';game.poseModel=await sdk.HolisticLandmarker.createFromOptions(files,options);}
        $('message').textContent='全身姿态识别已就绪：双臂一起向左或向右伸展';
        return game.poseModel;
      } catch(e) {
        console.error('Holistic 加载失败',e);
        $('message').textContent='姿态模型加载失败，可使用 ← → 键或拖动汤锅继续：'+e.message;
        return null;
      } finally {game.poseLoading=null;}
    })();
    return game.poseLoading;
  }

  function detectBody(now) {
    if (!game.poseModel || !cameraOn || video.readyState<2) return;
    if (video.currentTime===game.lastVideo) return;
    game.lastVideo=video.currentTime;
    try {
      const result=game.poseModel.detectForVideo(video,now);
      const pose=result.poseLandmarks?.[0];
      if (!pose) { if(now-game.lastPoseAt>500) game.direction=0; return; }
      // 11/12 shoulders, 13/14 elbows, 15/16 wrists.
      const ls=pose[11],rs=pose[12],le=pose[13],re=pose[14],lw=pose[15],rw=pose[16];
      if (![ls,rs,le,re,lw,rw].every(p=>p && (p.visibility===undefined || p.visibility>.42))) {
        if(now-game.lastPoseAt>500)game.direction=0;
        return;
      }
      const shoulderMid=(ls.x+rs.x)/2;
      const shoulderSpan=Math.max(.12,Math.abs(ls.x-rs.x));
      const wristsMid=(lw.x+rw.x)/2;
      // Both wrists need to be on the same side of the torso, elbows extended.
      const threshold=Math.max(.065,shoulderSpan*.32);
      const leftward=lw.x<shoulderMid-threshold && rw.x<shoulderMid-threshold;
      const rightward=lw.x>shoulderMid+threshold && rw.x>shoulderMid+threshold;
      const extended=Math.abs(lw.x-ls.x)>.09 || Math.abs(rw.x-rs.x)>.09;
      // Webcam is mirrored visually, therefore invert camera-space direction.
      const desired=extended ? (leftward?1:rightward?-1:0):0;
      game.direction=desired;
      game.lastPoseAt=now;
      // Pose preview, mirrored to match video.
      handCtx.clearRect(0,0,320,240);
      handCtx.strokeStyle='#40b8ff';handCtx.lineWidth=4;
      for(const [a,b] of [[11,13],[13,15],[12,14],[14,16],[11,12]]){
        handCtx.beginPath();handCtx.moveTo((1-pose[a].x)*320,pose[a].y*240);
        handCtx.lineTo((1-pose[b].x)*320,pose[b].y*240);handCtx.stroke();
      }
      handCtx.fillStyle='#ffdf78';
      for(const i of [11,12,13,14,15,16]){handCtx.beginPath();handCtx.arc((1-pose[i].x)*320,pose[i].y*240,5,0,Math.PI*2);handCtx.fill();}
    } catch(e) {
      if(now-game.lastPoseError>3000){console.warn('Holistic 检测异常',e);game.lastPoseError=now;}
    }
  }

  function spawn(type) {
    const mobile=layout===PORTRAIT;
    const margin=mobile?85:110;
    const food=pick(kinds);
    const roll=Math.random();
    type=type||(roll<.63?'fresh':roll<.84?'bad':'bomb');
    game.drops.push({type,key:food,x:between(margin,layout.width-margin),y:-100,
      size:mobile?between(112,160):between(120,165),speed:between(205,275)+Math.min(240,game.stageTime*2.2),
      rotation:between(-.2,.2),spin:between(-.5,.5)});
  }
  function nextHeart() {return game.stage===3?between(9,26):15;}
  function stageMessage(msg) {flash(msg);updateHud();}

  function update(dt,now) {
    if(game.stage!==2 && game.stage!==3)return;
    game.stageTime+=dt;
    elapsed+=dt;
    remaining=game.stage===3?Infinity:Math.max(0,60-game.stageTime);
    if(mode==='camera') detectBody(now);
    const dir=game.keyboard||game.direction;
    game.x=keep(game.x+dir*dt*.56,.16,.84);
    game.nextSpawn-=dt;
    if(game.nextSpawn<=0){spawn();game.nextSpawn=between(.68,1.23)*Math.max(.7,1-game.stageTime*.0015);}
    if(game.stageTime>=game.heartAt){
      game.drops.push({type:'heart',x:between(100,layout.width-100),y:-100,
        size:110,speed:230+Math.min(180,game.stageTime),rotation:0,spin:0});
      game.heartAt+=nextHeart();
    }
    const soupY=layout.height*(layout===PORTRAIT?.83:.77);
    const soupW=layout.width*(layout===PORTRAIT?.34:.29);
    const soupCenter=game.x*layout.width;
    for(const d of [...game.drops]){
      d.y+=d.speed*dt;
      d.rotation+=d.spin*dt;
      if(d.y>=soupY && d.y<soupY+d.speed*dt+20){
        const caught=Math.abs(d.x-soupCenter)<soupW*.44;
        if(caught){
          game.drops.splice(game.drops.indexOf(d),1);
          if(d.type==='fresh') {score+=100;stageMessage('✓ 接住新鲜食材 +100');}
          if(d.type==='bad') {lives--;stageMessage('✗ 接到了变质食物 -1命');}
          if(d.type==='bomb') {score=Math.max(0,score-300);stageMessage('💣 炸弹！扣除300分');}
          if(d.type==='heart') {lives=Math.min(3,lives+1);stageMessage('💗 爱心补充 +1命');}
          if(lives<=0){gameOver();return;}
          if(game.stage===2 && score>=1500){enterEndless();return;}
          continue;
        }
      }
      if(d.y>layout.height+d.size){
        game.drops.splice(game.drops.indexOf(d),1);
        // Spoiled food and bombs safely fall to the ground when ignored.
        if(d.type==='fresh'){
          lives--;stageMessage('错过新鲜食材 -1命');
          if(lives<=0){gameOver();return;}
        }
      }
    }
    if(game.stage===2 && game.stageTime>=60){
      // Keep playing stage 2 until 1500, unless all lives are gone.
      remaining=0;
    }
    updateHud();
    $('time').textContent=game.stage===3?'∞':Math.max(0,Math.ceil(60-game.stageTime));
    $('spoiled').textContent=game.drops.filter(d=>d.type==='bad').length;
  }

  function enterEndless(){
    game.stage=3;game.stageTime=0;game.heartAt=nextHeart();
    game.nextSpawn=.5;game.drops=[];
    $('stageBadge').textContent='∞ ENDLESS MODE · 无限挑战';
    stageMessage('🎉 1500分达成！进入无限模式，爱心随机掉落');
  }

  function draw(g){
    const w=layout.width,h=layout.height;
    g.save();
    if(camp.complete&&camp.naturalWidth){
      const sc=Math.max(w/camp.width,h/camp.height);
      g.drawImage(camp,(w-camp.width*sc)/2,(h-camp.height*sc)/2,camp.width*sc,camp.height*sc);
    } else {g.fillStyle='#d7e7c4';g.fillRect(0,0,w,h);}
    // Slight transparent catching lane at the lower edge of the scene.
    const soupW=w*(layout===PORTRAIT?.34:.29),soupH=soupW*.52;
    const cx=game.x*w,cy=h*(layout===PORTRAIT?.83:.77);
    g.fillStyle='#ffffff30';g.beginPath();g.ellipse(cx,cy+soupH*.32,soupW*.52,soupH*.21,0,0,Math.PI*2);g.fill();
    const img=images.soup;
    if(img?.complete&&img.naturalWidth)g.drawImage(img,cx-soupW/2,cy-soupH*.34,soupW,soupH);
    for(const d of game.drops){
      g.save();g.translate(d.x,d.y);g.rotate(d.rotation);
      if(d.type==='bomb'||d.type==='heart'){
        g.font=`${d.size*.83}px serif`;g.textAlign='center';g.textBaseline='middle';
        g.fillText(d.type==='bomb'?'💣':'💗',0,0);
      }else{
        const food=images[d.key];
        if(food?.complete&&food.naturalWidth){
          const ratio=food.naturalWidth/food.naturalHeight;
          const dw=d.size*(ratio>1?1.1:.94),dh=dw/ratio;
          if(d.type==='bad')g.filter='brightness(.5) saturate(.55)';
          g.drawImage(food,-dw/2,-dh/2,dw,dh);
        }
      }
      g.restore();
    }
    g.restore();
  }

  function gameOver(){
    if(finished)return;
    playing=false;finished=true;paused=false;
    $('pauseOverlay').classList.add('hidden');
    $('rankingOverlay').classList.remove('hidden');
    if(!game.rankingSaved){
      game.rankingSaved=true;
      const entry={id:Date.now()+'-'+Math.random().toString(36).slice(2,6),score,
        date:new Date().toLocaleDateString('zh-CN'),mode:game.stage===3?'无限模式':'第二关'};
      let ranks=[];
      try {ranks=JSON.parse(localStorage.getItem('scb_ranking_v1')||'[]');}catch(e){}
      ranks.push(entry);ranks.sort((a,b)=>b.score-a.score);
      ranks=ranks.slice(0,10);
      try {localStorage.setItem('scb_ranking_v1',JSON.stringify(ranks));}catch(e){}
      $('rankSummary').textContent=`最终积分：${score.toLocaleString()} · ${game.stage===3?'无限模式':'第二关'} · 本机历史前10名`;
      const list=$('rankingList');list.replaceChildren();
      ranks.forEach((r,i)=>{
        const li=document.createElement('li');if(r.id===entry.id)li.className='current';
        const left=document.createElement('span');left.textContent=`${i+1}. ${r.id===entry.id?'本次挑战':r.mode}`;
        const right=document.createElement('span');right.textContent=`${Number(r.score).toLocaleString()} 分`;
        li.append(left,right);list.appendChild(li);
      });
    }
  }

  // Keyboard fallback, useful when webcam permissions are unavailable.
  window.addEventListener('keydown',e=>{
    if(game.stage<2)return;
    if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a'){game.keyboard=-1;e.preventDefault();}
    if(e.key==='ArrowRight'||e.key.toLowerCase()==='d'){game.keyboard=1;e.preventDefault();}
  });
  window.addEventListener('keyup',e=>{
    if(['ArrowLeft','ArrowRight','a','d','A','D'].includes(e.key))game.keyboard=0;
  });
  let dragging=false;
  document.addEventListener('pointerdown',e=>{
    if(game.stage<2||!playing||paused||e.target.closest('button'))return;
    dragging=true;
  });
  document.addEventListener('pointermove',e=>{
    if(!dragging||game.stage<2||!playing||paused||mode==='camera')return;
    game.x=keep(e.clientX/window.innerWidth,.16,.84);
  });
  document.addEventListener('pointerup',()=>dragging=false);
  document.addEventListener('pointercancel',()=>dragging=false);
  $('enterLevel2').addEventListener('click',enterLevel2);
  $('rankRestart').addEventListener('click',()=>startGame(mode));
  return {...game,reset,winLevelOne,enterLevel2,initHolistic,update,draw,gameOver,
    get stage(){return game.stage;}};
})();
