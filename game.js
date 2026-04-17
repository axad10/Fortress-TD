// ═══════════════════════════════════════════════
//  FORTRESS — Tower Defense Game Engine
// ═══════════════════════════════════════════════

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// ── PATH WAYPOINTS (pixel coords) ──
const PATH = [
  {x:0,   y:80},  {x:120, y:80},  {x:120, y:200},
  {x:280, y:200}, {x:280, y:100}, {x:420, y:100},
  {x:420, y:320}, {x:200, y:320}, {x:200, y:420},
  {x:560, y:420}, {x:560, y:260}, {x:700, y:260}
];

// ── TOWER DEFINITIONS ──
const TOWER_DEF = {
  cannon: {
    name:'Cannon', cost:50, color:'#888888', borderColor:'#cccccc',
    levels:[
      {damage:20, range:900,  rate:60,  upgCost:60,  sellVal:25},
      {damage:35, range:1000, rate:50,  upgCost:90,  sellVal:55},
      {damage:55, range:1100, rate:40,  upgCost:null, sellVal:100}
    ]
  },
  sniper: {
    name:'Sniper', cost:100, color:'#2255aa', borderColor:'#4488ff',
    levels:[
      {damage:60, range:300, rate:120, upgCost:100, sellVal:50},
      {damage:100,range:400, rate:100, upgCost:140, sellVal:100},
      {damage:160,range:500, rate:80,  upgCost:null, sellVal:170}
    ]
  },
  splash: {
    name:'Splash', cost:150, color:'#cc4400', borderColor:'#ff8833',
    levels:[
      {damage:35, range:110, rate:90,  upgCost:120, sellVal:75,  splash:50},
      {damage:55, range:120, rate:75,  upgCost:160, sellVal:135, splash:65},
      {damage:80, range:130, rate:60,  upgCost:null, sellVal:235, splash:80}
    ]
  }
};

// ── ENEMY DEFINITIONS ──
const ENEMY_TYPES = {
  basic:  {hp:80,   speed:1.2, reward:10, color:'#ff4444', size:8,  label:''},
  fast:   {hp:50,   speed:2.2, reward:15, color:'#ffaa00', size:7,  label:''},
  tank:   {hp:250,  speed:0.7, reward:25, color:'#4488ff', size:12, label:''},
  boss:   {hp:600,  speed:0.8, reward:80, color:'#ff00ff', size:16, label:'BOSS'},
  swarm:  {hp:30,   speed:1.8, reward:8,  color:'#44ff88', size:6,  label:''}
};

// ── WAVE CONFIGS ──
function buildWave(n) {
  const waves = [];
  const add = (type, count, delay=300) => { for(let i=0;i<count;i++) waves.push({type, delay: i*delay}); };
  if(n===1)  { add('basic',8); }
  else if(n===2) { add('basic',8); add('fast',4,400); }
  else if(n===3) { add('fast',6,350); add('tank',2,800); }
  else if(n===4) { add('basic',10,250); add('fast',5,350); }
  else if(n===5) { add('tank',3,700); waves.push({type:'boss',delay:3000}); }
  else if(n===6) { add('swarm',14,180); add('fast',6,350); }
  else if(n===7) { add('basic',8,250); add('tank',4,700); add('fast',4,350); }
  else if(n===8) { add('swarm',20,150); add('tank',3,600); }
  else if(n===9) { add('fast',10,300); add('tank',5,600); add('boss',1,4000); }
  else {
    // Procedural: scales with wave number
    const base = Math.floor(n * 1.5);
    add('basic', base, 250);
    add('fast', Math.floor(base*0.6), 300);
    add('tank', Math.floor(base*0.3), 700);
    if(n%5===0) waves.push({type:'boss', delay:5000});
    if(n>10) add('swarm', Math.floor(base*0.8), 150);
  }
  return waves;
}

// ── GAME STATE ──
let state = {};

function initState() {
  state = {
    towers: [], enemies: [], bullets: [], particles: [],
    gold: 150, lives: 20, score: 0,
    wave: 0, waveActive: false, waveQueue: [], waveTimer: 0,
    enemiesLeft: 0, enemiesSpawned: 0,
    selectedType: null, selectedTower: null,
    gameOver: false, running: false,
    frameCount: 0
  };
}

