const qs = window.GAME_QUESTIONS || [];
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let teamName = '';
let roomCode = '';
let hp = 100;
let qIndex = 0;
let timerId = null;
let timeLeft = 30;
let answered = false;
let finished = false;

const screens = {
  join: $('#joinScreen'),
  game: $('#gameScreen'),
  result: $('#resultScreen')
};

function show(name){
  Object.values(screens).forEach(x => x.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo({top:0,behavior:'smooth'});
}

function cleanCode(v){
  return v.trim().toUpperCase().replace(/\s+/g,'');
}

function joinGame(e){
  e.preventDefault();
  const name = $('#teamName').value.trim();
  const code = cleanCode($('#roomCode').value);
  if(!name || !code) return;
  teamName = name;
  roomCode = code;
  hp = 100;
  qIndex = 0;
  finished = false;
  $('#teamDisplay').textContent = teamName;
  $('#roomDisplay').textContent = roomCode;
  show('game');
  renderQuestion();
}

function renderQuestion(){
  clearTimer();
  answered = false;
  timeLeft = 30;
  const q = qs[qIndex];
  $('#roundPill').textContent = `EVENT ${String(qIndex+1).padStart(2,'0')} / ${qs.length}`;
  $('#questionState').textContent = 'เลือกคำตอบก่อนหมดเวลา';
  $('#questionState').className = 'state-pill';
  $('#eventIcon').textContent = q.icon;
  $('#questionTitle').textContent = q.title;
  $('#questionDesc').textContent = q.desc;
  $('#timerText').textContent = '30';
  $('#timerBar').style.width = '100%';
  $('#timerBar').className = 'timer-bar';
  $('#resultBox').className = 'result-box';
  $('#nextBtn').classList.add('hidden');
  $('#statusNote').textContent = 'คุยกับสมาชิกในทีม แล้วเลือก 1 คำตอบ';

  const box = $('#options');
  box.innerHTML = '';
  ['A','B','C','D'].forEach((letter,i)=>{
    const b = document.createElement('button');
    b.type='button';
    b.className='option';
    b.innerHTML = `<span class="letter">${letter}</span><span>${q.options[i].text}</span>`;
    b.addEventListener('click',()=>choose(i,b));
    box.appendChild(b);
  });

  updateHp();
  startTimer();
}

function choose(index, btn){
  if(answered || finished) return;
  answered = true;
  clearTimer();
  const q = qs[qIndex];
  const opt = q.options[index];
  $$('.option').forEach((el,i)=>{
    el.disabled = true;
    if(i===index) el.classList.add('selected');
  });
  applyResult(opt, false);
}

function timeoutAnswer(){
  if(answered || finished) return;
  answered = true;
  clearTimer();
  $$('.option').forEach(el=>el.disabled=true);
  applyResult({damage:20,feedback:'หมดเวลา! ทีมไม่ได้เลือกคำตอบภายใน 30 วินาที'}, true);
}

function applyResult(opt, timedOut){
  const damage = opt.damage || 0;
  hp = Math.max(0, hp - damage);
  updateHp();

  let cls='good', icon='🟢', kicker='NICE MOVE!', title='รอดตัวไป', dmg='0 DAMAGE';
  if(damage===10){ cls='mid'; icon='🟠'; kicker='OUCH!'; title='พลาดนิดหน่อย'; dmg='-10 HP'; }
  if(damage>=20){ cls='bad'; icon=timedOut?'⏰':'🔴'; kicker=timedOut?'TIME OUT!':'CRITICAL HIT!'; title=timedOut?'หมดเวลา':'ธุรกิจเจ็บหนัก'; dmg='-20 HP'; }

  $('#resultIcon').textContent = icon;
  $('#resultKicker').textContent = kicker;
  $('#resultTitle').textContent = title;
  $('#resultFeedback').textContent = opt.feedback;
  $('#damageBadge').textContent = dmg;
  $('#resultBox').className = `result-box show ${cls}`;
  $('#questionState').textContent = damage===0?'SAFE':damage===10?'HIT -10':'HIT -20';
  $('#questionState').className = `state-pill ${cls}`;
  $('#statusNote').textContent = hp<=0 ? '☠️ BUSINESS FAILED — ยังเล่นต่อได้เพื่อให้ครบ 20 ข้อ' : `เหลือ ${hp} HP`;
  $('#nextBtn').classList.remove('hidden');

  if(hp<=0){
    $('#hpStatus').textContent='BUSINESS FAILED ☠️';
    $('#hpStatus').className='failed-text';
  }
}

function updateHp(){
  $('#hpText').textContent = `${hp} HP`;
  $('#hpFill').style.width = `${hp}%`;
  $('#hpFill').className = 'hpfill' + (hp<=30?' danger':hp<=60?' warning':'');
  if(hp>0){
    $('#hpStatus').textContent = hp<=30?'DANGER ZONE':hp<=60?'BUSINESS AT RISK':'BUSINESS ACTIVE';
    $('#hpStatus').className = '';
  }
}

function nextQuestion(){
  if(qIndex >= qs.length-1){
    finishGame();
    return;
  }
  qIndex++;
  renderQuestion();
}

function finishGame(){
  finished = true;
  clearTimer();
  $('#finishTeam').textContent = teamName;
  $('#finishRoom').textContent = roomCode;
  $('#finishHp').textContent = hp;
  let status='ธุรกิจรอด! 🎉';
  if(hp===0) status='BUSINESS FAILED ☠️';
  else if(hp<=30) status='รอดแบบเฉียดฉิว 😵';
  else if(hp<=60) status='ยังอยู่ แต่เจ็บหนัก 😮‍💨';
  else if(hp<=80) status='บริหารได้ดี 👍';
  else status='สุดยอดผู้บริหาร 🔥';
  $('#finishStatus').textContent=status;
  $('#finishTitle').textContent = hp>0?'จบครบ 20 ด่าน!':'ภารกิจจบแล้ว';
  show('result');
}

function startTimer(){
  clearTimer();
  timerId = setInterval(()=>{
    timeLeft--;
    $('#timerText').textContent = String(timeLeft);
    const pct = Math.max(0,(timeLeft/30)*100);
    $('#timerBar').style.width = `${pct}%`;
    if(timeLeft<=10) $('#timerBar').className='timer-bar danger';
    else if(timeLeft<=20) $('#timerBar').className='timer-bar warning';
    if(timeLeft<=0) timeoutAnswer();
  },1000);
}

function clearTimer(){
  if(timerId){ clearInterval(timerId); timerId=null; }
}

function resetGame(){
  if(screens.join.classList.contains('active')) return;
  if(confirm('ออกจากเกมและกลับหน้าเข้าห้อง?')){
    clearTimer();
    show('join');
  }
}

function fullscreen(){
  const el=document.documentElement;
  if(!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen();
  else if(document.exitFullscreen) document.exitFullscreen();
}

$('#joinForm').addEventListener('submit',joinGame);
$('#nextBtn').addEventListener('click',nextQuestion);
$('#playAgainBtn').addEventListener('click',()=>{ clearTimer(); show('join'); });
$('#resetBtn').addEventListener('click',resetGame);
$('#fullscreenBtn').addEventListener('click',fullscreen);
$('#rulesBtn').addEventListener('click',()=>$('#rulesModal').classList.add('open'));
$('#closeRulesBtn').addEventListener('click',()=>$('#rulesModal').classList.remove('open'));
