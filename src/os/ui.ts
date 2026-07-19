// AI意思決定OS — アプリ画面 (ChatGPT型・スマホ主対象)。実装準備設計書 v1.0 第5章。
// /os/<token> で配信。トークンはクライアント側で path から読み、/api/<token>/os/... を叩く。

export function renderOsApp(token: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>AI意思決定OS</title>
<link rel="manifest" href="/os/${token}/manifest.webmanifest">
<link rel="icon" type="image/png" href="/os/icon-192.png">
<link rel="apple-touch-icon" href="/os/icon-192.png">
<meta name="theme-color" content="#0f1115">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="意思決定OS">
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
/* ファイル/写真 */
#fileStrip{display:none;flex-wrap:wrap;gap:8px;padding:8px 12px;border-top:1px solid var(--line);background:var(--panel)}
.fchip{display:inline-block;border-radius:8px;overflow:hidden;border:1px solid var(--line);text-decoration:none}
.fchip img{height:56px;width:56px;object-fit:cover;display:block}
.fchip.doc{padding:8px 10px;font-size:12px;color:var(--text);background:var(--panel2)}
.frow{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}
.fthumb{height:52px;width:52px;object-fit:cover;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--panel2);font-size:22px;text-decoration:none;flex:0 0 auto}
.fmeta{flex:1;min-width:0}.fmeta a{color:var(--accent);word-break:break-all}
.fdel{background:none;border:1px solid var(--line);color:var(--muted);border-radius:8px;padding:4px 10px;font-size:12px;flex:0 0 auto}
/* メッセージのコピー/編集 */
.mact{display:flex;gap:4px;margin-top:2px}
.row.user .mact{justify-content:flex-end}
.mact button{background:none;border:none;color:var(--muted);font-size:11px;padding:2px 5px;border-radius:6px}
.mact button:hover{color:var(--text);background:var(--panel2)}
.editbox{width:100%;box-sizing:border-box;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px;font:inherit;line-height:1.5}
.editrow{display:flex;gap:6px;margin-top:6px}
.editrow button{font-size:13px;padding:5px 12px}
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
/* ナビゲーション(スマホ=下タブ / PC=左レール) */
#osnav{position:fixed;z-index:40;display:flex;background:var(--panel);border-top:1px solid var(--line)}
#osnav button{flex:1;background:none;border:none;border-radius:0;color:var(--muted);font-size:20px;padding:7px 0 4px;display:flex;flex-direction:column;align-items:center;gap:1px}
#osnav button span{font-size:10px}
#osnav button.active{color:var(--accent)}
body{padding-bottom:56px}
#osnav{left:0;right:0;bottom:0;height:56px;padding-bottom:env(safe-area-inset-bottom)}
.panel{bottom:56px}
/* ホーム画面(実装準備設計書 第4章) */
.home-sec{margin-bottom:16px}
.home-sec h3{font-size:13px;color:var(--muted);margin:0 0 8px;font-weight:700}
.hcard{border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:12px}
.hrow{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border:1px solid var(--line);border-radius:12px;background:var(--panel);margin-bottom:8px;gap:8px}
.hrow .ht{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hrow .hm{color:var(--muted);font-size:12px;white-space:nowrap}
.stat{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:13px}
.stat:last-child{border-bottom:none}
.stat .sm{color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:46%}
.badge.run{background:#12331d;color:#7ee0a1}
.badge.stub{background:#3a2a12;color:#f0c98b}
@media(min-width:820px){
 .drawer{position:static;transform:none;width:300px;flex:0 0 300px}
 .scrim{display:none}
 header .menu{display:none}
 body{padding-bottom:0;padding-left:64px}
 #osnav{left:0;top:0;bottom:0;right:auto;width:64px;height:auto;flex-direction:column;justify-content:flex-start;border-top:none;border-right:1px solid var(--line);padding-top:max(10px,env(safe-area-inset-top))}
 #osnav button{flex:0 0 auto;padding:12px 0}
 .panel{bottom:0;left:64px}
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

</header>
<div class="wrap">
  <div class="scrim" id="scrim"></div>
  <aside class="drawer" id="drawer">
    <div class="dh">
      <button class="primary" id="newChatBtn" style="flex:1">＋ 新しい会話</button>
    </div>
    <div class="chatlist" id="chatlist"></div>
    <div class="df">
      <a id="recordsLink" href="#">🧠 Dscribe 記録ダッシュボード ↗</a>
      <button id="installBtn" style="display:none;width:100%;margin-top:10px">⬇ アプリとしてインストール</button>
    </div>
  </aside>
  <main>
    <div class="banner" id="banner" style="display:none"></div>
    <div class="msgs" id="msgs"></div>
    <div id="fileStrip"></div>
    <input type="file" id="fileInput" accept="image/*,application/pdf,.txt,.md,.csv" style="display:none">
    <div class="composer">
      <button class="icon" id="attachBtn" title="写真・ファイルを追加" style="align-self:flex-end;font-size:18px">📎</button>
      <button class="icon" id="proposeBtn" title="この会話から決定を記録" style="align-self:flex-end;font-size:18px">📝</button>
      <button class="icon" id="delegateBtn" title="入力を作業AIに振る" style="align-self:flex-end;font-size:18px">🛠</button>
      <button class="icon" id="reportBtn" title="監視官の節目レポート" style="align-self:flex-end;font-size:18px">📋</button>
      <textarea id="input" rows="1" placeholder="メンターに相談…（📎ファイル / 🛠委任 / 📋レポート）"></textarea>
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
    <button class="tab" data-tab="rejected">却下</button>
  </div>
  <div class="panel-body" id="decBody"></div>
</div>
<div class="panel" id="setPanel">
  <div class="panel-h"><b>⚙️ 役割別モデル設定</b><button id="setClose" aria-label="閉じる">✕</button></div>
  <div class="panel-body">
    <div class="keys" id="keyStatus"></div>
    <div id="roleList"></div>
    <div id="backupCard"></div>
  </div>
</div>
<div class="panel" id="runPanel">
  <div class="panel-h"><b>🗂 AI会話ログ（閲覧専用）</b><button id="runClose" aria-label="閉じる">✕</button></div>
  <div class="panel-body" id="runBody"></div>
</div>
<div class="panel" id="homePanel">
  <div class="panel-h"><b>🏠 ホーム</b><span class="sub" id="homeAcct"></span></div>
  <div class="panel-body" id="homeBody"></div>
</div>
<div class="panel" id="searchPanel">
  <div class="panel-h"><b>🔍 検索</b><button id="searchClose" aria-label="閉じる">✕</button></div>
  <div class="panel-body">
    <div class="r" style="display:flex;gap:8px;margin-bottom:14px">
      <input id="searchInput" style="flex:1;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit" placeholder="チャット・決定事項・AI会話を横断検索(スペースでAND)">
      <button class="primary" id="searchBtn">検索</button>
    </div>
    <div id="searchBody"><div class="empty2">キーワードを入れて検索してください。</div></div>
  </div>
</div>
<div class="panel" id="savedPanel">
  <div class="panel-h"><b>📚 保存データ</b><button id="savedClose" aria-label="閉じる">✕</button></div>
  <div class="panel-body">
    <div class="r" style="display:flex;gap:8px;margin-bottom:14px">
      <input id="savedInput" style="flex:1;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit" placeholder="保存データを検索(記憶・メモ)">
      <button class="primary" id="savedBtn">検索</button>
    </div>
    <div id="savedBody"></div>
  </div>
</div>
<div class="panel" id="filesPanel">
  <div class="panel-h"><b>📎 ファイル</b><button id="filesClose" aria-label="閉じる">✕</button></div>
  <div class="panel-body">
    <button class="primary" id="filesAdd" style="margin-bottom:14px">＋ 写真・ファイルを追加</button>
    <div id="filesBody"></div>
  </div>
</div>
<nav id="osnav">
  <button data-scr="home">🏠<span>ホーム</span></button>
  <button data-scr="chat">💬<span>チャット</span></button>
  <button data-scr="dec">📌<span>決定</span></button>
  <button data-scr="saved">📚<span>保存</span></button>
  <button data-scr="files">📎<span>ファイル</span></button>
  <button data-scr="search">🔍<span>検索</span></button>
  <button data-scr="runs">🗂<span>AI会話</span></button>
  <button data-scr="set">⚙️<span>設定</span></button>
</nav>
<script>
var TOKEN = location.pathname.split('/').filter(Boolean)[1] || '';
var API = '/api/' + TOKEN + '/os';
var APP_ROOT = '/app/' + TOKEN;
var current = null;      // 現在のチャットID
var sending = false;

document.getElementById('recordsLink').href = APP_ROOT;

function el(id){return document.getElementById(id)}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function api(path, opts){
  return fetch(API + path, Object.assign({headers:{'content-type':'application/json'}}, opts||{}))
    .then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j})});
}
function openDrawer(o){el('drawer').classList.toggle('open',o);el('scrim').classList.toggle('open',o)}
el('menuBtn').onclick=function(){openDrawer(!el('drawer').classList.contains('open'))};
el('scrim').onclick=function(){openDrawer(false)};