// ── SCREENS ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showMenu()        { showScreen('menu-screen'); }
function showHelp()        { showScreen('help-screen'); }
function showGameOver()    { showScreen('gameover-screen'); document.getElementById('go-wave').textContent=state.wave; document.getElementById('go-score').textContent=state.score; }

function showLeaderboard() {
  showScreen('leaderboard-screen');
  fetch('/scores').then(r=>r.json()).then(scores => {
    const list = document.getElementById('lb-list');
    if(!scores.length) { list.innerHTML='<div class="lb-loading">No scores yet. Be the first!</div>'; return; }
    list.innerHTML = scores.map((s,i)=>`
      <div class="lb-row">
        <div class="lb-rank ${i<3?'top':''}">${['①','②','③'][i]||i+1}</div>
        <div class="lb-name">${s.name}</div>
        <div class="lb-wave">W${s.wave}</div>
        <div class="lb-score">${s.score.toLocaleString()}</div>
      </div>`).join('');
  }).catch(()=>{ document.getElementById('lb-list').innerHTML='<div class="lb-loading">Could not load scores.</div>'; });
}

function startGame() {
  initState();
  showScreen('game-screen');
  updateHUD();
  state.running = true;
  requestAnimationFrame(gameLoop);
}

// ── WAVE MANAGEMENT ──
function startWave() {
  if(state.waveActive || state.gameOver) return;
  state.wave++;
  state.waveActive = true;
  state.waveQueue = buildWave(state.wave);
  state.enemiesLeft = state.waveQueue.length;
  state.enemiesSpawned = 0;
  state.waveTimer = 0;
  document.getElementById('btn-wave').disabled = true;
  document.getElementById('hud-wave').textContent = state.wave;
  updateWaveInfo();
}

function updateWaveInfo() {
  const types = {};
  state.waveQueue.forEach(e => types[e.type] = (types[e.type]||0)+1);
  const desc = Object.entries(types).map(([t,c])=>`${c}x ${t}`).join(', ');
  document.getElementById('wave-info').innerHTML = state.waveActive
    ? `<span style="color:#ff6b35">Wave ${state.wave} in progress</span><br>${desc}`
    : `Wave ${state.wave+1} preview:<br>${buildWavePreview(state.wave+1)}`;
}

function buildWavePreview(n) {
  const q = buildWave(n);
  const types = {};
  q.forEach(e => types[e.type] = (types[e.type]||0)+1);
  return Object.entries(types).map(([t,c])=>`${c}x ${t}`).join(', ');
}

// ── ENEMY SPAWNING ──
function spawnEnemies() {
  if(!state.waveActive) return;
  state.waveTimer++;
  const toSpawn = state.waveQueue.filter((e,i) => i >= state.enemiesSpawned && e.delay <= state.waveTimer*16);
  toSpawn.forEach(() => {
    const def = state.waveQueue[state.enemiesSpawned];
    if(def) { spawnEnemy(def.type); state.enemiesSpawned++; }
  });
}

function spawnEnemy(type) {
  const def = ENEMY_TYPES[type];
  state.enemies.push({
    type, x:PATH[0].x, y:PATH[0].y,
    hp:def.hp, maxHp:def.hp, speed:def.speed,
    reward:def.reward, color:def.color, size:def.size,
    pathIdx:0, dist:0, id:Math.random(), slowed:0
  });
}

// ── ENEMY MOVEMENT ──
function moveEnemies() {
  for(let i = state.enemies.length-1; i>=0; i--) {
    const e = state.enemies[i];
    const spd = e.slowed > 0 ? e.speed*0.5 : e.speed;
    if(e.slowed > 0) e.slowed--;
    if(e.pathIdx >= PATH.length-1) {
      // reached end
      state.lives -= 1;
      state.enemies.splice(i,1);
      state.enemiesLeft--;
      shakeHUD('lives');
      updateHUD();
      checkGameOver();
      continue;
    }
    const target = PATH[e.pathIdx+1];
    const dx = target.x - e.x, dy = target.y - e.y;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if(dist < spd) { e.pathIdx++; e.x=target.x; e.y=target.y; }
    else { e.x += (dx/dist)*spd; e.y += (dy/dist)*spd; }
  }
}

