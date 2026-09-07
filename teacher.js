const $=s=>document.querySelector(s);
const TEACHER_PIN='212224';
let activeRoom='';
let pollId=null;
let unsubscribe=()=>{};
let draftDuration=20;

function cleanCode(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,'');}
function clampDuration(v){return Math.max(1,Math.min(120,Math.round(Number(v)||20)));}
function renderDuration(){if($('#teacherDuration'))$('#teacherDuration').textContent=draftDuration;}

function setModeNote(){
  const remote=window.SyncService&&window.SyncService.mode()==='remote';
  const note=$('#backendNote');
  if(remote){note.textContent='🟢 ระบบห้องออนไลน์พร้อมใช้งาน: คะแนนและการตั้งเวลาจะซิงก์ไปทุกอุปกรณ์';$('#liveBadge').textContent='● LIVE ONLINE';$('#liveBadge').className='live-badge';}
  else{note.textContent='🟠 ตอนนี้เป็นโหมดทดสอบในเครื่อง: Dashboard เห็นเฉพาะทีมที่เล่นใน Browser เดียวกัน จนกว่าจะเชื่อม Supabase';$('#liveBadge').textContent='● LOCAL DEMO';$('#liveBadge').className='live-badge local';}
}

async function loadRoomSettings(){
  if(!activeRoom||!window.SyncService||!window.SyncService.getRoomSettings)return;
  try{const s=await window.SyncService.getRoomSettings(activeRoom);draftDuration=clampDuration(s.durationMinutes);renderDuration();$('#timerStatus').textContent=`ใช้อยู่ ${draftDuration} นาที`; }catch(e){}
}

async function openRoom(code){
  activeRoom=cleanCode(code);if(!activeRoom)return;
  $('#teacherRoomCode').value=activeRoom;$('#teacherRoomDisplay').textContent=activeRoom;
  $('#teacherJoin').style.display='none';$('#teacherDashboard').classList.add('active');
  history.replaceState(null,'',`teacher.html?room=${encodeURIComponent(activeRoom)}`);setModeNote();
  clearInterval(pollId);unsubscribe();await loadRoomSettings();await refreshTeams();
  pollId=setInterval(refreshTeams,2000);if(window.SyncService)unsubscribe=window.SyncService.subscribe(activeRoom,()=>{refreshTeams();loadRoomSettings();});
}

function statusLabel(team){if(team.status==='bankrupt'||team.hp<=0)return['ล้มละลาย','bankrupt'];if(team.status==='survived')return['รอดครบ 20','survived'];if(team.status==='timeup')return['หมดเวลา','playing'];return['กำลังเล่น','playing'];}
function rankPriority(team){if(team.status==='survived')return 4;if(team.status==='playing'&&team.hp>0)return 3;if(team.status==='timeup')return 2;return 1;}

async function refreshTeams(){
  if(!activeRoom||!window.SyncService)return;let teams=[];
  try{teams=await window.SyncService.listTeams(activeRoom);}catch(e){teams=[];}
  teams.sort((a,b)=>(rankPriority(b)-rankPriority(a))||(b.hp-a.hp)||(b.questionIndex-a.questionIndex)||String(a.teamName).localeCompare(String(b.teamName)));
  renderStats(teams);renderTeams(teams);
}
function renderStats(teams){
  const playing=teams.filter(t=>t.status==='playing'&&t.hp>0).length;const survived=teams.filter(t=>t.status==='survived'&&t.hp>0).length;const completed=teams.filter(t=>t.status==='survived');
  const top=completed.length?Math.max(...completed.map(t=>Number(t.hp)||0)):(teams.length?Math.max(...teams.map(t=>Number(t.hp)||0)):null);
  $('#statTeams').textContent=teams.length;$('#statPlaying').textContent=playing;$('#statSurvived').textContent=survived;$('#statTopHp').textContent=top===null?'—':`${top} HP`;
}
function renderTeams(teams){
  const box=$('#teacherTeamList');if(!teams.length){box.innerHTML=`<div class="teacher-empty"><div style="font-size:54px">📡</div><h3>กำลังรอทีมเข้าห้อง</h3><p>ให้นักศึกษาใส่รหัส <b>${activeRoom}</b> แล้วเริ่มเกม</p></div>`;return;}
  box.innerHTML=teams.map((t,i)=>{const [label,cls]=statusLabel(t);const pct=Math.max(0,Math.min(100,Number(t.hp)||0));const progress=Math.min(Number(t.questionIndex)||0,Number(t.totalQuestions)||20);const medal=['🥇','🥈','🥉'][i]||String(i+1);return `<div class="team-monitor"><div class="rank-no">${medal}</div><div class="team-name">${escapeHtml(t.teamName)}<small>${label}</small></div><div class="monitor-hp"><strong><span>❤️ พลังชีวิต</span><span>${t.hp} HP</span></strong><div class="hpbar"><div class="hpfill ${pct<=30?'danger':pct<=60?'warning':''}" style="width:${pct}%"></div></div></div><div class="progress-text">EVENT ${progress} / ${t.totalQuestions||20}</div><div class="status-chip ${cls}">${label}</div></div>`;}).join('');
}

function adjustDuration(delta){draftDuration=clampDuration(draftDuration+delta);renderDuration();$('#timerStatus').textContent='ยังไม่ได้ใช้ — กด “ใช้เวลานี้”';}
async function saveDuration(){
  if(!activeRoom||!window.SyncService||!window.SyncService.saveRoomSettings)return;
  const btn=$('#timerSave');btn.disabled=true;$('#timerStatus').textContent='กำลังส่งเวลาไปทุกทีม…';
  try{await window.SyncService.saveRoomSettings(activeRoom,{durationMinutes:draftDuration});$('#timerStatus').textContent=`✓ ปรับเป็น ${draftDuration} นาทีแล้ว`;}
  catch(e){$('#timerStatus').textContent='ส่งไม่สำเร็จ กรุณาลองอีกครั้ง';}
  finally{btn.disabled=false;}
}

function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function fullscreen(){const el=document.documentElement;if(!document.fullscreenElement&&el.requestFullscreen)el.requestFullscreen();else if(document.exitFullscreen)document.exitFullscreen();}

$('#teacherJoinForm').addEventListener('submit',e=>{e.preventDefault();const pin=$('#teacherAccessCode').value.trim();const err=$('#teacherAccessError');if(pin!==TEACHER_PIN){err.style.display='block';$('#teacherAccessCode').value='';$('#teacherAccessCode').focus();return;}err.style.display='none';openRoom($('#teacherRoomCode').value);});
$('#teacherAccessCode').addEventListener('input',()=>$('#teacherAccessError').style.display='none');
$('#refreshBtn').addEventListener('click',refreshTeams);$('#teacherFullscreenBtn').addEventListener('click',fullscreen);
$('#timerMinus5').addEventListener('click',()=>adjustDuration(-5));$('#timerMinus1').addEventListener('click',()=>adjustDuration(-1));$('#timerPlus1').addEventListener('click',()=>adjustDuration(1));$('#timerPlus5').addEventListener('click',()=>adjustDuration(5));$('#timerSave').addEventListener('click',saveDuration);
renderDuration();setModeNote();const initial=new URLSearchParams(location.search).get('room');if(initial)$('#teacherRoomCode').value=cleanCode(initial);