function updateBanner(stub){
  if(stub){
    el('banner').style.display='block';
    el('banner').textContent='⚠ LLM未接続: 今はスタブ応答です。GEMINI_API_KEY / ANTHROPIC_API_KEY などを設定すると実際に思考します。';
  } else {
    el('banner').style.display='none';
  }
}
function loadStatus(){
  api('/status').then(function(s){ updateBanner(!s.llm_connected); }).catch(function(){});
}

function loadChats(){
  return api('/chats').then(function(d){
    var list = el('chatlist'); list.innerHTML='';
    if(!d.chats.length){ list.innerHTML='<div style="padding:14px;color:var(--muted);font-size:13px">まだ会話がありません。「＋ 新しい会話」から始めてください。</div>'; }
    d.chats.forEach(function(c){
      var div=document.createElement('div');
      div.className='chatitem'+(c.id===current?' active':'');
      var proj = c.project ? '📁'+esc(c.project) : '📁 未分類';
      div.innerHTML='<div class="t">'+esc(c.title)+'<div class="cnt">'+(c.message_count||0)+' メッセージ · '+proj+'</div></div>';
      var pj=document.createElement('button'); pj.className='del'; pj.textContent='📁'; pj.title='プロジェクトに割り当て';
      pj.onclick=function(e){e.stopPropagation();var name=prompt('プロジェクト名(空欄で未分類に戻す)',c.project||'');if(name===null)return;api('/chats/'+c.id,{method:'PATCH',body:JSON.stringify({project:name})}).then(function(){loadChats()}).catch(function(err){alert(err.message)})};
      var del=document.createElement('button'); del.className='del'; del.textContent='🗑';
      del.onclick=function(e){e.stopPropagation();if(confirm('この会話を削除しますか？'))api('/chats/'+c.id,{method:'DELETE'}).then(function(){if(current===c.id){current=null;renderMessages([]);el('subtitle').textContent='メンターと議論する';el('fileStrip').style.display='none';el('fileStrip').innerHTML=''}loadChats()})};
      div.querySelector('.t').onclick=function(){openChat(c.id,c.title)};
      div.appendChild(pj); div.appendChild(del);
      list.appendChild(div);
    });
    return d.chats;
  });
}