// ── TOWER SHOOTING ──
function towerShoot() {
  state.towers.forEach(tower => {
    tower.cooldown = (tower.cooldown||0) - 1;
    if(tower.cooldown > 0) return;
    const def = TOWER_DEF[tower.type].levels[tower.level];
    // find first enemy in range that is furthest along path
    let target = null, bestDist = -1;
    state.enemies.forEach(e => {
      const dx=e.x-tower.x, dy=e.y-tower.y;
      const d = Math.sqrt(dx*dx+dy*dy);
      if(d <= def.range) {
        const pathProgress = e.pathIdx + (e.dist||0);
        if(pathProgress > bestDist) { bestDist=pathProgress; target=e; }
      }
    });
    if(!target) return;
    tower.cooldown = def.rate;
    tower.shootAnim = 8; // flash frames
    if(tower.type === 'splash') {
      // AoE: damage all in splash radius
      state.enemies.forEach(e => {
        const dx=e.x-target.x, dy=e.y-target.y;
        if(Math.sqrt(dx*dx+dy*dy) <= def.splash) {
          e.hp -= def.damage; e.slowed=60;
          if(e.hp<=0) killEnemy(e);
        }
      });
      state.enemies = state.enemies.filter(e=>e.hp>0);
      spawnParticles(target.x, target.y, '#ff8833', 12);
      addBullet(tower, target, '#ff8833', true);
    } else {
      addBullet(tower, target, tower.type==='sniper'?'#4488ff':'#ffffff', false);
    }
  });
}

function addBullet(tower, target, color, isSplash) {
  state.bullets.push({
    x:tower.x, y:tower.y, tx:target.x, ty:target.y,
    targetId: target.id, color, isSplash,
    damage: TOWER_DEF[tower.type].levels[tower.level].damage,
    speed:12, towerType:tower.type
  });
}

function moveBullets() {
  for(let i=state.bullets.length-1; i>=0; i--) {
    const b = state.bullets[i];
    const dx=b.tx-b.x, dy=b.ty-b.y, dist=Math.sqrt(dx*dx+dy*dy);
    if(dist < b.speed) {
      // hit
      if(!b.isSplash) {
        const target = state.enemies.find(e=>e.id===b.targetId);
        if(target) {
          target.hp -= b.damage;
          spawnParticles(target.x, target.y, b.color, 5);
          if(target.hp<=0) { killEnemy(target); state.enemies=state.enemies.filter(e=>e.hp>0); }
        }
      }
      state.bullets.splice(i,1);
    } else {
      b.x += (dx/dist)*b.speed; b.y += (dy/dist)*b.speed;
      // track moving target
      const target = state.enemies.find(e=>e.id===b.targetId);
      if(target) { b.tx=target.x; b.ty=target.y; }
    }
  }
}

function killEnemy(e) {
  state.gold += e.reward;
  state.score += e.reward * state.wave;
  state.enemiesLeft--;
  spawnParticles(e.x, e.y, e.color, 15);
  updateHUD();
  checkWaveClear();
}

// ── PARTICLES ──
function spawnParticles(x, y, color, count) {
  for(let i=0;i<count;i++) {
    const angle = Math.random()*Math.PI*2;
    const speed = Math.random()*3+1;
    state.particles.push({
      x, y, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed,
      color, life:Math.random()*20+15, maxLife:35
    });
  }
}

function updateParticles() {
  for(let i=state.particles.length-1;i>=0;i--) {
    const p = state.particles[i];
    p.x+=p.vx; p.y+=p.vy; p.vy+=0.1; p.life--;
    if(p.life<=0) state.particles.splice(i,1);
  }
}

// ── WAVE CLEAR ──
function checkWaveClear() {
  if(!state.waveActive) return;
  if(state.enemiesLeft <= 0 && state.enemiesSpawned >= state.waveQueue.length) {
    state.waveActive = false;
    const bonus = 50 + state.wave * 20;
    state.gold += bonus;
    state.score += bonus * 2;
    updateHUD();
    showWaveClear(bonus);
    document.getElementById('btn-wave').disabled = false;
    updateWaveInfo();
  }
}

