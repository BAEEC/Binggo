(function(){
  const cfg=window.SYNC_CONFIG||{};
  const hasRemote=Boolean(cfg.supabaseUrl&&cfg.supabaseAnonKey);
  const channel=('BroadcastChannel' in window)?new BroadcastChannel('business-survival-sync'):null;

  function normalizeRoom(v){return String(v||'').trim().toUpperCase().replace(/\s+/g,'');}
  function localKey(room){return `business-survival:room:${normalizeRoom(room)}`;}
  function now(){return new Date().toISOString();}

  function toRow(state){
    return {
      session_id:state.sessionId,
      room_code:normalizeRoom(state.roomCode),
      team_name:state.teamName,
      hp:Number(state.hp)||0,
      status:state.status||'playing',
      question_index:Number(state.questionIndex)||0,
      total_questions:Number(state.totalQuestions)||20,
      completed:Boolean(state.completed),
      history:Array.isArray(state.history)?state.history:[],
      updated_at:now()
    };
  }

  function fromRow(row){
    return {
      sessionId:row.session_id,
      roomCode:row.room_code,
      teamName:row.team_name,
      hp:Number(row.hp)||0,
      status:row.status||'playing',
      questionIndex:Number(row.question_index)||0,
      totalQuestions:Number(row.total_questions)||20,
      completed:Boolean(row.completed),
      history:Array.isArray(row.history)?row.history:[],
      updatedAt:row.updated_at||''
    };
  }

  function localSave(row){
    const key=localKey(row.room_code);
    let rows=[];
    try{rows=JSON.parse(localStorage.getItem(key)||'[]');}catch(e){rows=[];}
    const idx=rows.findIndex(x=>x.session_id===row.session_id);
    if(idx>=0) rows[idx]=row; else rows.push(row);
    localStorage.setItem(key,JSON.stringify(rows));
    if(channel) channel.postMessage({type:'room-update',room:row.room_code});
  }

  function localList(room){
    let rows=[];
    try{rows=JSON.parse(localStorage.getItem(localKey(room))||'[]');}catch(e){rows=[];}
    return rows.map(fromRow);
  }

  async function remoteSave(row){
    const base=cfg.supabaseUrl.replace(/\/$/,'');
    const res=await fetch(`${base}/rest/v1/game_teams?on_conflict=session_id`,{
      method:'POST',
      headers:{
        'apikey':cfg.supabaseAnonKey,
        'Authorization':`Bearer ${cfg.supabaseAnonKey}`,
        'Content-Type':'application/json',
        'Prefer':'resolution=merge-duplicates,return=minimal'
      },
      body:JSON.stringify(row)
    });
    if(!res.ok) throw new Error(`Sync failed ${res.status}`);
  }

  async function remoteList(room){
    const base=cfg.supabaseUrl.replace(/\/$/,'');
    const code=encodeURIComponent(normalizeRoom(room));
    const res=await fetch(`${base}/rest/v1/game_teams?room_code=eq.${code}&select=*&order=hp.desc,updated_at.desc`,{
      headers:{'apikey':cfg.supabaseAnonKey,'Authorization':`Bearer ${cfg.supabaseAnonKey}`}
    });
    if(!res.ok) throw new Error(`Read failed ${res.status}`);
    const rows=await res.json();
    return rows.map(fromRow);
  }

  async function saveTeam(state){
    const row=toRow(state);
    localSave(row);
    if(hasRemote) await remoteSave(row);
    return fromRow(row);
  }

  async function listTeams(room){
    if(hasRemote){
      try{return await remoteList(room);}catch(e){return localList(room);}
    }
    return localList(room);
  }

  function subscribe(room,fn){
    const target=normalizeRoom(room);
    if(!channel) return ()=>{};
    const handler=e=>{if(e.data&&e.data.type==='room-update'&&e.data.room===target) fn();};
    channel.addEventListener('message',handler);
    return ()=>channel.removeEventListener('message',handler);
  }

  window.SyncService={
    mode:()=>hasRemote?'remote':'local',
    saveTeam,
    listTeams,
    subscribe
  };
})();