function msgNode(m){
  if(m.role==='monitor'){
    var mon=document.createElement('div'); mon.className='mon';
    mon.innerHTML='<span class="ml">🛡 特命監視官</span>'+esc(m.content);
    addMsgActions(mon, m, false);
    return mon;
  }
  var who = m.role==='user' ? 'あなた' : (m.role==='mentor' ? 'メンター' : (m.name||m.role));
  var row=document.createElement('div');
  row.className='row '+(m.role==='user'?'user':'mentor');
  row.innerHTML='<div class="who">'+esc(who)+'</div><div class="bubble">'+esc(m.content)+'</div>';
  addMsgActions(row, m, m.role==='user');
  return row;
}
// 各メッセージに「コピー」、自分の発言には「編集」を付ける
function addMsgActions(container, m, canEdit){
  var bar=document.createElement('div'); bar.className='mact';
  var cp=document.createElement('button'); cp.textContent='⧉ コピー';
  cp.onclick=function(){ copyText(m.content, cp); };
  bar.appendChild(cp);
  if(canEdit && m.id){
    var ed=document.createElement('button'); ed.textContent='✏️ 編集';
    ed.onclick=function(){ startEditMsg(container, m); };
    bar.appendChild(ed);
  }
  container.appendChild(bar);
}
function copyText(t, btn){
  var done=function(){ var o=btn.textContent; btn.textContent='✓ コピー'; setTimeout(function(){btn.textContent=o},1200); };
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(done).catch(function(){fallbackCopy(t);done();}); }
  else { fallbackCopy(t); done(); }
}
function fallbackCopy(t){
  var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  try{document.execCommand('copy')}catch(e){} document.body.removeChild(ta);
}
// 自分の発言の編集(文の修正のみ・履歴は消さない)
function startEditMsg(container, m){
  var bubble=container.querySelector('.bubble'); if(!bubble)return;
  var orig=m.content;
  bubble.innerHTML='';
  var ta=document.createElement('textarea'); ta.className='editbox'; ta.value=orig;
  ta.rows=Math.min(10, orig.split(String.fromCharCode(10)).length+1);
  var row=document.createElement('div'); row.className='editrow';
  var save=document.createElement('button'); save.className='primary'; save.textContent='保存';
  var cancel=document.createElement('button'); cancel.textContent='取消';
  row.appendChild(save); row.appendChild(cancel);
  bubble.appendChild(ta); bubble.appendChild(row); ta.focus();
  cancel.onclick=function(){ bubble.textContent=orig; };
  save.onclick=function(){
    var v=ta.value.trim(); if(!v){alert('空にはできません');return;}
    save.disabled=true;
    api('/messages/'+m.id,{method:'PATCH',body:JSON.stringify({content:v})}).then(function(){
      m.content=v; bubble.textContent=v;
    }).catch(function(e){ alert(e.message); save.disabled=false; });
  };
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
  loadFileStrip(id);
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
    // 楽観表示の吹き出しを、id付きの本物(コピー/編集ボタン付き)に差し替える
    if(d.user){ try{ box.replaceChild(msgNode(d.user), row); }catch(e){} }
    box.appendChild(msgNode(d.mentor));
    if(d.monitor) box.appendChild(msgNode(d.monitor));
    box.scrollTop=box.scrollHeight;
    updateBanner(d.stub);
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
      el('fileStrip').style.display='none'; el('fileStrip').innerHTML='';
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
    (c.mentor_note?'<div class="cs" style="color:var(--accent);margin-top:6px">🧭 メンター確認: '+esc(c.mentor_note)+'</div>':'')+
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
  var reason='';
  if(act==='reject'){ reason=prompt('却下する理由(任意・記録に残して同じ案の再提案を防ぎます)',''); if(reason===null)return; }
  var btns=card.querySelectorAll('button'); Array.prototype.forEach.call(btns,function(b){b.disabled=true});
  api('/candidates/'+cid+'/'+act,{method:'POST',body:JSON.stringify({reason:reason})}).then(function(r){
    card.classList.add('done');
    if(act!=='approve'){ card.innerHTML='<div class="ch">🚫 却下事項に記録しました'+(reason?'（理由: '+esc(reason)+'）':'')+'</div>'; return; }
    card.innerHTML='<div class="ch">✅ 決定事項に保存しました (Active)</div>';
    // 憲法 Rule 4: 決定したらすぐ実行に落とせるように
    if(r.memory&&r.memory.id){
      var tb=document.createElement('button'); tb.className='approve'; tb.style.marginTop='8px'; tb.textContent='▶ 実行タスクにする';
      tb.onclick=function(){
        tb.disabled=true; tb.textContent='作成中…';
        api('/decisions/'+r.memory.id+'/task',{method:'POST'}).then(function(tr){
          tb.textContent='✅ タスク作成: '+tr.task.title;
        }).catch(function(e){alert(e.message);tb.disabled=false;tb.textContent='▶ 実行タスクにする'});
      };
      card.appendChild(tb);
    }
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
function openDecisions(){setActiveTab('active');loadDecisions('active')}
el('decClose').onclick=function(){showScreen('chat')};
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
  if(tab==='rejected'){
    var rj=decData.rejected||[];
    if(!rj.length){body.innerHTML='<div class="empty2">却下事項はありません。<br>保存候補を却下すると、理由とともにここに残ります(同じ案の再提案を防ぐため)。</div>';return;}
    body.innerHTML='';
    rj.forEach(function(c){
      var d=document.createElement('div'); d.className='dec arch';
      d.innerHTML='<span class="badge arch">却下</span><span class="dm">'+esc(c.decided_at||c.created_at||'')+'</span>'+
        '<div class="dt">'+esc(c.title||'(無題)')+'</div>'+
        (c.content?'<div class="db">'+esc(c.content)+'</div>':'')+
        (c.reject_reason?'<div class="cs" style="margin-top:6px;color:var(--muted)">却下理由: '+esc(c.reject_reason)+'</div>':'');
      body.appendChild(d);
    });
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
      (m.tags?'<div class="dm" style="margin-top:6px">#'+esc(m.tags).split(',').join(' #')+'</div>':'')+
      '<div class="dm" style="margin-top:6px">タップで詳細(履歴・元チャット)</div>';
    d.style.cursor='pointer';
    d.onclick=function(){loadDecisionDetail(m.id)};
    body.appendChild(d);
  });
}

// ── 決定事項の詳細(実装準備設計書 第8章: 更新履歴・元チャット・関連決定) ──
function loadDecisionDetail(id){
  activatePanel('dec');
  var body=el('decBody');
  body.innerHTML='<div class="empty2">読み込み中…</div>';
  api('/decisions/'+id).then(function(d){
    body.innerHTML='';
    var back=document.createElement('button'); back.textContent='← 一覧に戻る'; back.style.marginBottom='12px';
    back.onclick=function(){setActiveTab(d.status==='archived'?'archived':'active');loadDecisions(d.status==='archived'?'archived':'active')};
    body.appendChild(back);
    var m=d.decision;
    var head=document.createElement('div'); head.className='dec'+(d.status==='archived'?' arch':'');
    head.innerHTML=(d.status==='archived'?'<span class="badge arch">Archived</span>':'<span class="badge active">Active</span>')+
      '<span class="dm">作成: '+esc(m.created_at||'')+'</span>'+
      '<div class="dt" style="font-size:16px">'+esc(m.title||'(無題)')+'</div>'+
      '<div class="db">'+esc(m.content||'')+'</div>'+
      (m.tags?'<div class="dm" style="margin-top:6px">#'+esc(m.tags).split(',').join(' #')+'</div>':'')+
      (m.project?'<div class="dm">プロジェクト: '+esc(m.project)+'</div>':'');
    body.appendChild(head);
    // 更新履歴
    var sec=document.createElement('div'); sec.className='home-sec'; sec.style.marginTop='16px';
    sec.innerHTML='<h3>更新履歴(古い順)</h3>';
    if(d.chain.length<=1){var e1=document.createElement('div');e1.className='hcard';e1.style.color='var(--muted)';e1.style.fontSize='13px';e1.textContent='変更履歴はありません(初版)';sec.appendChild(e1);}
    else d.chain.forEach(function(c,i){
      var r=document.createElement('div'); r.className='dec'+(c.current?'':' arch');
      r.innerHTML='<span class="badge '+(c.current?'active':'arch')+'">'+(c.current?'★現行':'v'+(i+1))+'</span>'+
        '<span class="dm">'+esc(c.created_at)+'</span>'+
        '<div class="dt">'+esc(c.title)+'</div>'+
        (c.reason?'<div class="dm">変更理由: '+esc(c.reason)+'</div>':'')+
        (c.id===m.id?'<div class="dm">(表示中)</div>':'');
      if(c.id!==m.id){r.style.cursor='pointer';r.onclick=function(){loadDecisionDetail(c.id)};}
      sec.appendChild(r);
    });
    body.appendChild(sec);
    // 元チャット
    var sec2=document.createElement('div'); sec2.className='home-sec';
    sec2.innerHTML='<h3>元チャット(作成経緯)</h3>';
    if(d.sourceChat){
      var sc=d.sourceChat;
      sec2.appendChild(hrow('💬 '+sc.title, sc.candidate_created_at, function(){showScreen('chat');openChat(sc.chat_id, sc.title)}));
    } else {var e2=document.createElement('div');e2.className='hcard';e2.style.color='var(--muted)';e2.style.fontSize='13px';e2.textContent='元チャットの記録はありません(会話以外から保存された決定)';sec2.appendChild(e2);}
    body.appendChild(sec2);
    // 実行タスク(憲法 Rule 4: アイデアより実行)
    var sec4=document.createElement('div'); sec4.className='home-sec';
    sec4.innerHTML='<h3>実行タスク</h3>';
    (d.tasks||[]).forEach(function(t){
      var mark = t.status==='done' ? '✅ ' : '⬜ ';
      sec4.appendChild(hrow(mark+t.title, t.status + (t.due_date?' / 期限 '+t.due_date:''), null));
    });
    var tbtn=document.createElement('button'); tbtn.className='primary'; tbtn.textContent='▶ この決定をタスクにする';
    tbtn.style.width='100%'; tbtn.style.marginTop='4px';
    tbtn.onclick=function(){
      tbtn.disabled=true; tbtn.textContent='作成中…';
      api('/decisions/'+id+'/task',{method:'POST'}).then(function(r){
        tbtn.textContent='✅ タスクを作成しました('+esc(r.task.title)+')';
        loadDecisionDetail(id);
      }).catch(function(e){alert(e.message);tbtn.disabled=false;tbtn.textContent='▶ この決定をタスクにする'});
    };
    sec4.appendChild(tbtn);
    var note=document.createElement('div'); note.className='dm'; note.style.marginTop='6px';
    note.textContent='タスクは Dscribe(記録ダッシュボード / Claude の list_tasks)と共有されます';
    sec4.appendChild(note);
    body.appendChild(sec4);
    // 関連決定
    if(d.related.length){
      var sec3=document.createElement('div'); sec3.className='home-sec';
      sec3.innerHTML='<h3>関連決定事項</h3>';
      d.related.forEach(function(r){
        sec3.appendChild(hrow((r.status==='archived'?'(旧) ':'')+r.title,'',function(){loadDecisionDetail(r.id)}));
      });
      body.appendChild(sec3);
    }
  }).catch(function(e){body.innerHTML='<div class="empty2">'+esc(e.message)+'</div>'});
}

// ── 検索(実装準備設計書 第12章: 全体検索 → グループ結果 → 元の場所へ) ──
function runSearch(){
  var q=el('searchInput').value.trim();
  if(!q)return;
  var body=el('searchBody');
  body.innerHTML='<div class="empty2">検索中…</div>';
  api('/search?q='+encodeURIComponent(q)).then(function(d){
    var r=d.results;
    body.innerHTML='';
    var total=r.chats.length+r.decisions.length+r.ailogs.length;
    var sum=document.createElement('div'); sum.className='hcard'; sum.style.marginBottom='14px'; sum.style.fontSize='13px';
    sum.textContent='チャット '+r.chats.length+'件 / 決定事項 '+r.decisions.length+'件 / AI会話 '+r.ailogs.length+'件';
    body.appendChild(sum);
    if(!total){body.appendChild(Object.assign(document.createElement('div'),{className:'empty2',textContent:'見つかりませんでした。'}));return;}
    if(r.chats.length){
      var s1=document.createElement('div'); s1.className='home-sec'; s1.innerHTML='<h3>💬 チャット</h3>';
      r.chats.forEach(function(c){ s1.appendChild(hrow(c.title+' — '+c.snippet, c.created_at, function(){showScreen('chat');openChat(c.chat_id, c.title)})); });
      body.appendChild(s1);
    }
    if(r.decisions.length){
      var s2=document.createElement('div'); s2.className='home-sec'; s2.innerHTML='<h3>📌 決定事項</h3>';
      r.decisions.forEach(function(dd){ s2.appendChild(hrow((dd.status==='archived'?'(旧) ':'')+dd.title+' — '+dd.snippet, dd.created_at, function(){loadDecisionDetail(dd.id)})); });
      body.appendChild(s2);
    }
    if(r.ailogs.length){
      var s3=document.createElement('div'); s3.className='home-sec'; s3.innerHTML='<h3>🗂 AI会話ログ</h3>';
      r.ailogs.forEach(function(a){ s3.appendChild(hrow('🛠 '+a.task+' — '+a.snippet, a.created_at, function(){showScreen('runs')})); });
      body.appendChild(s3);
    }
  }).catch(function(e){body.innerHTML='<div class="empty2">'+esc(e.message)+'</div>'});
}
el('searchBtn').onclick=runSearch;
el('searchInput').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();runSearch()}});
el('searchClose').onclick=function(){showScreen('chat')};

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
    box.scrollTop=box.scrollHeight; updateBanner(d.stub); loadChats();
  }).catch(function(e){var t=el('wtyping');if(t)t.remove();var er=document.createElement('div');er.className='typing';er.textContent='エラー: '+e.message;box.appendChild(er)})
    .then(function(){sending=false;el('sendBtn').disabled=false;el('delegateBtn').disabled=false});
}
el('delegateBtn').onclick=delegate;