function showWaveClear(bonus) {
  const el = document.getElementById('wave-clear');
  document.getElementById('wc-bonus').textContent = `+${bonus} bonus gold`;
  el.classList.remove('hidden');
  setTimeout(()=>el.classList.add('hidden'), 2500);
}

// ── GAME OVER ──
function checkGameOver() {
  if(state.lives <= 0) {
    state.lives = 0; state.gameOver = true; state.running = false;
    setTimeout(showGameOver, 800);
  }
}

// ── PLACE TOWERS ──
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // check if clicked existing tower
  const clicked = state.towers.find(t => Math.hypot(t.x-mx, t.y-my) < 22);
  if(clicked && !state.selectedType) { openTowerPanel(clicked); return; }
  if(state.selectedType) { tryPlaceTower(mx, my); }
  else { closeTowerPanel(); }
});

function tryPlaceTower(x, y) {
  const def = TOWER_DEF[state.selectedType];
  if(state.gold < def.cost) { flashGold(); return; }
  // check not on path
  if(isOnPath(x,y)) return;
  // check not overlapping another tower
  if(state.towers.find(t=>Math.hypot(t.x-x,t.y-y)<36)) return;
  // check within canvas
  if(x<20||x>W-20||y<20||y>H-20) return;

  state.towers.push({ type:state.selectedType, x, y, level:0, cooldown:0, shootAnim:0 });
  state.gold -= def.cost;
  updateHUD();
  updateTowerCards();
}

function isOnPath(x, y) {
  for(let i=0;i<PATH.length-1;i++) {
    const ax=PATH[i].x, ay=PATH[i].y, bx=PATH[i+1].x, by=PATH[i+1].y;
    const len2 = (bx-ax)**2+(by-ay)**2;
    let t = ((x-ax)*(bx-ax)+(y-ay)*(by-ay))/len2;
    t = Math.max(0,Math.min(1,t));
    const nx=ax+t*(bx-ax), ny=ay+t*(by-ay);
    if(Math.hypot(x-nx,y-ny)<26) return true;
  }
  return false;
}

// ── TOWER SELECTION ──
function selectTower(type) {
  state.selectedType = type;
  state.selectedTower = null;
  closeTowerPanel();
  document.querySelectorAll('.tower-card').forEach(c=>c.classList.remove('selected'));
  document.getElementById('card-'+type).classList.add('selected');
  document.getElementById('selected-info').textContent = `Placing ${TOWER_DEF[type].name} (${TOWER_DEF[type].cost}g). Click on the map.`;
  document.getElementById('btn-cancel').classList.remove('hidden');
}

function cancelSelect() {
  state.selectedType = null;
  document.querySelectorAll('.tower-card').forEach(c=>c.classList.remove('selected'));
  document.getElementById('selected-info').textContent = 'Click a tower type above, then click on the map to place it.';
  document.getElementById('btn-cancel').classList.add('hidden');
}

// ── TOWER INFO PANEL ──
function openTowerPanel(tower) {
  state.selectedTower = tower;
  const def = TOWER_DEF[tower.type];
  const lvlDef = def.levels[tower.level];
  document.getElementById('tp-name').textContent = def.name + ' Tower';
  document.getElementById('tp-level').textContent = ['Level 1','Level 2','Level 3 (MAX)'][tower.level];
  document.getElementById('tp-stats').innerHTML =
    `Damage: ${lvlDef.damage}<br>Range: ${lvlDef.range}<br>${tower.type==='splash'?'Splash: '+lvlDef.splash+'<br>':''}Fire rate: ${Math.round(60/lvlDef.rate*10)/10}/s`;
  const upgBtn = document.getElementById('btn-upgrade');
  const sellBtn = document.getElementById('btn-sell');
  if(tower.level < 2) {
    upgBtn.textContent = `UPGRADE (${def.levels[tower.level].upgCost}g)`;
    upgBtn.disabled = state.gold < def.levels[tower.level].upgCost;
  } else {
    upgBtn.textContent = 'MAX LEVEL';
    upgBtn.disabled = true;
  }
  sellBtn.textContent = `SELL (+${lvlDef.sellVal}g)`;
  document.getElementById('tower-panel').classList.remove('hidden');
}

