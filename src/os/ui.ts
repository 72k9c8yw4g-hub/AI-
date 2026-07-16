// AI意思決定OS — アプリ画面 (ChatGPT型・スマホ主対象)。実装準備設計書 v1.0 第5章。
// /os/<token> で配信。トークンはクライアント側で path から読み、/api/<token>/os/... を叩く。

export function renderOsApp(): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>AI意思決定OS</title>
<style>
:root{--bg:#0f1115;--panel:#171a21;--panel2:#1e222b;--line:#2a2f3a;--text:#e7e9ee;--muted:#9aa2b1;--accent:#5b8cff;--user:#2b3550;--mentor:#1e252f;--warn:#3a2a12;}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif;display:flex;flex-direction:column;height:100dvh;overflow:hidden}
header{display:flex;align-items:center;gap:10px;padding:12px 14px;padding-top:max(12px,env(safe-area-inset-top));background:var(--panel);border-bottom:1px solid var(--line);flex:0 0 auto}
header .title{font-weight:700;font-size:15px}
header .sub{color:var(--muted);font-size:12px}
#subtitle{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:56vw}
button{font:inherit;cursor:pointer;color:var(--text);background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:8px 12px}
button.icon{padding:8px 10px;line-height:1}
button.primary{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:600}
.wrap{flex:1;display:flex;min-height:0}
.drawer{position:fixed;inset:0 auto 0 0;width:82%;max-width:320px;background:var(--panel);border-right:1px solid var(--line);transform:translateX(-102%);transition:transform .2s;z-index:20;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top)}
.drawer.open{transform:none}
.scrim{position:fixed;inset:0;background:rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s;z-index:15}
.scrim.open{opacity:1;pointer-events:auto}
.drawer .dh{display:flex;gap:8px;padding:12px;border-bottom:1px solid var(--line)}
.chatlist{overflow:auto;flex:1;-webkit-overflow-scrolling:touch}
.chatitem{padding:12px 14px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;gap:8px;align-items:center}
.chatitem .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chatitem.active{background:var(--panel2)}
.chatitem .cnt{color:var(--muted);font-size:11px}
.chatitem .del{color:var(--muted);background:none;border:none;padding:4px 6px}
main{flex:1;display:flex;flex-direction:column;min-width:0}
.banner{background:var(--warn);color:#f0d9b5;font-size:12px;padding:8px 14px;border-bottom:1px solid var(--line)}
.msgs{flex:1;overflow:auto;padding:16px 12px;display:flex;flex-direction:column;gap:12px;-webkit-overflow-scrolling:touch}
.empty{margin:auto;text-align:center;color:var(--muted);max-width:340px;line-height:1.7}
.row{display:flex;flex-direction:column;max-width:86%}
.row.user{align-self:flex-end;align-items:flex-end}
.row.mentor{align-self:flex-start;align-items:flex-start}
.who{font-size:11px;color:var(--muted);margin:0 4px 3px}
.bubble{padding:10px 13px;border-radius:14px;white-space:pre-wrap;word-break:break-word;line-height:1.6;font-size:15px}
.row.user .bubble{background:var(--user)}
.row.mentor .bubble{background:var(--mentor);border:1px solid var(--line)}
.typing{color:var(--muted);font-size:13px;padding:2px 6px}
.composer{flex:0 0 auto;display:flex;gap:8px;padding:10px 12px;padding-bottom:max(10px,env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--panel)}
.composer textarea{flex:1;resize:none;max-height:140px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:10px 12px;font:inherit;line-height:1.5}
.composer button{align-self:flex-end}
/* 保存候補カード */
.card{align-self:stretch;max-width:100%;background:var(--panel2);border:1px solid var(--accent);border-radius:14px;padding:12px 14px;margin:4px 0}
.card .ch{font-size:12px;color:var(--accent);font-weight:700;margin-bottom:6px}
.card .ct{font-weight:700;margin-bottom:6px;line-height:1.5}
.card .cb{white-space:pre-wrap;line-height:1.6;font-size:14px}
.card .cs{font-size:12px;color:var(--muted);margin-top:8px}
.card .ca{display:flex;gap:8px;margin-top:12px}
.card .ca button{flex:1}
.card .approve{background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700}
.card.done{border-color:var(--line)}
/* 決定事項パネル */
.panel{position:fixed;inset:0;background:var(--bg);z-index:30;display:none;flex-direction:column;padding-top:env(safe-area-inset-top)}
.panel.open{display:flex}
.panel-h{display:flex;align-items:center;justify-content:space-between;padding:14px;border-bottom:1px solid var(--line);font-size:16px}
.panel-h button{background:none;border:none;font-size:20px;padding:4px 8px}
.tabs{display:flex;border-bottom:1px solid var(--line)}
.tabs .tab{flex:1;background:none;border:none;border-bottom:2px solid transparent;border-radius:0;color:var(--muted);padding:12px}
.tabs .tab.active{color:var(--text);border-bottom-color:var(--accent);font-weight:700}
.panel-body{flex:1;overflow:auto;padding:12px;-webkit-overflow-scrolling:touch}
.dec{border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:10px;background:var(--panel)}
.dec.arch{opacity:.6}
.dec .dt{font-weight:700;margin:4px 0}
.dec .dm{font-size:12px;color:var(--muted)}
.dec .db{white-space:pre-wrap;font-size:14px;line-height:1.6;margin-top:6px}
.badge{display:inline-block;font-size:11px;padding:1px 7px;border-radius:999px;margin-right:6px}
.badge.active{background:#12331d;color:#7ee0a1}
.badge.arch{background:#3a2a12;color:#f0c98b}
.drawer .df{padding:12px;border-top:1px solid var(--line)}
.drawer .df a{color:var(--accent);text-decoration:none;font-size:13px}
.empty2{color:var(--muted);text-align:center;padding:30px 12px;font-size:14px;line-height:1.7}
/* 監視官の警告(独立監査ライン) */
.mon{align-self:center;max-width:94%;background:var(--warn);color:#f0d9b5;border:1px solid #5a4523;border-radius:10px;padding:8px 12px;font-size:13px;white-space:pre-wrap;line-height:1.55}
.mon .ml{display:block;font-weight:700;font-size:11px;margin-bottom:3px;color:#f0c98b}
/* 役割別モデル設定 */
.keys{font-size:12px;color:var(--muted);margin-bottom:14px;line-height:1.9;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.role{border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:10px;background:var(--panel)}
.role h4{margin:0 0 8px;font-size:14px}
.role .r{display:flex;gap:8px}
.role select{flex:0 0 42%;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit}
.role input{flex:1;min-width:0;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit}
.role .save{margin-top:8px;background:var(--accent);border-color:var(--accent);color:#fff;font-weight:700;padding:6px 14px}
.role .saved{color:#7ee0a1;font-size:12px;margin-left:8px}
/* 作業AI会話ログ(閲覧専用) */
.worklog{align-self:stretch;max-width:100%;border:1px dashed var(--line);border-radius:12px;margin:4px 0;background:var(--panel)}
.worklog>summary{cursor:pointer;padding:10px 12px;font-size:13px;color:var(--muted);list-style:none;line-height:1.5}
.worklog>summary::-webkit-details-marker{display:none}
.worklog .wl{padding:0 12px 10px}
.wmsg{border-top:1px solid var(--line);padding:8px 0}
.wmsg .wn{font-size:11px;color:var(--accent);font-weight:700;margin-bottom:3px}
.wmsg .wc{white-space:pre-wrap;font-size:13px;line-height:1.55}
@media(min-width:820px){
 .drawer{position:static;transform:none;width:300px;flex:0 0 300px}
 .scrim{display:none}
 header .menu{display:none}
}
</style>
</head>
<body>
<header>
  <button class="icon menu" id="menuBtn" aria-label="メニュー">☰</button>
  <div style="flex:1">
    <div class="title">🧭 AI意思決定OS</div>
    <div class="sub" id="subtitle">メンターと議論する</div>
  </div>
  <button class="icon" id="runsBtn" title="AI会話ログ" style="font-size:18px">🗂</button>
  <button class="icon" id="settingsBtn" title="設定" style="font-size:18px">⚙️</button>
  <button class="icon" id="decisionsBtn" title="決定事項" style="font-size:18px">📌</button>
</header>
<div class="wrap">
  <div class="scrim" id="scrim"></div>
  <aside class="drawer" id="drawer">
    <div class="dh">
      <button class="primary" id="newChatBtn" style="flex:1">＋ 新しい会話</button>
    </div>
    <div class="chatlist" id="chatlist"></div>
    <div class="df"><a id="recordsLink" href="#">🧠 Dscribe 記録ダッシュボード ↗</a></div>
  </aside>
  <main>
    <div class="banner" id="banner" style="display:none"></div>
    <div class="msgs" id="msgs"></div>
    <div class="composer">
      <button class="icon" id="proposeBtn" title="この会話から決定を記録" style="align-self:flex-end;font-size:18px">📝</button>
      <button class="icon" id="delegateBtn" title="入力を作業AIに振る" style="align-self:flex-end;font-size:18px">🛠</button>
      <textarea id="input" rows="1" placeholder="メンターに相談…（🛠で作業AIに委任）"></textarea>
      <button class="primary" id="sendBtn">送信</button>
    </div>
  </main>
</div>
<div class="panel" id="decPanel">
  <div class="panel-h"><b>📌 決定事項</b><button id="decClose" aria-label="閉じる">✕</button></div>
  <div class="tabs">
    <button class="tab active" data-tab="active">Active</button>
    <button class="tab" data-tab="pending">承認待ち</button>
    <button class="tab" data-tab="archived">Archived</button>
  </div>
  <div class="panel-body" id="decBody"></div>
</div>
<div class="panel" id="setPanel">
  <div class="panel-h"><b>⚙️ 役割別モデル設定</b><button id="setClose" aria-label="閉じる">✕</button></div>
  <div class="panel-body">
    <div class="keys" id="keyStatus"></div>
    <div id="roleList"></div>
  </div>
</div>
<div class="panel" id="runPanel">
  <div class="panel-h"><b>🗂 AI会話ログ（閲覧専用）</b><button id="runClose" aria-label="閉じる">✕</button></div>
  <div class="panel-body" id="runBody"></div>
</div>
<script>
var TOKEN = location.pathname.split('/').filter(Boolean)[1] || '';
var API = '/api/' + TOKEN + '/os';
var APP_ROOT = '/app/' + TOKEN;
var current = null;      // 現在のチャットID
var sending = false;

document.getElementById('recordsLink').href = APP_ROOT;

function el(id){return document.getElementById(id)}
function esc(s){return String(s).replace(/[&<>]/g,function(c){return c==='&'?'&amp;':c==='<'?'&lt;':'&gt;'})}
function api(path, opts){
  return fetch(API + path, Object.assign({headers:{'content-type':'application/json'}}, opts||{}))
    .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j})});
}
function openDrawer(o){el('drawer').classList.toggle('open',o);el('scrim').classList.toggle('open',o)}
el('menuBtn').onclick=function(){openDrawer(!el('drawer').classList.contains('open'))};
el('scrim').onclick=function(){openDrawer(false)};

function loadStatus(){
  api('/status').then(function(s){
    if(!s.llm_connected){
      el('banner').style.display='block';
      el('banner').textContent='⚠ LLM未接続: 今はスタブ応答です。ANTHROPIC_API_KEY などを設定するとメンターが実際に思考します。';
    }
  }).catch(function(){});
}

function loadChats(){
  return api('/chats').then(function(d){
    var list = el('chatlist'); list.innerHTML='';
    if(!d.chats.length){ list.innerHTML='<div style="padding:14px;color:var(--muted);font-size:13px">まだ会話がありません。「＋ 新しい会話」から始めてください。</div>'; }
    d.chats.forEach(function(c){
      var div=document.createElement('div');
      div.className='chatitem'+(c.id===current?' active':'');
      div.innerHTML='<div class="t">'+esc(c.title)+'<div class="cnt">'+(c.message_count||0)+' メッセージ</div></div>';
      var del=document.createElement('button'); del.className='del'; del.textContent='🗑';
      del.onclick=function(e){e.stopPropagation();if(confirm('この会話を削除しますか？'))api('/chats/'+c.id,{method:'DELETE'}).then(function(){if(current===c.id){current=null;renderMessages([]);el('subtitle').textContent='メンターと議論する'}loadChats()})};
      div.querySelector('.t').onclick=function(){openChat(c.id,c.title)};
      div.appendChild(del);
      list.appendChild(div);
    });
    return d.chats;
  });
}

function msgNode(m){
  if(m.role==='monitor'){
    var mon=document.createElement('div'); mon.className='mon';
    mon.innerHTML='<span class="ml">🛡 特命監視官</span>'+esc(m.content);
    return mon;
  }
  var who = m.role==='user' ? 'あなた' : (m.role==='mentor' ? 'メンター' : (m.name||m.role));
  var row=document.createElement('div');
  row.className='row '+(m.role==='user'?'user':'mentor');
  row.innerHTML='<div class="who">'+esc(who)+'</div><div class="bubble">'+esc(m.content)+'</div>';
  return row;
}
function renderMessages(msgs){
  var box=el('msgs'); box.innerHTML='';
  if(!msgs.length){
    box.innerHTML='<div class="empty"><div style="font-size:34px">🧭</div>共同創業者としてのメンターが、YESマンにならず率直に議論します。<br>まず相談したいことを送ってください。</div>';
    return;
  }
  msgs.forEach(function(m){ if(m.role==='system')return; box.appendChild(msgNode(m)); });
  box.scrollTop=box.scrollHeight;
}

function openChat(id,title){
  current=id;
  el('subtitle').textContent=title||'会話';
  openDrawer(false);
  el('msgs').innerHTML='<div class="empty">読み込み中…</div>';
  loadChats();
  return api('/chats/'+id).then(function(d){renderMessages(d.messages)}).catch(function(e){el('msgs').innerHTML='<div class="empty">'+esc(e.message)+'</div>'});
}

function newChat(){
  return api('/chats',{method:'POST',body:JSON.stringify({})}).then(function(d){
    return loadChats().then(function(){return openChat(d.chat.id,d.chat.title)});
  });
}
el('newChatBtn').onclick=function(){newChat()};

function appendTyping(){
  var box=el('msgs');
  var t=document.createElement('div'); t.className='typing'; t.id='typing'; t.textContent='メンター思考中…';
  box.appendChild(t); box.scrollTop=box.scrollHeight;
}
function removeTyping(){var t=el('typing');if(t)t.remove()}

function doSend(text){
  sending=true; el('sendBtn').disabled=true;
  var box=el('msgs');
  var emp=box.querySelector('.empty'); if(emp)box.innerHTML='';
  var row=document.createElement('div'); row.className='row user';
  row.innerHTML='<div class="who">あなた</div><div class="bubble">'+esc(text)+'</div>';
  box.appendChild(row); box.scrollTop=box.scrollHeight;
  appendTyping();
  api('/chats/'+current+'/send',{method:'POST',body:JSON.stringify({content:text})}).then(function(d){
    removeTyping();
    box.appendChild(msgNode(d.mentor));
    if(d.monitor) box.appendChild(msgNode(d.monitor));
    box.scrollTop=box.scrollHeight;
    loadChats();
  }).catch(function(e){removeTyping();var er=document.createElement('div');er.className='typing';er.textContent='エラー: '+e.message;box.appendChild(er)})
    .then(function(){sending=false;el('sendBtn').disabled=false});
}
function send(){
  if(sending)return;
  var text=el('input').value.trim();
  if(!text)return;
  el('input').value=''; el('input').style.height='auto';
  if(current==null){
    // 新規チャットを作ってから送る。openChat は呼ばず、再描画で吹き出しが消えないようにする
    api('/chats',{method:'POST',body:JSON.stringify({title:text.slice(0,30)})}).then(function(d){
      current=d.chat.id; el('subtitle').textContent=d.chat.title; el('msgs').innerHTML='';
      doSend(text);
    }).catch(function(e){alert(e.message)});
  } else {
    doSend(text);
  }
}
el('sendBtn').onclick=send;
var inp=el('input');
inp.addEventListener('input',function(){inp.style.height='auto';inp.style.height=Math.min(inp.scrollHeight,140)+'px'});
inp.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});

// ── 保存候補(記録官)──
function cardHtml(c){
  return '<div class="ch">📝 保存候補 · '+esc(c.kind)+'</div>'+
    '<div class="ct">'+esc(c.title)+'</div>'+
    (c.content?'<div class="cb">'+esc(c.content)+'</div>':'')+
    (c.summary?'<div class="cs">要約: '+esc(c.summary)+'</div>':'')+
    (c.tags?'<div class="cs">#'+esc(c.tags).split(',').join(' #')+'</div>':'')+
    (c.supersedes_id?'<div class="cs">既存の決定 #'+c.supersedes_id+' を更新</div>':'')+
    '<div class="ca"><button class="approve">承認して保存</button><button class="reject">却下</button></div>';
}
function wireCard(card,c){
  card.querySelector('.approve').onclick=function(){decide(card,c.id,'approve')};
  card.querySelector('.reject').onclick=function(){decide(card,c.id,'reject')};
}
function renderCandidate(c){
  var box=el('msgs'); var emp=box.querySelector('.empty'); if(emp)box.innerHTML='';
  var card=document.createElement('div'); card.className='card'; card.innerHTML=cardHtml(c);
  wireCard(card,c); box.appendChild(card); box.scrollTop=box.scrollHeight;
}
function decide(card,cid,act){
  var btns=card.querySelectorAll('button'); Array.prototype.forEach.call(btns,function(b){b.disabled=true});
  api('/candidates/'+cid+'/'+act,{method:'POST'}).then(function(){
    card.classList.add('done');
    card.innerHTML = act==='approve' ? '<div class="ch">✅ 決定事項に保存しました (Active)</div>' : '<div class="ch">🚫 却下しました</div>';
  }).catch(function(e){alert(e.message);Array.prototype.forEach.call(btns,function(b){b.disabled=false})});
}
function propose(){
  if(current==null){alert('先に会話を始めてください');return;}
  var pb=el('proposeBtn'); pb.disabled=true;
  var box=el('msgs'); if(box.querySelector('.empty'))box.innerHTML='';
  var note=document.createElement('div'); note.className='typing'; note.textContent='記録官が保存候補を検討中…';
  box.appendChild(note); box.scrollTop=box.scrollHeight;
  api('/chats/'+current+'/propose',{method:'POST'}).then(function(r){
    note.remove();
    if(!r.save||!r.candidate){var n=document.createElement('div');n.className='typing';n.textContent='保存に値する確定した結論は見つかりませんでした。';box.appendChild(n);box.scrollTop=box.scrollHeight;return;}
    renderCandidate(r.candidate);
  }).catch(function(e){note.remove();alert(e.message)}).then(function(){pb.disabled=false});
}
el('proposeBtn').onclick=propose;

// ── 決定事項パネル ──
var decData=null;
function openDecisions(){el('decPanel').classList.add('open');setActiveTab('active');loadDecisions('active')}
function closeDecisions(){el('decPanel').classList.remove('open')}
el('decisionsBtn').onclick=openDecisions;
el('decClose').onclick=closeDecisions;
function setActiveTab(tab){Array.prototype.forEach.call(document.querySelectorAll('.tabs .tab'),function(x){x.classList.toggle('active',x.getAttribute('data-tab')===tab)})}
Array.prototype.forEach.call(document.querySelectorAll('.tabs .tab'),function(t){
  t.onclick=function(){var tab=t.getAttribute('data-tab');setActiveTab(tab);loadDecisions(tab)};
});
function loadDecisions(tab){
  el('decBody').innerHTML='<div class="empty2">読み込み中…</div>';
  api('/decisions').then(function(d){decData=d;renderDec(tab)}).catch(function(e){el('decBody').innerHTML='<div class="empty2">'+esc(e.message)+'</div>'});
}
function renderDec(tab){
  if(!decData)return;
  var body=el('decBody');
  if(tab==='pending'){
    var ps=decData.pending||[];
    if(!ps.length){body.innerHTML='<div class="empty2">承認待ちの保存候補はありません。</div>';return;}
    body.innerHTML='';
    ps.forEach(function(c){var card=document.createElement('div');card.className='card';card.innerHTML=cardHtml(c);wireCard(card,c);body.appendChild(card)});
    return;
  }
  var list = tab==='archived' ? (decData.archived||[]) : (decData.active||[]);
  if(!list.length){body.innerHTML='<div class="empty2">'+(tab==='archived'?'アーカイブされた決定はありません。':'有効な決定はまだありません。<br>会話で結論を出して 📝 で記録してください。')+'</div>';return;}
  body.innerHTML='';
  list.forEach(function(m){
    var d=document.createElement('div'); d.className='dec'+(tab==='archived'?' arch':'');
    var badge = tab==='archived' ? '<span class="badge arch">Archived</span>' : '<span class="badge active">Active</span>';
    d.innerHTML=badge+'<span class="dm">'+esc(m.created_at||'')+'</span>'+
      '<div class="dt">'+esc(m.title||'(無題)')+'</div>'+
      '<div class="db">'+esc(m.content||'')+'</div>'+
      (m.tags?'<div class="dm" style="margin-top:6px">#'+esc(m.tags).split(',').join(' #')+'</div>':'');
    body.appendChild(d);
  });
}

// ── 作業AI(委任 + AI会話ログ)──
function workLogNode(log){
  var d=document.createElement('details'); d.className='worklog';
  var inner='<summary>🛠 作業AI会話ログ（'+log.length+'ターン・閲覧専用） ▼</summary><div class="wl">';
  log.forEach(function(m){ inner+='<div class="wmsg"><div class="wn">'+esc(m.name||m.role)+'</div><div class="wc">'+esc(m.content)+'</div></div>'; });
  inner+='</div>'; d.innerHTML=inner; return d;
}
function delegate(){
  if(sending)return;
  if(current==null){alert('先に会話を始めてください');return;}
  var text=el('input').value.trim();
  if(!text){alert('作業AIに振るタスクを入力してください');return;}
  sending=true; el('sendBtn').disabled=true; el('delegateBtn').disabled=true;
  el('input').value=''; el('input').style.height='auto';
  var box=el('msgs'); if(box.querySelector('.empty'))box.innerHTML='';
  var row=document.createElement('div'); row.className='row user';
  row.innerHTML='<div class="who">あなた → 作業AI</div><div class="bubble">'+esc(text)+'</div>';
  box.appendChild(row);
  var note=document.createElement('div'); note.className='typing'; note.id='wtyping'; note.textContent='🛠 作業AIが検討中…（メンターが整理します）';
  box.appendChild(note); box.scrollTop=box.scrollHeight;
  api('/chats/'+current+'/delegate',{method:'POST',body:JSON.stringify({task:text})}).then(function(d){
    var t=el('wtyping'); if(t)t.remove();
    if(d.log&&d.log.length) box.appendChild(workLogNode(d.log));
    if(d.mentor) box.appendChild(msgNode(d.mentor));
    box.scrollTop=box.scrollHeight; loadChats();
  }).catch(function(e){var t=el('wtyping');if(t)t.remove();var er=document.createElement('div');er.className='typing';er.textContent='エラー: '+e.message;box.appendChild(er)})
    .then(function(){sending=false;el('sendBtn').disabled=false;el('delegateBtn').disabled=false});
}
el('delegateBtn').onclick=delegate;

function openRuns(){el('runPanel').classList.add('open');loadRuns()}
el('runsBtn').onclick=openRuns;
el('runClose').onclick=function(){el('runPanel').classList.remove('open')};
function loadRuns(){
  el('runBody').innerHTML='<div class="empty2">読み込み中…</div>';
  api('/runs').then(function(d){
    if(!d.runs.length){el('runBody').innerHTML='<div class="empty2">作業AIのログはまだありません。<br>会話で 🛠 からタスクを振ると、ここに残ります。</div>';return;}
    var body=el('runBody'); body.innerHTML='';
    d.runs.forEach(function(r){
      var det=document.createElement('details'); det.className='worklog'; det.style.marginBottom='10px';
      det.innerHTML='<summary>🛠 '+esc(r.task)+'<br><span style="font-size:11px;opacity:.7">'+esc(r.created_at)+' · '+esc(r.status)+'</span></summary><div class="wl"><div class="empty2" style="padding:10px">開いて読み込み中…</div></div>';
      det.addEventListener('toggle',function(){
        if(det.open && det.dataset.loaded!=='1'){
          det.dataset.loaded='1';
          api('/runs/'+r.id).then(function(rd){
            var wl=det.querySelector('.wl'); wl.innerHTML='';
            rd.log.forEach(function(m){ var x=document.createElement('div'); x.className='wmsg'; x.innerHTML='<div class="wn">'+esc(m.name||m.role)+'</div><div class="wc">'+esc(m.content)+'</div>'; wl.appendChild(x); });
            if(rd.run&&rd.run.summary){ var s=document.createElement('div'); s.className='wmsg'; s.innerHTML='<div class="wn">🧭 メンター整理（ユーザーへ提示）</div><div class="wc">'+esc(rd.run.summary)+'</div>'; wl.appendChild(s); }
          }).catch(function(e){det.querySelector('.wl').innerHTML='<div class="empty2">'+esc(e.message)+'</div>'});
        }
      });
      body.appendChild(det);
    });
  }).catch(function(e){el('runBody').innerHTML='<div class="empty2">'+esc(e.message)+'</div>'});
}

// ── 役割別モデル設定 ──
var ROLE_JA={mentor:'メンター兼司令塔',monitor:'特命監視官',recorder:'記録官',worker:'作業AI群'};
function openSettings(){el('setPanel').classList.add('open');loadRoles()}
function closeSettings(){el('setPanel').classList.remove('open')}
el('settingsBtn').onclick=openSettings;
el('setClose').onclick=closeSettings;
function loadRoles(){
  el('roleList').innerHTML='<div class="empty2">読み込み中…</div>';
  api('/roles').then(function(d){
    var ks=d.keys||{};
    el('keyStatus').innerHTML='APIキー接続状況'+
      '<br>Anthropic: '+(ks.anthropic?'✅ 接続':'— 未接続')+
      '<br>OpenAI: '+(ks.openai?'✅ 接続':'— 未接続')+
      '<br>Gemini: '+(ks.gemini?'✅ 接続':'— 未接続')+
      '<br><span style="opacity:.8">未接続のプロバイダを選んだ役割はスタブ応答になります。キーは wrangler secret で設定します。</span>';
    var list=el('roleList'); list.innerHTML='';
    d.roles.forEach(function(r){
      var box=document.createElement('div'); box.className='role';
      var opts=['anthropic','openai','gemini'].map(function(p){return '<option value="'+p+'"'+(p===r.provider?' selected':'')+'>'+p+'</option>'}).join('');
      box.innerHTML='<h4>'+esc(ROLE_JA[r.role]||r.role)+'</h4>'+
        '<div class="r"><select>'+opts+'</select><input value="'+esc(r.model)+'" placeholder="モデル名(空欄で既定)"></div>'+
        '<button class="save">保存</button><span class="saved" style="display:none">保存しました</span>';
      var sel=box.querySelector('select'), inp=box.querySelector('input'), sv=box.querySelector('.saved');
      box.querySelector('.save').onclick=function(){
        api('/roles',{method:'PUT',body:JSON.stringify({role:r.role,provider:sel.value,model:inp.value})}).then(function(){
          sv.style.display='inline'; setTimeout(function(){sv.style.display='none'},1500);
        }).catch(function(e){alert(e.message)});
      };
      list.appendChild(box);
    });
  }).catch(function(e){el('roleList').innerHTML='<div class="empty2">'+esc(e.message)+'</div>'});
}

renderMessages([]); loadStatus(); loadChats();
</script>
</body>
</html>`;
}