// 📋 監視官の節目レポート
function makeReport(){
  if(current==null){alert('先に会話を始めてください');return;}
  var rb=el('reportBtn'); rb.disabled=true;
  var box=el('msgs'); if(box.querySelector('.empty'))box.innerHTML='';
  var note=document.createElement('div'); note.className='typing'; note.id='rtyping'; note.textContent='📋 監視官がレポートを作成中…';
  box.appendChild(note); box.scrollTop=box.scrollHeight;
  api('/chats/'+current+'/report',{method:'POST'}).then(function(r){
    var t=el('rtyping'); if(t)t.remove();
    var mon=document.createElement('div'); mon.className='mon';
    mon.innerHTML='<span class="ml">📋 特命監視官レポート</span>'+esc(r.report.content);
    box.appendChild(mon); box.scrollTop=box.scrollHeight;
  }).catch(function(e){var t=el('rtyping');if(t)t.remove();alert(e.message)}).then(function(){rb.disabled=false});
}
el('reportBtn').onclick=makeReport;

el('runClose').onclick=function(){showScreen('chat')};
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
var ROLE_JA={mentor:'メンター兼司令塔',monitor:'特命監視官',recorder:'記録官',worker:'作業AI群(既定)',worker1:'　└ 作業AI-1',worker2:'　└ 作業AI-2',worker3:'　└ 作業AI-3'};
var DEFAULT_MODELS={anthropic:'claude-sonnet-4-20250514',openai:'gpt-4o',gemini:'gemini-2.5-flash'};
el('setClose').onclick=function(){showScreen('chat')};
var PROV_JA={anthropic:'Anthropic (Claude)',openai:'OpenAI (GPT)',gemini:'Google (Gemini)'};
function keyRow(p, info){
  var box=document.createElement('div'); box.className='role';
  var state = info.set
    ? '✅ 接続中 (…'+esc(info.tail)+(info.source==='db'?' / ⚙️で登録':' / Cloudflare Secret')+')'
    : '— 未接続';
  box.innerHTML='<h4>'+esc(PROV_JA[p]||p)+' <span class="dm" style="font-weight:normal">'+state+'</span></h4>'+
    '<div class="r"><input type="password" placeholder="APIキーを貼り付け" autocomplete="off"></div>'+
    '<button class="save">保存</button>'+
    (info.source==='db'?'<button class="del" style="margin-left:8px;margin-top:8px">削除</button>':'')+
    '<span class="saved" style="display:none">保存しました</span>';
  var inp=box.querySelector('input'), sv=box.querySelector('.saved');
  box.querySelector('.save').onclick=function(){
    var v=inp.value.trim();
    if(!v){alert('APIキーを貼り付けてください');return;}
    api('/keys',{method:'PUT',body:JSON.stringify({provider:p,key:v})}).then(function(){
      inp.value=''; sv.style.display='inline';
      setTimeout(function(){sv.style.display='none'},1500);
      loadRoles(); loadStatus();
    }).catch(function(e){alert(e.message)});
  };
  var del=box.querySelector('.del');
  if(del)del.onclick=function(){
    if(!confirm('このキーを削除しますか？'))return;
    api('/keys',{method:'DELETE',body:JSON.stringify({provider:p})}).then(function(){loadRoles();loadStatus()}).catch(function(e){alert(e.message)});
  };
  return box;
}
// 接続済みプロバイダの「実際に使えるモデル一覧」を取得して datalist に入れる(名前当て不要に)
function loadModelLists(ki){
  ['anthropic','openai','gemini'].forEach(function(p){
    var dl=el('dl-'+p);
    if(!dl){dl=document.createElement('datalist');dl.id='dl-'+p;el('setPanel').appendChild(dl)}
    if(!ki[p]||!ki[p].set)return;
    api('/models?provider='+p).then(function(d){
      if(!d.models||!d.models.length)return;
      dl.innerHTML=d.models.map(function(m){return '<option value="'+esc(m)+'">'}).join('');
    }).catch(function(){});
  });
}
// 💾 バックアップ(オーナーのみ表示。非オーナーは403で静かに非表示)
function loadBackup(){
  var card=el('backupCard'); card.innerHTML='';
  api('/backup').then(function(d){
    var box=document.createElement('div'); box.className='role'; box.style.marginTop='16px';
    var last=d.last;
    var lastLine = last
      ? (last.ok ? '✅ 最終バックアップ: '+esc(last.at)+' ('+esc(String(last.users))+'ユーザー / '+Math.round(last.bytes/1024)+'KB)' : '⚠ 前回: '+esc(last.error||'失敗'))
      : 'まだ実行されていません';
    var setup = d.enabled ? '' :
      '<div class="dm" style="margin-top:8px;line-height:1.7">自動保存を有効にするには: Cloudflare で R2 バケット <b>dscribe-backup</b> を作成 → wrangler.toml の [[r2_buckets]] のコメントを外して再デプロイ。未設定でも毎週の実行記録だけは残ります(📤の手動エクスポートは常に使えます)。</div>';
    box.innerHTML='<h4>💾 バックアップ <span class="dm" style="font-weight:normal">'+(d.enabled?'R2接続済み・毎週月曜に自動実行':'R2未設定')+'</span></h4>'+
      '<div class="dm">'+lastLine+'</div>'+setup+
      '<button class="save" id="backupNow" style="margin-top:10px">今すぐバックアップ</button>'+
      '<hr style="border:none;border-top:1px solid var(--line);margin:14px 0">'+
      '<h4>♻ 復元(バックアップから)</h4>'+
      '<div class="dm" style="margin-bottom:8px">📤でダウンロードしたJSONを選ぶと、中のチャットを<b>追記で</b>復元します(既存データは消しません・オーナーのみ)。</div>'+
      '<input type="file" id="restoreFile" accept="application/json,.json">'+
      '<div id="restoreMsg" class="dm" style="margin-top:8px"></div>';
    card.appendChild(box);
    el('backupNow').onclick=function(){
      el('backupNow').disabled=true; el('backupNow').textContent='実行中…';
      api('/backup',{method:'POST'}).then(function(r){
        alert(r.status.ok ? 'バックアップ完了: '+r.status.location : '実行結果: '+(r.status.error||'失敗'));
        loadBackup();
      }).catch(function(e){alert(e.message);loadBackup()});
    };
    el('restoreFile').onchange=function(){
      var f=el('restoreFile').files[0]; if(!f)return;
      var msg=el('restoreMsg'); msg.textContent='読み込み中…';
      f.text().then(function(txt){
        var backup; try{backup=JSON.parse(txt)}catch(e){msg.textContent='JSONの読み込みに失敗しました';return;}
        api('/restore',{method:'POST',body:JSON.stringify({backup:backup})}).then(function(r){
          var p=r.preview;
          if(!p.found){msg.textContent='このバックアップにあなたのデータが見つかりませんでした';return;}
          if(!confirm('復元プレビュー: チャット'+p.chats+'件 / メッセージ'+p.messages+'件を追記します。よろしいですか？')){msg.textContent='キャンセルしました';return;}
          msg.textContent='復元中…';
          api('/restore',{method:'POST',body:JSON.stringify({backup:backup,confirm:true})}).then(function(rr){
            msg.textContent='✅ 復元しました: チャット'+rr.restored.chats+'件 / メッセージ'+rr.restored.messages+'件';
            loadChats();
          }).catch(function(e){msg.textContent='エラー: '+e.message});
        }).catch(function(e){msg.textContent='エラー: '+e.message});
      });
    };
  }).catch(function(){/* 非オーナー(403)は表示しない */});
}
function loadRoles(){
  loadBackup();
  el('roleList').innerHTML='<div class="empty2">読み込み中…</div>';
  api('/roles').then(function(d){
    var ki=d.keyInfo||{};
    loadModelLists(ki);
    var ksBox=el('keyStatus'); ksBox.innerHTML='APIキー接続状況 — キーはあなた専用の保管庫(D1)に保存され、このURLを知る本人だけが使えます。<br><span style="opacity:.8">Gemini は <b>aistudio.google.com</b> →「Get API key」で無料発行できます(AIzaSy… で始まる文字列)。プロジェクトID(gen-lang-client-…)ではありません。</span>';
    ['gemini','anthropic','openai'].forEach(function(p){ if(ki[p]) ksBox.appendChild(keyRow(p, ki[p])); });
    var list=el('roleList'); list.innerHTML='';
    var roleKeys=d.roleKeys||{};
    function renderRole(r,opt){
      opt=opt||{};
      var box=document.createElement('div'); box.className='role';
      var opts=['anthropic','openai','gemini'].map(function(p){return '<option value="'+p+'"'+(p===r.provider?' selected':'')+'>'+p+'</option>'}).join('');
      var rk=roleKeys[r.role];
      var keyState=rk&&rk.set?'専用キー …'+esc(rk.tail):'共有キーを使用';
      var inh=opt.slot&&!r.explicit?' <span class="dm" style="font-weight:normal">(既定に従う)</span>':'';
      box.innerHTML='<h4>'+esc(ROLE_JA[r.role]||r.role)+inh+'</h4>'+
        '<div class="r"><select>'+opts+'</select><input list="dl-'+esc(r.provider)+'" value="'+esc(r.model)+'" placeholder="モデル名(候補から選択可)"></div>'+
        '<button class="save">モデル保存</button><span class="saved" style="display:none">保存しました</span>'+
        '<div class="dm" style="margin-top:10px">専用APIキー(任意・空欄なら共有キー) — <b>'+keyState+'</b></div>'+
        '<div class="r"><input type="password" class="kinp" placeholder="この役割だけの専用キー" autocomplete="off"></div>'+
        '<button class="savek">キー保存</button>'+(rk&&rk.set?'<button class="delk" style="margin-left:8px">クリア</button>':'')+'<span class="savedk" style="display:none">保存しました</span>';
      var sel=box.querySelector('select'), inp=box.querySelector('input'), sv=box.querySelector('.saved');
      // プロバイダを切り替えたらモデル名も既定に置き換え、候補リストも切り替える
      sel.onchange=function(){inp.value=DEFAULT_MODELS[sel.value]||'';inp.setAttribute('list','dl-'+sel.value)};
      box.querySelector('.save').onclick=function(){
        api('/roles',{method:'PUT',body:JSON.stringify({role:r.role,provider:sel.value,model:inp.value})}).then(function(){
          sv.style.display='inline'; setTimeout(function(){sv.style.display='none'},1500);
          if(opt.slot)loadRoles(); // 作業AIスロットは「既定に従う」表示を更新するため再描画
        }).catch(function(e){alert(e.message)});
      };
      var kinp=box.querySelector('.kinp'), svk=box.querySelector('.savedk');
      box.querySelector('.savek').onclick=function(){
        var v=kinp.value.trim(); if(!v){alert('専用キーを貼り付けてください(不要なら空のままでOK)');return;}
        api('/rolekeys',{method:'PUT',body:JSON.stringify({role:r.role,key:v})}).then(function(){
          kinp.value=''; svk.style.display='inline'; setTimeout(function(){svk.style.display='none'},1200); loadRoles();
        }).catch(function(e){alert(e.message)});
      };
      var delk=box.querySelector('.delk');
      if(delk)delk.onclick=function(){
        if(!confirm('この役割の専用キーをクリアしますか？(共有キーに戻ります)'))return;
        api('/rolekeys',{method:'DELETE',body:JSON.stringify({role:r.role})}).then(function(){loadRoles()}).catch(function(e){alert(e.message)});
      };
      list.appendChild(box);
    }
    d.roles.forEach(function(r){renderRole(r)});
    (d.workerSlots||[]).forEach(function(r){renderRole(r,{slot:true})});
  }).catch(function(e){el('roleList').innerHTML='<div class="empty2">'+esc(e.message)+'</div>'});
}