function closeTowerPanel() {
  state.selectedTower = null;
  document.getElementById('tower-panel').classList.add('hidden');
}

function upgradeTower() {
  const t = state.selectedTower;
  if(!t || t.level>=2) return;
  const cost = TOWER_DEF[t.type].levels[t.level].upgCost;
  if(state.gold < cost) { flashGold(); return; }
  state.gold -= cost;
  t.level++;
  updateHUD();
  openTowerPanel(t);
}

function sellTower() {
  const t = state.selectedTower;
  if(!t) return;
  state.gold += TOWER_DEF[t.type].levels[t.level].sellVal;
  state.towers = state.towers.filter(x=>x!==t);
  closeTowerPanel();
  updateHUD();
}

// ── HUD ──
function updateHUD() {
  document.getElementById('hud-gold').textContent  = state.gold;
  document.getElementById('hud-lives').textContent = Math.max(0,state.lives);
  document.getElementById('hud-score').textContent = state.score.toLocaleString();
  updateTowerCards();
}

function updateTowerCards() {
  Object.keys(TOWER_DEF).forEach(type => {
    const card = document.getElementById('card-'+type);
    if(state.gold < TOWER_DEF[type].cost) card.classList.add('disabled');
    else card.classList.remove('disabled');
  });
}

function shakeHUD(id) {
  const el = document.getElementById('hud-'+id);
  el.style.transform='scale(1.3)'; el.style.color='#ff3355';
  setTimeout(()=>{el.style.transform='';el.style.color='';},300);
}

function flashGold() {
  const el = document.getElementById('hud-gold');
  el.style.color='#ff3355';
  setTimeout(()=>el.style.color='',400);
}

// ── SCORE SUBMIT ──
function submitScore() {
  const name = document.getElementById('go-name').value.trim() || 'Player';
  fetch('/scores', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name, score:state.score, wave:state.wave})
  }).then(()=>showLeaderboard()).catch(()=>showLeaderboard());
}

