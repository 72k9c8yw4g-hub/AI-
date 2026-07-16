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
  <a href="#" id="recordsLink" class="sub" style="color:var(--accent);text-decoration:none">記録 ↗</a>
</header>
<div class="wrap">
  <div class="scrim" id="scrim"></div>
  <aside class="drawer" id="drawer">
    <div class="dh">
      <button class="primary" id="newChatBtn" style="flex:1">＋ 新しい会話</button>
    </div>
    <div class="chatlist" id="chatlist"></div>
  </aside>
  <main>
    <div class="banner" id="banner" style="display:none"></div>
    <div class="msgs" id="msgs"></div>
    <div class="composer">
      <textarea id="input" rows="1" placeholder="メンターに相談…（Shift+Enterで改行）"></textarea>
      <button class="primary" id="sendBtn">送信</button>
    </div>
  </main>
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

function renderMessages(msgs){
  var box=el('msgs'); box.innerHTML='';
  if(!msgs.length){
    box.innerHTML='<div class="empty"><div style="font-size:34px">🧭</div>共同創業者としてのメンターが、YESマンにならず率直に議論します。<br>まず相談したいことを送ってください。</div>';
    return;
  }
  msgs.forEach(function(m){
    if(m.role==='system')return;
    var who = m.role==='user' ? 'あなた' : (m.role==='mentor' ? 'メンター' : (m.name||m.role));
    var row=document.createElement('div');
    row.className='row '+(m.role==='user'?'user':'mentor');
    row.innerHTML='<div class="who">'+esc(who)+'</div><div class="bubble">'+esc(m.content)+'</div>';
    box.appendChild(row);
  });
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
    var mrow=document.createElement('div'); mrow.className='row mentor';
    mrow.innerHTML='<div class="who">メンター</div><div class="bubble">'+esc(d.mentor.content)+'</div>';
    box.appendChild(mrow); box.scrollTop=box.scrollHeight;
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

renderMessages([]); loadStatus(); loadChats();
</script>
</body>
</html>`;
}