// ── 画面切替(ナビ: スマホ=下タブ / PC=左レール) ──
var PANELS={home:'homePanel',dec:'decPanel',runs:'runPanel',set:'setPanel',search:'searchPanel',saved:'savedPanel',files:'filesPanel'};
// パネルの表示だけ切り替える(ローダーは呼ばない)。詳細ビューが再描画レースで消えるのを防ぐ。
function activatePanel(scr){
  Object.keys(PANELS).forEach(function(k){el(PANELS[k]).classList.toggle('open',k===scr)});
  Array.prototype.forEach.call(document.querySelectorAll('#osnav button'),function(b){b.classList.toggle('active',b.getAttribute('data-scr')===scr)});
}
function showScreen(scr){
  activatePanel(scr);
  if(scr==='home')loadHome();
  if(scr==='dec')openDecisions();
  if(scr==='runs')loadRuns();
  if(scr==='set')loadRoles();
  if(scr==='saved')loadSaved();
  if(scr==='files')loadFiles();
  if(scr==='search')setTimeout(function(){el('searchInput').focus()},50);
}
el('savedClose').onclick=function(){showScreen('chat')};
el('filesClose').onclick=function(){showScreen('chat')};

// ── ファイル/写真(D1保存・写真はブラウザ側で縮小) ──
// 画像は canvas で最大1600pxに縮小してJPEG化。それ以外はそのまま(サーバ側で上限拒否)。
function fileToPayload(file){
  return new Promise(function(resolve,reject){
    var fr=new FileReader();
    fr.onerror=function(){reject(new Error('ファイルを読み込めませんでした'));};
    if(file.type.indexOf('image/')===0){
      // CSP(img-src 'self' data:)のため blob: は使わず data: URL から縮小する
      fr.onload=function(){
        var img=new Image();
        img.onload=function(){
          var max=1600, w=img.width, h=img.height;
          if(w>max||h>max){ if(w>=h){h=Math.round(h*max/w);w=max;}else{w=Math.round(w*max/h);h=max;} }
          var cv=document.createElement('canvas'); cv.width=w; cv.height=h;
          cv.getContext('2d').drawImage(img,0,0,w,h);
          var q=0.82, out=cv.toDataURL('image/jpeg',q);
          while(out.length>900000 && q>0.4){ q-=0.15; out=cv.toDataURL('image/jpeg',q); }
          resolve({name:(file.name||'photo').replace(/\.[^.]+$/,'')+'.jpg', mime:'image/jpeg', data:out.replace(/^data:[^,]*,/,'')});
        };
        img.onerror=function(){reject(new Error('画像を読み込めませんでした'));};
        img.src=String(fr.result);
      };
      fr.readAsDataURL(file);
    } else {
      fr.onload=function(){ resolve({name:file.name||'file', mime:file.type||'application/octet-stream', data:String(fr.result).replace(/^data:[^,]*,/,'')}); };
      fr.readAsDataURL(file);
    }
  });
}
function uploadFile(file){
  if(!file)return;
  fileToPayload(file).then(function(p){
    if(p.data.length>900000){alert('ファイルが大きすぎます(約500KBまで)。写真は自動縮小しても大きい場合や、大きな書類・動画は入れられません。');return null;}
    return api('/files',{method:'POST',body:JSON.stringify({name:p.name,mime:p.mime,data:p.data,chat_id:current})});
  }).then(function(r){ if(r&&r.file){ if(current)loadFileStrip(current); if(el('filesPanel').classList.contains('open'))loadFiles(); } }).catch(function(e){alert(e.message);});
}
function fileHref(f){return API+'/files/'+f.id;}
function fileChip(f){
  var href=fileHref(f);
  if(f.mime.indexOf('image/')===0) return '<a class="fchip" href="'+href+'" target="_blank" rel="noopener"><img src="'+href+'" alt="'+esc(f.name)+'"></a>';
  return '<a class="fchip doc" href="'+href+'" target="_blank" rel="noopener">📄 '+esc(f.name)+'</a>';
}
// チャット下の添付ストリップ(このチャットのファイル)
function loadFileStrip(chatId){
  var strip=el('fileStrip'); if(!strip||!chatId)return;
  api('/files?chat='+chatId).then(function(d){
    if(!d.files.length){strip.style.display='none';strip.innerHTML='';return;}
    strip.style.display='flex'; strip.innerHTML=d.files.map(fileChip).join('');
  }).catch(function(){strip.style.display='none';});
}
// 📎 ファイルタブ(全ファイル一覧・削除)
function loadFiles(){
  var body=el('filesBody'); body.innerHTML='<div class="empty2">読み込み中…</div>';
  api('/files').then(function(d){
    if(!d.files.length){body.innerHTML='<div class="empty2">まだファイルはありません。<br>チャットの 📎、または上の「＋」から写真・書類を追加できます。</div>';return;}
    body.innerHTML='';
    d.files.forEach(function(f){
      var href=fileHref(f), isImg=f.mime.indexOf('image/')===0;
      var card=document.createElement('div'); card.className='frow';
      card.innerHTML=(isImg?'<a href="'+href+'" target="_blank" rel="noopener"><img class="fthumb" src="'+href+'"></a>':'<a class="fthumb" href="'+href+'" target="_blank" rel="noopener">📄</a>')+
        '<div class="fmeta"><a href="'+href+'" target="_blank" rel="noopener">'+esc(f.name)+'</a><div class="dm">'+Math.round(f.size/1024)+'KB · '+esc(f.created_at||'')+'</div></div>'+
        '<button class="fdel">削除</button>';
      card.querySelector('.fdel').onclick=function(){
        if(!confirm('このファイルを削除しますか？'))return;
        api('/files/'+f.id,{method:'DELETE'}).then(function(){loadFiles(); if(current)loadFileStrip(current);}).catch(function(e){alert(e.message);});
      };
      body.appendChild(card);
    });
  }).catch(function(e){body.innerHTML='<div class="empty2">'+esc(e.message)+'</div>';});
}
el('attachBtn').onclick=function(){ if(!current){alert('先にチャットを開いてください');return;} el('fileInput').click(); };
el('fileInput').onchange=function(){ var f=el('fileInput').files[0]; el('fileInput').value=''; uploadFile(f); };
el('filesAdd').onclick=function(){ el('fileInput').click(); };
function renderMemCard(m, box){
  var d=document.createElement('div'); d.className='dec';
  var kindJa = m.kind==='note'?'📝 メモ':'💭 記憶';
  d.innerHTML='<span class="badge active">'+kindJa+'</span><span class="dm">'+esc(m.created_at||'')+(m.project?' / '+esc(m.project):'')+'</span>'+
    (m.title?'<div class="dt">'+esc(m.title)+'</div>':'')+
    '<div class="db">'+esc(m.content||'')+'</div>'+
    (m.tags?'<div class="dm" style="margin-top:6px">#'+esc(m.tags).split(',').join(' #')+'</div>':'');
  box.appendChild(d);
}
function loadSaved(){
  var body=el('savedBody'); body.innerHTML='<div class="empty2">読み込み中…</div>';
  var q=el('savedInput').value.trim();
  api('/saved'+(q?'?q='+encodeURIComponent(q):'')).then(function(d){
    body.innerHTML='';
    if(!d.saved.length){body.innerHTML='<div class="empty2">保存データはまだありません。<br>会話で決定以外の記憶・メモ(kind=memory / note)が保存されるとここに出ます。</div>';return;}
    d.saved.forEach(function(m){renderMemCard(m, body)});
  }).catch(function(e){body.innerHTML='<div class="empty2">'+esc(e.message)+'</div>'});
}
el('savedBtn').onclick=loadSaved;
el('savedInput').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();loadSaved()}});
Array.prototype.forEach.call(document.querySelectorAll('#osnav button'),function(b){
  b.onclick=function(){showScreen(b.getAttribute('data-scr'))};
});