// ── DRAW ──
function drawPath() {
  ctx.strokeStyle = 'rgba(200,80,80,0.25)';
  ctx.lineWidth = 36;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(PATH[0].x, PATH[0].y);
  PATH.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.stroke();
  // path border
  ctx.strokeStyle = 'rgba(200,80,80,0.12)';
  ctx.lineWidth = 40;
  ctx.stroke();
  // path center line
  ctx.strokeStyle = 'rgba(255,100,100,0.15)';
  ctx.lineWidth = 2; ctx.setLineDash([8,12]);
  ctx.beginPath();
  ctx.moveTo(PATH[0].x, PATH[0].y);
  PATH.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGrid() {
  ctx.strokeStyle = 'rgba(30,58,95,0.25)';
  ctx.lineWidth = 0.5;
  for(let x=0;x<W;x+=40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for(let y=0;y<H;y+=40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
}

function drawBase() {
  const bx=680, by=240;
  ctx.fillStyle='rgba(0,212,255,0.1)';
  ctx.strokeStyle='#00d4ff';
  ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(bx,by,24,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#00d4ff';
  ctx.font='bold 10px Orbitron, monospace';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('BASE',bx,by);
}

function drawTowers() {
  state.towers.forEach(t => {
    const def = TOWER_DEF[t.type];
    const lvlColors = ['#ffffff','#ffdd00','#ff6600'];
    const glow = t.shootAnim > 0 ? 0.8 : 0.2;
    if(t.shootAnim>0) t.shootAnim--;

    // range ring (faint)
    if(t === state.selectedTower || state.selectedType) {
      if(t === state.selectedTower) {
        ctx.strokeStyle = 'rgba(0,212,255,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4,4]);
        ctx.beginPath(); ctx.arc(t.x,t.y,TOWER_DEF[t.type].levels[t.level].range,0,Math.PI*2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // glow
    ctx.shadowColor = def.borderColor;
    ctx.shadowBlur = t.shootAnim>0 ? 20 : 6;

    // tower body
    ctx.fillStyle = def.color;
    ctx.strokeStyle = lvlColors[t.level];
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x,t.y,14,0,Math.PI*2); ctx.fill(); ctx.stroke();

    // level pips
    for(let i=0;i<=t.level;i++) {
      const angle = (i/(t.level+1))*Math.PI*2 - Math.PI/2;
      ctx.fillStyle = lvlColors[t.level];
      ctx.beginPath(); ctx.arc(t.x+Math.cos(angle)*9, t.y+Math.sin(angle)*9, 2.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur=0;
  });
}

function drawTowerPlacementPreview() {
  if(!state.selectedType) return;
  canvas.addEventListener('mousemove', handleMouseMove);
}

let mouseX=0, mouseY=0;
canvas.addEventListener('mousemove', e => {
  const r=canvas.getBoundingClientRect();
  mouseX=e.clientX-r.left; mouseY=e.clientY-r.top;
});

function drawPlacementPreview() {
  if(!state.selectedType) return;
  const def = TOWER_DEF[state.selectedType];
  const onPath = isOnPath(mouseX,mouseY);
  const overlap = state.towers.find(t=>Math.hypot(t.x-mouseX,t.y-mouseY)<36);
  const valid = !onPath && !overlap;
  ctx.globalAlpha=0.5;
  ctx.fillStyle = valid?def.color:'#ff3355';
  ctx.strokeStyle = valid?def.borderColor:'#ff0000';
  ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(mouseX,mouseY,14,0,Math.PI*2); ctx.fill(); ctx.stroke();
  // range preview
  ctx.strokeStyle = valid?'rgba(0,212,255,0.3)':'rgba(255,0,0,0.2)';
  ctx.lineWidth=1; ctx.setLineDash([4,4]);
  ctx.beginPath(); ctx.arc(mouseX,mouseY,def.levels[0].range,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha=1;
}

function drawEnemies() {
  state.enemies.forEach(e => {
    const pct = e.hp/e.maxHp;
    // shadow
    ctx.shadowColor=e.color; ctx.shadowBlur=8;
    ctx.fillStyle = e.slowed>0 ? '#aaddff' : e.color;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.size,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    // health bar
    const bw=e.size*2+6, bh=4, bx=e.x-bw/2, by=e.y-e.size-8;
    ctx.fillStyle='#222'; ctx.fillRect(bx,by,bw,bh);
    ctx.fillStyle=pct>0.5?'#00ff88':pct>0.25?'#ffaa00':'#ff3355';
    ctx.fillRect(bx,by,bw*pct,bh);
    // boss label
    if(e.type==='boss') {
      ctx.fillStyle='#ff00ff'; ctx.font='bold 9px Orbitron, monospace';
      ctx.textAlign='center'; ctx.fillText('BOSS',e.x,e.y-e.size-14);
    }
  });
}

function drawBullets() {
  state.bullets.forEach(b => {
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(b.x,b.y, b.towerType==='sniper'?3:2, 0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
  });
}

function drawParticles() {
  state.particles.forEach(p => {
    ctx.globalAlpha = p.life/p.maxLife;
    ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha=1;
}

function drawSpawnPoint() {
  const t = state.frameCount/30;
  ctx.strokeStyle=`rgba(255,68,68,${0.5+0.3*Math.sin(t)})`;
  ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(PATH[0].x,PATH[0].y,16,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle='#ff4444'; ctx.font='bold 9px Orbitron,monospace';
  ctx.textAlign='center'; ctx.fillText('SPAWN',PATH[0].x,PATH[0].y-22);
}

// ── GAME LOOP ──
function gameLoop() {
  if(!state.running) return;
  state.frameCount++;

  // clear
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle='#0a1628'; ctx.fillRect(0,0,W,H);

  drawGrid();
  drawPath();
  drawSpawnPoint();
  drawBase();
  drawTowers();
  drawPlacementPreview();
  drawBullets();
  drawEnemies();
  drawParticles();

  spawnEnemies();
  moveEnemies();
  towerShoot();
  moveBullets();
  updateParticles();

  requestAnimationFrame(gameLoop);
}

// ── INIT ──
updateWaveInfo && updateWaveInfo();
