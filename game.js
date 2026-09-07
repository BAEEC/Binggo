const SOURCE_QUESTIONS = window.GAME_QUESTIONS || [];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let teamName = '';
let roomCode = '';
let sessionId = '';
let hp = 100;
let qIndex = 0;
let decisionTimerId = null;
let tickTimerId = null;
let overallTimerId = null;
let decisionTimeLeft = 10;
let overallSeconds = 20 * 60;
let answered = false;
let finished = false;
let gameCompletePending = false;
let history = [];
let gameQuestions = [];
let soundEnabled = true;
let phase = 'briefing';

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
    gain.gain.exponentialRampToValueAtTime(volume, t + .012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(t); osc.stop(t + duration + .03);
  },
  tap(){ this.tone(420,.07,'sine',.025); },
  good(){ [523,659,784].forEach((f,i)=>this.tone(f,.13,'sine',.04,i*.08)); },
  mid(){ this.tone(440,.12,'triangle',.035); this.tone(330,.18,'triangle',.035,.10); },
  bad(){ this.tone(190,.16,'sawtooth',.035); this.tone(125,.28,'sawtooth',.04,.11); },
  tick(intensity=0){
    const freq = 650 + Math.round(intensity * 560);
    const volume = .02 + intensity * .014;
    const duration = intensity>.7 ? .035 : .05;
    this.tone(freq,duration,'square',volume);
    if(intensity>.62) this.tone(freq+120,.03,'square',Math.max(.014,volume-.007),.065);
  },
  transition(){
    this.tone(520,.08,'triangle',.03);
    this.tone(720,.08,'triangle',.035,.09);
    this.tone(940,.11,'triangle',.04,.18);
  },
  timeup(){
    this.tone(330,.15,'triangle',.04);
    this.tone(260,.18,'triangle',.04,.12);
    this.tone(180,.32,'sawtooth',.035,.26);
  },
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
    completed: status==='survived' || status==='bankrupt' || status==='timeup',
    history,
    secondsRemaining: overallSeconds
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
  hp=100; qIndex=0; history=[]; answered=false; finished=false; gameCompletePending=false;
  overallSeconds=20*60;
  gameQuestions=shuffle(SOURCE_QUESTIONS.map((q,i)=>({...q,sourceIndex:i}))).slice(0,Math.min(20,SOURCE_QUESTIONS.length));

  $('#teamDisplay').textContent=teamName;
  $('#roomDisplay').textContent=roomCode;
  $('#teacherResultLink').href=`teacher.html?room=${encodeURIComponent(roomCode)}`;
  updateSyncBadge();
  updateOverallClock();

  show('game');
  saveSnapshot('playing');
  startOverallTimer();
  renderQuestion();
}

function renderQuestion(){
  clearDecisionTimer();
  answered=false;
  phase='briefing';
  const q=gameQuestions[qIndex];

  $('#roundPill').textContent=`EVENT ${String(qIndex+1).padStart(2,'0')} / ${gameQuestions.length}`;
  $('#questionState').textContent='TEAM DISCUSSION';
  $('#questionState').className='state-pill discussion';

  $('#briefQuestionTitle').textContent=q.title;
  $('#briefQuestionDesc').textContent=q.desc;
  $('#briefEventIcon').textContent=q.icon;
  $('#eventIcon').textContent=q.icon;
  $('#questionTitle').textContent=q.title;
  $('#questionDesc').textContent=q.desc;

  $('#resultBox').className='result-box';
  $('#nextBtn').classList.add('hidden');
  $('#nextBtn').textContent=qIndex===gameQuestions.length-1?'ดูผลสรุป →':'ข้อต่อไป →';
  $('#statusNote').textContent='เลือก 1 คำตอบก่อนหมดเวลา';

  const box=$('#options');
  box.innerHTML='';
  ['A','B','C','D'].forEach((letter,i)=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='option';
    b.innerHTML=`<span class="letter">${letter}</span><span>${q.options[i].text}</span>`;
    b.addEventListener('click',()=>choose(i,b));
    box.appendChild(b);
  });

  $('#briefingPhase').classList.add('active');
  $('#answerPhase').classList.remove('active','answer-phase-flash');
  updateHp();
  saveSnapshot('playing');
}

function startAnswerPhase(){
  if(finished || answered || phase!=='briefing') return;
  phase='answer';
  decisionTimeLeft=10;
  Sound.transition();

  $('#briefingPhase').classList.remove('active');
  $('#answerPhase').classList.add('active','answer-phase-flash');
  $('#questionState').textContent='DECISION TIME';
  $('#questionState').className='state-pill bad';
  $('#timerText').textContent='10';
  $('#timerBar').style.width='100%';
  $('#timerBar').className='timer-bar';
  $('#statusNote').textContent='10 วินาที! เลือกคำตอบของทีมตอนนี้';

  startDecisionTimer();
}