// ── ホーム画面(実装準備設計書 第4章) ──
function hrow(title,meta,onclick){
  var d=document.createElement('div'); d.className='hrow';
  d.innerHTML='<div class="ht">'+esc(title)+'</div><div class="hm">'+esc(meta||'')+'</div>';
  if(onclick){d.style.cursor='pointer';d.onclick=onclick}
  return d;
}
// プロジェクト詳細ビュー(技術第7章: プロジェクト→チャット群・決定・保存データ)
function openProject(name){
  activatePanel('home');
  var body=el('homeBody'); body.innerHTML='<div class="empty2">読み込み中…</div>';
  Promise.all([api('/chats?project='+encodeURIComponent(name)),api('/decisions'),api('/saved?project='+encodeURIComponent(name)),api('/projects?name='+encodeURIComponent(name))]).then(function(rs){
    var chats=rs[0].chats, decs=(rs[1].active||[]).filter(function(m){return m.project===name}), saved=rs[2].saved, st=rs[3].status||{status:'active',final_report:''};
    body.innerHTML='';
    var back=document.createElement('button'); back.textContent='← ホームに戻る'; back.style.marginBottom='12px'; back.onclick=loadHome;
    body.appendChild(back);
    var h=document.createElement('h2'); h.textContent='📁 '+name+(st.status==='archived'?' ✅完了':''); h.style.margin='0 0 12px'; h.style.fontSize='18px'; body.appendChild(h);
    // 最終報告(完了済みなら表示)
    if(st.status==='archived'&&st.final_report){
      var fr=document.createElement('div'); fr.className='mon'; fr.style.alignSelf='stretch'; fr.style.maxWidth='100%'; fr.style.marginBottom='12px';
      fr.innerHTML='<span class="ml">📄 最終報告</span>'+esc(st.final_report);
      body.appendChild(fr);
    }
    // 完了 / 再開ボタン(運用第9章)
    var pbtn=document.createElement('button'); pbtn.style.width='100%'; pbtn.style.marginBottom='12px';
    if(st.status==='archived'){ pbtn.textContent='↩ このプロジェクトを再開'; pbtn.onclick=function(){api('/projects',{method:'POST',body:JSON.stringify({project:name,action:'reopen'})}).then(function(){openProject(name)}).catch(function(e){alert(e.message)})}; }
    else { pbtn.className='primary'; pbtn.textContent='✅ プロジェクトを完了(最終報告を作成)'; pbtn.onclick=function(){if(!confirm('このプロジェクトを完了しますか？現行の決定から最終報告を作成します。'))return;pbtn.disabled=true;pbtn.textContent='最終報告を作成中…';api('/projects',{method:'POST',body:JSON.stringify({project:name,action:'complete'})}).then(function(){openProject(name)}).catch(function(e){alert(e.message);pbtn.disabled=false})}; }
    body.appendChild(pbtn);
    var s1=document.createElement('div'); s1.className='home-sec'; s1.innerHTML='<h3>チャット</h3>';
    if(!chats.length){s1.innerHTML+='<div class="hcard" style="color:var(--muted);font-size:13px">このプロジェクトのチャットはありません</div>';}
    chats.forEach(function(c){s1.appendChild(hrow(c.title,(c.message_count||0)+'件',function(){showScreen('chat');openChat(c.id,c.title)}))});
    body.appendChild(s1);
    var s2=document.createElement('div'); s2.className='home-sec'; s2.innerHTML='<h3>現行の決定事項</h3>';
    if(!decs.length){s2.innerHTML+='<div class="hcard" style="color:var(--muted);font-size:13px">決定はありません</div>';}
    decs.forEach(function(m){s2.appendChild(hrow(m.title||m.content.slice(0,40),m.created_at,function(){loadDecisionDetail(m.id)}))});
    body.appendChild(s2);
    var s3=document.createElement('div'); s3.className='home-sec'; s3.innerHTML='<h3>保存データ</h3>';
    if(!saved.length){s3.innerHTML+='<div class="hcard" style="color:var(--muted);font-size:13px">保存データはありません</div>';}
    saved.forEach(function(m){renderMemCard(m, s3)});
    body.appendChild(s3);
  }).catch(function(e){body.innerHTML='<div class="empty2">'+esc(e.message)+'</div>'});
}

