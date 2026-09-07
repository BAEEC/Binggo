const SOURCE_QUESTIONS = window.GAME_QUESTIONS || [];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let teamName = '';
let roomCode = '';
let sessionId = '';
let hp = 100;
let qIndex = 0;
let timerId = null;
let timeLeft = 30;
let answered = false;
let finished = false;
let history = [];
let gameQuestions = [];
let soundEnabled = true;

const screens = { join: $('#joinScreen'), game: $('#gameScreen'), result: $('#resultScreen') };

const Sound = {
  ctx: null,
  init(){
    if(!soundEnabled) return;
    if(!this.ctx){
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(Ctx) this.ctx = new Ctx();
    }
    if(this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freq, duration=.12, type='sine', volume=.035, delay=0){
    if(!soundEnabled) return;
    this.init();
    if(!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + .015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + duration + .03);
  },
  tap(){ this.tone(420,.07,'sine',.025); },
  good(){ [523,659,784].forEach((f,i)=>this.tone(f,.13,'sine',.04,i*.08)); },
  mid(){ this.tone(440,.12,'triangle',.035); this.tone(330,.18,'triangle',.035,.10); },
  bad(){ this.tone(190,.16,'sawtooth',.035); this.tone(125,.28,'sawtooth',.04,.11); },
  tick(){ this.tone(880,.055,'square',.018); },
  win(){ [523,659,784,1046].forEach((f,i)=>this.tone(f,.18,'sine',.045,i*.10)); },
  bankrupt(){ [220,175,130,95].forEach((f,i)=>this.tone(f,.22,'sawtooth',.04,i*.12)); }
};

function show(name){
  Object.values(screens).forEach(x => x.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
}

function cleanCode(v){ return v.trim().toUpperCase().replace(/\s+/g,''); }
function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function hashString(str){
  let h=2166136261;
  for(let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h,16777619); }
  return (h>>>0).toString(36);
}
function makeSessionId(){ return `${roomCode}-${hashString(teamName.trim().toLowerCase())}`; }

async function saveSnapshot(status='playing'){
  if(!window.SyncService) return;
  const payload={
    sessionId, roomCode, teamName, hp, status,
    questionIndex: history.length,
    totalQuestions: gameQuestions.length,
    completed: status==='survived' || status==='bankrupt',
    history
  };
  try{ await window.SyncService.saveTeam(payload); updateSyncBadge(); }catch(e){ updateSyncBadge(true); }
}

function updateSyncBadge(hasError=false){
  const el=$('#syncBadge');
  if(!window.SyncService){ el.textContent='● ยังไม่เชื่อมหลังบ้าน'; el.className='sync-badge offline'; return; }
  const mode=window.SyncService.mode();
  if(hasError){ el.textContent='● เชื่อมหลังบ้านไม่สำเร็จ'; el.className='sync-badge offline'; }
  else if(mode==='remote'){ el.textContent='● ห้องออนไลน์ · ผู้สอนเห็นคะแนนได้'; el.className='sync-badge online'; }
  else{ el.textContent='● โหมดทดสอบในเครื่อง'; el.className='sync-badge local'; }
}

function joinGame(e){
  e.preventDefault();
  const name=$('#teamName').value.trim();
  const code=cleanCode($('#roomCode').value);
  if(!name || !code) return;
  Sound.init(); Sound.tap();
  teamName=name; roomCode=code; sessionId=makeSessionId();
  hp=100; qIndex=0; history=[]; answered=false; finished=false;
  gameQuestions=shuffle(SOURCE_QUESTIONS.map((q,i)=>({...q,sourceIndex:i}))).slice(0,Math.min(20,SOURCE_QUESTIONS.length));
  $('#teamDisplay').textContent=teamName;
  $('#roomDisplay').textContent=roomCode;
  $('#teacherResultLink').href=`teacher.html?room=${encodeURIComponent(roomCode)}`;
  updateSyncBadge();
  show('game');
  saveSnapshot('playing');
  renderQuestion();
}

function renderQuestion(){
  clearTimer(); answered=false; timeLeft=30;
  const q=gameQuestions[qIndex];
  $('#roundPill').textContent=`EVENT ${String(qIndex+1).padStart(2,'0')} / ${gameQuestions.length}`;
  $('#questionState').textContent='SAFE'; $('#questionState').className='state-pill';
  $('#eventIcon').textContent=q.icon; $('#questionTitle').textContent=q.title; $('#questionDesc').textContent=q.desc;
  $('#timerText').textContent='30'; $('#timerBar').style.width='100%'; $('#timerBar').className='timer-bar';
  $('#resultBox').className='result-box';
  $('#nextBtn').classList.add('hidden'); $('#nextBtn').textContent=qIndex===gameQuestions.length-1?'ดูผลสรุป →':'ข้อต่อไป →';
  $('#statusNote').textContent='คุยกับสมาชิกในทีม แล้วเลือก 1 คำตอบ';

  const box=$('#options'); box.innerHTML='';
  ['A','B','C','D'].forEach((letter,i)=>{
    const b=document.createElement('button'); b.type='button'; b.className='option';
    b.innerHTML=`<span class="letter">${letter}</span><span>${q.options[i].text}</span>`;
    b.addEventListener('click',()=>choose(i,b)); box.appendChild(b);
  });
  updateHp(); startTimer();
}

function choose(index, btn){
  if(answered || finished) return;
  answered=true; clearTimer(); Sound.tap();
  const q=gameQuestions[qIndex]; const opt=q.options[index];
  $$('.option').forEach((el,i)=>{ el.disabled=true; if(i===index) el.classList.add('selected'); else el.classList.add('dimmed'); });
  applyResult(opt,false,index);
}

function timeoutAnswer(){
  if(answered || finished) return;
  answered=true; clearTimer();
  $$('.option').forEach(el=>{el.disabled=true;el.classList.add('dimmed')});
  applyResult({damage:20,feedback:'หมดเวลา! ทีมยังไม่ได้เลือกคำตอบภายใน 30 วินาที'},true,-1);
}

function applyResult(opt,timedOut,selectedIndex){
  const q=gameQuestions[qIndex];
  const damage=Math.max(0,opt.damage||0);
  hp=Math.max(0,hp-damage);

  let cls='good',icon='🟢',kicker='NICE MOVE!',title='รอดต่อไป',dmg='0 DAMAGE';
  if(damage===10){cls='mid';icon='🟠';kicker='OUCH!';title='โดนไปนิดนึง';dmg='-10 HP';}
  if(damage>=20){cls='bad';icon=timedOut?'⏰':'🔴';kicker=timedOut?'TIME OUT!':'CRITICAL HIT!';title=timedOut?'หมดเวลา':'ธุรกิจเจ็บหนัก';dmg='-20 HP';}

  history.push({
    playOrder:qIndex+1,
    questionNo:q.sourceIndex+1,
    title:q.title,
    answer:selectedIndex<0?'หมดเวลา':`${['A','B','C','D'][selectedIndex]} — ${q.options[selectedIndex].text}`,
    damage,
    feedback:opt.feedback,
    hpAfter:hp,
    timedOut
  });

  $('#resultIcon').textContent=icon; $('#resultKicker').textContent=kicker; $('#resultTitle').textContent=title;
  $('#resultFeedback').textContent=opt.feedback; $('#damageBadge').textContent=dmg; $('#resultBox').className=`result-box show ${cls}`;
  $('#questionState').textContent=damage===0?'SAFE':damage===10?'HIT -10':'HIT -20'; $('#questionState').className=`state-pill ${cls}`;
  $('#statusNote').textContent='อ่านเหตุผล แล้วไปข้อต่อไป';
  updateHp();

  if(damage===0) Sound.good(); else if(damage===10) Sound.mid(); else Sound.bad();

  if(hp<=0){
    finished=true; clearTimer();
    $('#nextBtn').classList.add('hidden');
    $('#hpStatus').textContent='BUSINESS FAILED ☠️'; $('#hpStatus').className='failed-text';
    saveSnapshot('bankrupt');
    setTimeout(()=>{ Sound.bankrupt(); $('#bankruptModal').classList.add('open'); },650);
    return;
  }

  $('#nextBtn').classList.remove('hidden');
  saveSnapshot('playing');
}

function updateHp(){
  $('#hpText').textContent=`${hp} HP`; $('#hpFill').style.width=`${hp}%`;
  $('#hpFill').className='hpfill'+(hp<=30?' danger':hp<=60?' warning':'');
  if(hp>0){
    $('#hpStatus').textContent=hp<=30?'DANGER ZONE':hp<=60?'BUSINESS AT RISK':'BUSINESS ACTIVE';
    $('#hpStatus').className='';
  }
}

function nextQuestion(){
  if(finished) return;
  if(qIndex>=gameQuestions.length-1){ finishGame('survived'); return; }
  qIndex++; renderQuestion();
}

function renderHistory(){
  const box=$('#historyList');
  if(!history.length){ box.innerHTML='<p class="empty">ยังไม่มีประวัติการตอบ</p>'; return; }
  box.innerHTML=history.map((h,i)=>{
    const cls=h.damage===0?'good':h.damage===10?'mid':'bad';
    const label=h.damage===0?'0 DAMAGE':`-${h.damage} HP`;
    return `<article class="history-item ${cls}">
      <div class="history-num">${String(i+1).padStart(2,'0')}</div>
      <div class="history-main"><h3>${h.title}</h3><p><b>คำตอบ:</b> ${h.answer}</p><small>${h.feedback}</small></div>
      <div class="history-score"><strong>${label}</strong><span>เหลือ ${h.hpAfter} HP</span></div>
    </article>`;
  }).join('');
  $('#summaryTotal').textContent=`เสียทั้งหมด ${100-hp} HP`;
}

function finishGame(reason='survived'){
  finished=true; clearTimer();
  $('#bankruptModal').classList.remove('open');
  $('#finishTeam').textContent=teamName; $('#finishRoom').textContent=roomCode; $('#finishHp').textContent=hp;
  const bankrupt=reason==='bankrupt' || hp<=0;
  if(bankrupt){
    $('#finishIcon').textContent='☠️'; $('#finishKicker').textContent='BUSINESS FAILED';
    $('#finishTitle').textContent='ล้มละลาย — ธุรกิจของคุณไปไม่รอด'; $('#finishStatus').textContent=`จบที่สถานการณ์ ${history.length} / ${gameQuestions.length}`;
  }else{
    $('#finishIcon').textContent='🏆'; $('#finishKicker').textContent='GAME COMPLETE'; $('#finishTitle').textContent='รอดครบ 20 สถานการณ์!';
    let status='รอดแบบเฉียดฉิว 😵';
    if(hp>80) status='สุดยอดผู้บริหาร 🔥'; else if(hp>60) status='บริหารได้ดี 👍'; else if(hp>30) status='ยังอยู่ แต่เจ็บหนัก 😮‍💨';
    $('#finishStatus').textContent=status; Sound.win();
  }
  renderHistory(); show('result'); saveSnapshot(bankrupt?'bankrupt':'survived');
}

function startTimer(){
  clearTimer();
  timerId=setInterval(()=>{
    timeLeft--; $('#timerText').textContent=String(timeLeft);
    const pct=Math.max(0,(timeLeft/30)*100); $('#timerBar').style.width=`${pct}%`;
    if(timeLeft<=10) $('#timerBar').className='timer-bar danger'; else if(timeLeft<=20) $('#timerBar').className='timer-bar warning';
    if(timeLeft<=5 && timeLeft>0) Sound.tick();
    if(timeLeft<=0) timeoutAnswer();
  },1000);
}

function clearTimer(){ if(timerId){ clearInterval(timerId); timerId=null; } }

function resetGame(){
  if(screens.join.classList.contains('active')) return;
  if(confirm('ออกจากเกมและกลับหน้าเข้าห้อง?')){ clearTimer(); finished=true; show('join'); }
}

function fullscreen(){
  const el=document.documentElement;
  if(!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen();
  else if(document.exitFullscreen) document.exitFullscreen();
}

function toggleSound(){
  soundEnabled=!soundEnabled; $('#soundBtn').textContent=soundEnabled?'🔊 เสียง: เปิด':'🔇 เสียง: ปิด'; $('#soundBtn').setAttribute('aria-pressed',String(soundEnabled));
  if(soundEnabled){Sound.init();Sound.tap();}
}

$('#joinForm').addEventListener('submit',joinGame);
$('#nextBtn').addEventListener('click',nextQuestion);
$('#bankruptSummaryBtn').addEventListener('click',()=>finishGame('bankrupt'));
$('#playAgainBtn').addEventListener('click',()=>{ clearTimer(); finished=true; $('#bankruptModal').classList.remove('open'); show('join'); });
$('#resetBtn').addEventListener('click',resetGame);
$('#fullscreenBtn').addEventListener('click',fullscreen);
$('#soundBtn').addEventListener('click',toggleSound);
$('#rulesBtn').addEventListener('click',()=>$('#rulesModal').classList.add('open'));
$('#closeRulesBtn').addEventListener('click',()=>$('#rulesModal').classList.remove('open'));
updateSyncBadge();