function startDecisionTimer(){
  clearDecisionTimer();
  scheduleTick();
  decisionTimerId=setInterval(()=>{
    decisionTimeLeft--;
    $('#timerText').textContent=String(decisionTimeLeft);
    $('#timerBar').style.width=`${Math.max(0,(decisionTimeLeft/10)*100)}%`;
    if(decisionTimeLeft<=3) $('#timerBar').className='timer-bar danger';
    else if(decisionTimeLeft<=6) $('#timerBar').className='timer-bar warning';
    if(decisionTimeLeft<=0) timeoutAnswer();
  },1000);
}

function scheduleTick(){
  if(tickTimerId){ clearTimeout(tickTimerId); tickTimerId=null; }
  if(!soundEnabled || answered || finished || phase!=='answer' || decisionTimeLeft<=0 || !screens.game.classList.contains('active')) return;

  let interval=720, intensity=.35;
  if(decisionTimeLeft<=7){interval=560;intensity=.48;}
  if(decisionTimeLeft<=5){interval=390;intensity=.68;}
  if(decisionTimeLeft<=3){interval=245;intensity=.86;}
  if(decisionTimeLeft<=1){interval=155;intensity=1;}
  Sound.tick(intensity);
  tickTimerId=setTimeout(scheduleTick,interval);
}

function choose(index, btn){
  if(answered || finished || phase!=='answer') return;
  answered=true;
  clearDecisionTimer();
  Sound.tap();

  const q=gameQuestions[qIndex];
  const opt=q.options[index];
  $$('.option').forEach((el,i)=>{
    el.disabled=true;
    if(i===index) el.classList.add('selected');
    else el.classList.add('dimmed');
  });
  applyResult(opt,false,index);
}

function timeoutAnswer(){
  if(answered || finished) return;
  answered=true;
  clearDecisionTimer();
  $$('.option').forEach(el=>{el.disabled=true;el.classList.add('dimmed');});
  applyResult({damage:20,feedback:'หมดเวลา! ทีมยังไม่ได้เลือกคำตอบภายใน 10 วินาที'},true,-1);
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

  $('#resultIcon').textContent=icon;
  $('#resultKicker').textContent=kicker;
  $('#resultTitle').textContent=title;
  $('#resultFeedback').textContent=opt.feedback;
  $('#damageBadge').textContent=dmg;
  $('#resultBox').className=`result-box show ${cls}`;
  $('#questionState').textContent=damage===0?'SAFE':damage===10?'HIT -10':'HIT -20';
  $('#questionState').className=`state-pill ${cls}`;
  $('#statusNote').textContent='อ่านเหตุผล แล้วไปข้อต่อไป';
  updateHp();

  if(damage===0) Sound.good(); else if(damage===10) Sound.mid(); else Sound.bad();

  if(hp<=0){
    finished=true;
    stopOverallTimer();
    $('#nextBtn').classList.add('hidden');
    $('#hpStatus').textContent='BUSINESS FAILED ☠️';
    $('#hpStatus').className='failed-text';
    saveSnapshot('bankrupt');
    setTimeout(()=>{ Sound.bankrupt(); $('#bankruptModal').classList.add('open'); },650);
    return;
  }

  if(qIndex===gameQuestions.length-1){
    gameCompletePending=true;
    stopOverallTimer();
    $('#statusNote').textContent='🏁 ผ่านครบ 20 สถานการณ์แล้ว!';
    $('#nextBtn').classList.remove('hidden');
    saveSnapshot('survived');
    return;
  }

  $('#nextBtn').classList.remove('hidden');
  saveSnapshot('playing');
}

function updateHp(){
  $('#hpText').textContent=`${hp} HP`;
  $('#hpFill').style.width=`${hp}%`;
  $('#hpFill').className='hpfill'+(hp<=30?' danger':hp<=60?' warning':'');
  if(hp>0){
    $('#hpStatus').textContent=hp<=30?'DANGER ZONE':hp<=60?'BUSINESS AT RISK':'BUSINESS ACTIVE';
    $('#hpStatus').className='';
  }
}