function loadHome(){
  var body=el('homeBody');
  body.innerHTML='<div class="empty2">読み込み中…</div>';
  Promise.all([api('/roles'),api('/decisions'),api('/chats'),api('/projects'),api('/notifications')]).then(function(rs){
    var roles=rs[0], dec=rs[1], chats=rs[2].chats, projects=rs[3].projects, notif=rs[4];
    body.innerHTML='';
    // 1. AI稼働状況
    var sec1=document.createElement('div'); sec1.className='home-sec';
    sec1.innerHTML='<h3>AI稼働状況</h3>';
    var card=document.createElement('div'); card.className='hcard';
    roles.roles.forEach(function(r){
      var live=roles.keys[r.provider];
      var row=document.createElement('div'); row.className='stat';
      row.innerHTML='<span>'+esc(ROLE_JA[r.role]||r.role)+'</span><span class="sm">'+esc(r.provider+' / '+r.model)+'</span>'+
        '<span class="badge '+(live?'run':'stub')+'">'+(live?'稼働中':'スタブ')+'</span>';
      card.appendChild(row);
    });
    sec1.appendChild(card); body.appendChild(sec1);
    // 2. 未承認の保存候補(承認待ち)
    var sec2=document.createElement('div'); sec2.className='home-sec';
    sec2.innerHTML='<h3>未承認の決定事項(承認待ち '+dec.pending.length+'件)</h3>';
    if(!dec.pending.length){var e2=document.createElement('div');e2.className='hcard';e2.style.color='var(--muted)';e2.style.fontSize='13px';e2.textContent='承認待ちはありません';sec2.appendChild(e2);}
    dec.pending.forEach(function(c){var cd=document.createElement('div');cd.className='card';cd.innerHTML=cardHtml(c);wireCard(cd,c);sec2.appendChild(cd)});
    body.appendChild(sec2);
    // 2.5 プロジェクト(実装準備設計書 第4章: ホームにプロジェクト一覧)
    if(projects&&projects.length){
      var secP=document.createElement('div'); secP.className='home-sec';
      secP.innerHTML='<h3>プロジェクト</h3>';
      projects.forEach(function(p){
        secP.appendChild(hrow('📁 '+p.name, (p.os_chats||0)+'会話 / 決定'+(p.active_decisions||0), function(){openProject(p.name)}));
      });
      body.appendChild(secP);
    }
    // 3. 最近のチャット
    var sec3=document.createElement('div'); sec3.className='home-sec';
    sec3.innerHTML='<h3>最近のチャット</h3>';
    if(!chats.length){var e3=document.createElement('div');e3.className='hcard';e3.style.color='var(--muted)';e3.style.fontSize='13px';e3.textContent='まだ会話がありません';sec3.appendChild(e3);}
    chats.slice(0,5).forEach(function(c){
      sec3.appendChild(hrow(c.title,(c.message_count||0)+'件',function(){showScreen('chat');openChat(c.id,c.title)}));
    });
    body.appendChild(sec3);
    // 4. 最近の決定事項(Active)
    var sec4=document.createElement('div'); sec4.className='home-sec';
    sec4.innerHTML='<h3>最近の決定事項</h3>';
    if(!dec.active.length){var e4=document.createElement('div');e4.className='hcard';e4.style.color='var(--muted)';e4.style.fontSize='13px';e4.textContent='有効な決定はまだありません';sec4.appendChild(e4);}
    dec.active.slice(0,5).forEach(function(m){
      sec4.appendChild(hrow(m.title||m.content.slice(0,40),m.created_at,function(){showScreen('dec')}));
    });
    body.appendChild(sec4);
    // 5. 通知(監視官の警告 + 節目レポート) — 実装準備第3-4章
    var warns=(notif.warnings||[]).filter(function(w){return /\[(deviation|loop|contradiction|drift)\]/.test(w.content)});
    var reps=notif.reports||[];
    var sec5=document.createElement('div'); sec5.className='home-sec';
    sec5.innerHTML='<h3>🔔 通知（監視官）</h3>';
    if(!warns.length&&!reps.length){var e5=document.createElement('div');e5.className='hcard';e5.style.color='var(--muted)';e5.style.fontSize='13px';e5.textContent='新しい通知はありません';sec5.appendChild(e5);}
    reps.slice(0,3).forEach(function(r){
      var d=document.createElement('div'); d.className='mon'; d.style.alignSelf='stretch'; d.style.maxWidth='100%'; d.style.marginBottom='8px';
      d.innerHTML='<span class="ml">📋 節目レポート · '+esc(r.created_at)+'</span>'+esc(r.content);
      sec5.appendChild(d);
    });
    warns.slice(0,4).forEach(function(w){
      var d=document.createElement('div'); d.className='mon'; d.style.alignSelf='stretch'; d.style.maxWidth='100%'; d.style.marginBottom='8px';
      d.innerHTML='<span class="ml">🛡 警告 · '+esc(w.created_at)+'</span>'+esc(w.content);
      sec5.appendChild(d);
    });
    body.appendChild(sec5);
  }).catch(function(e){body.innerHTML='<div class="empty2">'+esc(e.message)+'</div>'});
}

// ── PWA: サービスワーカー登録 + インストールボタン ──
if('serviceWorker' in navigator){ navigator.serviceWorker.register('/os/sw.js',{scope:'/os/'}).catch(function(){}); }
var deferredPrompt=null;
window.addEventListener('beforeinstallprompt',function(e){
  e.preventDefault(); deferredPrompt=e;
  el('installBtn').style.display='block';
});
el('installBtn').onclick=function(){
  if(!deferredPrompt)return;
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(function(){deferredPrompt=null;el('installBtn').style.display='none'});
};
window.addEventListener('appinstalled',function(){el('installBtn').style.display='none'});

renderMessages([]); loadStatus(); loadChats(); showScreen('home');
</script>
</body>
</html>`;
}