function formatTime(total){
  const sec=Math.max(0,Math.floor(total));
  const m=Math.floor(sec/60);
  const s=sec%60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function updateOverallClock(){
  $('#overallTimerText').textContent=formatTime(overallSeconds);
  const clock=$('#overallClock');
  clock.className='overall-clock';
  if(overallSeconds<=60) clock.classList.add('danger');
  else if(overallSeconds<=5*60) clock.classList.add('warning');

  const hint=$('#overallTimerHint');
  if(overallSeconds<=60) hint.textContent='เหลือน้อยกว่า 1 นาที!';
  else if(overallSeconds<=5*60) hint.textContent='เหลือน้อยกว่า 5 นาที จัดลำดับให้ดี';
  else hint.textContent='บริหารเวลาให้ผ่านครบ 20 สถานการณ์';
}

function startOverallTimer(){
  stopOverallTimer();
  updateOverallClock();
  overallTimerId=setInterval(()=>{
    if(finished || gameCompletePending){ stopOverallTimer(); return; }
    overallSeconds=Math.max(0,overallSeconds-1);
    updateOverallClock();
    if(overallSeconds%15===0) saveSnapshot('playing');
    if(overallSeconds<=0){
      stopOverallTimer();
      Sound.timeup();
      finishGame('timeup');
    }
  },1000);
}

function stopOverallTimer(){
  if(overallTimerId){ clearInterval(overallTimerId); overallTimerId=null; }
}

function nextQuestion(){
  if(finished) return;
  if(gameCompletePending || qIndex>=gameQuestions.length-1){
    finishGame('survived');
    return;
  }
  qIndex++;
  renderQuestion();
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
  if(finished && reason!=='bankrupt') return;
  finished=true;
  clearDecisionTimer();
  stopOverallTimer();
  $('#bankruptModal').classList.remove('open');

  $('#finishTeam').textContent=teamName;
  $('#finishRoom').textContent=roomCode;
  $('#finishHp').textContent=hp;

  const bankrupt=reason==='bankrupt' || hp<=0;
  const timeup=reason==='timeup';

  if(bankrupt){
    $('#finishIcon').textContent='☠️';
    $('#finishKicker').textContent='BUSINESS FAILED';
    $('#finishTitle').textContent='ล้มละลาย — ธุรกิจของคุณไปไม่รอด';
    $('#finishStatus').textContent=`จบที่สถานการณ์ ${history.length} / ${gameQuestions.length}`;
    $('#finishNote').textContent='ธุรกิจ HP หมดก่อนผ่านครบ 20 สถานการณ์';
  }else if(timeup){
    $('#finishIcon').textContent='⏰';
    $('#finishKicker').textContent='TIME IS UP';
    $('#finishTitle').textContent='หมดเวลา 20 นาที';
    $('#finishStatus').textContent=`ตอบได้ ${history.length} / ${gameQuestions.length} สถานการณ์ · เหลือ ${hp} HP`;
    $('#finishNote').textContent='ทีมที่ผ่านครบ 20 สถานการณ์จะมีอันดับเหนือทีมที่ยังตอบไม่ครบ แม้ HP จะเหลือมากกว่า';
  }else{
    $('#finishIcon').textContent='🏆';
    $('#finishKicker').textContent='GAME COMPLETE';
    $('#finishTitle').textContent='รอดครบ 20 สถานการณ์!';
    let status='รอดแบบเฉียดฉิว 😵';
    if(hp>80) status='สุดยอดผู้บริหาร 🔥';
    else if(hp>60) status='บริหารได้ดี 👍';
    else if(hp>30) status='ยังอยู่ แต่เจ็บหนัก 😮‍💨';
    $('#finishStatus').textContent=`${status} · เหลือเวลา ${formatTime(overallSeconds)}`;
    $('#finishNote').textContent='ภารกิจสำเร็จ: ผ่านครบ 20 สถานการณ์ภายในเวลาที่กำหนด';
    Sound.win();
  }

  renderHistory();
  show('result');
  saveSnapshot(bankrupt?'bankrupt':timeup?'timeup':'survived');
}

function clearDecisionTimer(){
  if(decisionTimerId){ clearInterval(decisionTimerId); decisionTimerId=null; }
  if(tickTimerId){ clearTimeout(tickTimerId); tickTimerId=null; }
}

function clearAllTimers(){
  clearDecisionTimer();
  stopOverallTimer();
}

function resetGame(){
  if(screens.join.classList.contains('active')) return;
  if(confirm('ออกจากเกมและกลับหน้าเข้าห้อง?')){
    clearAllTimers();
    finished=true;
    show('join');
  }
}

function fullscreen(){
  const el=document.documentElement;
  if(!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen();
  else if(document.exitFullscreen) document.exitFullscreen();
}

function toggleSound(){
  soundEnabled=!soundEnabled;
  $('#soundBtn').textContent=soundEnabled?'🔊 เสียง: เปิด':'🔇 เสียง: ปิด';
  $('#soundBtn').setAttribute('aria-pressed',String(soundEnabled));
  if(soundEnabled){
    Sound.init(); Sound.tap();
    if(screens.game.classList.contains('active') && !answered && !finished && phase==='answer') scheduleTick();
  }else if(tickTimerId){
    clearTimeout(tickTimerId);
    tickTimerId=null;
  }
}

$('#joinForm').addEventListener('submit',joinGame);
$('#readyDecisionBtn').addEventListener('click',startAnswerPhase);
$('#nextBtn').addEventListener('click',nextQuestion);
$('#bankruptSummaryBtn').addEventListener('click',()=>finishGame('bankrupt'));
$('#playAgainBtn').addEventListener('click',()=>{ clearAllTimers(); finished=true; gameCompletePending=false; $('#bankruptModal').classList.remove('open'); show('join'); });
$('#resetBtn').addEventListener('click',resetGame);
$('#fullscreenBtn').addEventListener('click',fullscreen);
$('#soundBtn').addEventListener('click',toggleSound);
$('#rulesBtn').addEventListener('click',()=>$('#rulesModal').classList.add('open'));
$('#closeRulesBtn').addEventListener('click',()=>$('#rulesModal').classList.remove('open'));
updateSyncBadge();
