// Web ダッシュボード (単一HTML / 依存なし)
// トークンは URL パス (/app/<token>) から取得し、/api/<token>/... を呼ぶ。

export function renderApp(): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧠</text></svg>">
<title>Dscribe – Second Brain</title>
<style>
:root{
  --bg:#f5f6f8; --panel:#ffffff; --text:#1a1d21; --sub:#6b7280; --line:#e5e7eb;
  --accent:#6c5ce7; --accent2:#00b894; --danger:#e74c3c; --chip:#eef0f4;
}
@media (prefers-color-scheme: dark){
  :root{ --bg:#101216; --panel:#181b21; --text:#e8eaed; --sub:#9aa0a6; --line:#2a2e36; --chip:#232730; }
}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;font-size:14px;line-height:1.6}
header{display:flex;align-items:center;gap:10px;padding:14px 20px;background:var(--panel);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
header h1{font-size:17px;margin:0} header .sub{color:var(--sub);font-size:12px}
nav{display:flex;gap:4px;padding:10px 16px;flex-wrap:wrap}
nav button{border:1px solid var(--line);background:var(--panel);color:var(--text);padding:7px 14px;border-radius:20px;cursor:pointer;font-size:13px}
nav button.active{background:var(--accent);border-color:var(--accent);color:#fff}
main{max-width:900px;margin:0 auto;padding:8px 16px 60px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0}
.card h2{font-size:15px;margin:0 0 10px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px;text-align:center}
.stat b{display:block;font-size:24px;color:var(--accent)}
.stat span{color:var(--sub);font-size:12px}
ul.plain{list-style:none;margin:0;padding:0}
ul.plain li{padding:9px 4px;border-bottom:1px solid var(--line);display:flex;gap:8px;align-items:flex-start}
ul.plain li:last-child{border-bottom:none}
.grow{flex:1;min-width:0}
.meta{color:var(--sub);font-size:12px}
.chip{background:var(--chip);border-radius:10px;padding:1px 8px;font-size:11px;color:var(--sub);white-space:nowrap}
.chip.high{color:#fff;background:var(--danger)}
.chip.done{color:#fff;background:var(--accent2)}
input,select,textarea{background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:14px;font-family:inherit}
textarea{width:100%;min-height:70px;resize:vertical}
.row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.row input[type=text]{flex:1;min-width:160px}
button.primary{background:var(--accent);color:#fff;border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:14px}
button.ghost{background:none;border:none;color:var(--sub);cursor:pointer;font-size:13px;padding:4px}
button.ghost:hover{color:var(--danger)}
.snippet{color:var(--sub);font-size:12px;overflow:hidden;text-overflow:ellipsis}
pre.code{background:var(--chip);border-radius:8px;padding:12px;overflow-x:auto;font-size:12px;white-space:pre-wrap;word-break:break-all}
.copybtn{float:right}
progress{width:100%;height:10px}
.viewer{white-space:pre-wrap;max-height:60vh;overflow-y:auto;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;font-size:13px}
dialog{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:12px;max-width:800px;width:92vw;padding:16px}
dialog::backdrop{background:rgba(0,0,0,.5)}
.ok{color:var(--accent2)} .err{color:var(--danger)}
a{color:var(--accent)}
.empty{color:var(--sub);text-align:center;padding:16px}
</style>
</head>
<body>
<header><span style="font-size:22px">🧠</span><div><h1>Dscribe <span class="sub">– Second Brain for Claude</span></h1></div><div class="sub" id="acct" style="margin-left:auto"></div></header>
<nav id="nav"></nav>
<main id="main"><div class="empty">読み込み中…</div></main>
<dialog id="dlg"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b id="dlgTitle"></b><button class="ghost" onclick="document.getElementById('dlg').close()">✕ 閉じる</button></div><div class="viewer" id="dlgBody"></div><div style="margin-top:8px;text-align:center"><button class="primary" id="dlgMore" style="display:none">続きを読む</button></div></dialog>
<script>
"use strict";
var TOKEN = location.pathname.split("/")[2] || "";
var API = "/api/" + TOKEN;
var TABS = [["home","🏠 ホーム"],["tasks","✅ タスク"],["memories","💭 記憶"],["chats","💬 チャット履歴"],["search","🔍 検索"],["import","📥 取り込み"],["setup","⚙️ 設定"]];
var current = "home";

function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function api(path, opts){
  return fetch(API + path, opts).then(function(r){
    return r.json().catch(function(){ return {error:"HTTP "+r.status}; }).then(function(j){
      if(!r.ok) throw new Error(j.error || ("HTTP "+r.status));
      return j;
    });
  });
}
function el(id){ return document.getElementById(id); }
function main(html){ el("main").innerHTML = html; }

function renderNav(){
  el("nav").innerHTML = TABS.map(function(t){
    return '<button class="'+(current===t[0]?"active":"")+'" onclick="go(\\''+t[0]+'\\')">'+t[1]+'</button>';
  }).join("");
}
function go(tab){ current = tab; renderNav(); VIEWS[tab](); }

// ---------- ホーム ----------
function viewHome(){
  api("/overview").then(function(d){
    var c = d.counts;
    var html = '<div class="stats">'
      + '<div class="stat"><b>'+c.memories+'</b><span>記憶</span></div>'
      + '<div class="stat"><b>'+c.open_tasks+'</b><span>未完了タスク</span></div>'
      + '<div class="stat"><b>'+c.conversations+'</b><span>取込チャット</span></div>'
      + '<div class="stat"><b>'+c.messages+'</b><span>メッセージ</span></div>'
      + '</div>';
    html += '<div class="card"><h2>✅ 未完了タスク</h2>' + (d.tasks.length ? '<ul class="plain">' + d.tasks.map(taskLi).join("") + '</ul>' : '<div class="empty">未完了タスクはありません</div>') + '</div>';
    html += '<div class="card"><h2>💭 最近の記憶</h2>' + (d.memories.length ? '<ul class="plain">' + d.memories.map(memLi).join("") + '</ul>' : '<div class="empty">まだ記憶がありません。Claudeとの会話で自動保存されるほか、このページからも追加できます</div>') + '</div>';
    main(html);
  }).catch(showErr);
}

// ---------- タスク ----------
function taskLi(t){
  var chips = "";
  if(t.priority==="high") chips += ' <span class="chip high">高</span>';
  if(t.status==="done") chips += ' <span class="chip done">完了</span>';
  else if(t.status==="doing") chips += ' <span class="chip">進行中</span>';
  if(t.due_date) chips += ' <span class="chip">期限 '+esc(t.due_date)+'</span>';
  if(t.project) chips += ' <span class="chip">'+esc(t.project)+'</span>';
  return '<li><input type="checkbox" '+(t.status==="done"?"checked":"")+' onchange="toggleTask('+t.id+',this.checked)">'
    + '<div class="grow"><div>'+(t.status==="done"?"<s>":"")+esc(t.title)+(t.status==="done"?"</s>":"")+chips+'</div>'
    + (t.description?'<div class="snippet">'+esc(t.description.slice(0,150))+'</div>':"")
    + '</div><button class="ghost" onclick="delTask('+t.id+')">🗑</button></li>';
}
function viewTasks(){
  var f = (window.__taskFilter = window.__taskFilter || "active");
  api("/tasks?status=" + f).then(function(d){
    var html = '<div class="card"><h2>タスクを追加</h2>'
      + '<div class="row"><input type="text" id="tTitle" placeholder="タスク名"><input type="date" id="tDue">'
      + '<select id="tPri"><option value="normal">普通</option><option value="high">高</option><option value="low">低</option></select>'
      + '<input type="text" id="tProj" placeholder="プロジェクト(任意)" style="max-width:150px">'
      + '<button class="primary" onclick="addTask()">追加</button></div></div>';
    html += '<div class="card"><h2>タスク一覧 '
      + '<select onchange="window.__taskFilter=this.value;viewTasks()">'
      + ["active","open","doing","done","all"].map(function(s){ return '<option value="'+s+'" '+(f===s?"selected":"")+'>'+({active:"未完了",open:"未着手",doing:"進行中",done:"完了",all:"すべて"})[s]+'</option>'; }).join("")
      + '</select></h2>'
      + (d.tasks.length ? '<ul class="plain">' + d.tasks.map(taskLi).join("") + '</ul>' : '<div class="empty">タスクはありません</div>') + '</div>';
    main(html);
  }).catch(showErr);
}
function addTask(){
  var title = el("tTitle").value.trim(); if(!title) return;
  api("/tasks", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({title:title, due_date:el("tDue").value, priority:el("tPri").value, project:el("tProj").value})})
    .then(viewTasks).catch(alertErr);
}
function toggleTask(id, done){
  api("/tasks/"+id, {method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({status: done?"done":"open"})})
    .then(function(){ if(current==="tasks") viewTasks(); else viewHome(); }).catch(alertErr);
}
function delTask(id){
  if(!confirm("このタスクを削除しますか?")) return;
  api("/tasks/"+id, {method:"DELETE"}).then(viewTasks).catch(alertErr);
}

// ---------- 記憶 ----------
function memLi(m){
  var kindLabel = {memory:"記憶",decision:"決定",note:"ノート"}[m.kind] || m.kind;
  return '<li><div class="grow">'
    + '<div><span class="chip">'+esc(kindLabel)+'</span> '+(m.project?'<span class="chip">'+esc(m.project)+'</span> ':"")
    + (m.title?'<b>'+esc(m.title)+'</b> — ':"") + esc(m.content.slice(0,200)) + '</div>'
    + '<div class="meta">'+esc((m.created_at||"").slice(0,16))+(m.tags?' / '+esc(m.tags):"")+' <a href="javascript:void(0)" onclick="openItem(\\'memory\\','+m.id+')">全文</a></div>'
    + '</div><button class="ghost" onclick="delMem('+m.id+')">🗑</button></li>';
}
function viewMemories(){
  api("/memories?limit=100").then(function(d){
    var html = '<div class="card"><h2>記憶を追加</h2>'
      + '<textarea id="mContent" placeholder="覚えておきたいこと(Claudeとの会話中は自動保存されます)"></textarea>'
      + '<div class="row"><select id="mKind"><option value="memory">記憶</option><option value="decision">決定事項</option><option value="note">ノート</option></select>'
      + '<input type="text" id="mTitle" placeholder="タイトル(任意)"><input type="text" id="mProj" placeholder="プロジェクト(任意)" style="max-width:150px">'
      + '<button class="primary" onclick="addMem()">保存</button></div></div>';
    html += '<div class="card"><h2>保存済みの記憶(最新100件)</h2>'
      + (d.memories.length ? '<ul class="plain">' + d.memories.map(memLi).join("") + '</ul>' : '<div class="empty">まだありません</div>') + '</div>';
    main(html);
  }).catch(showErr);
}
function addMem(){
  var content = el("mContent").value.trim(); if(!content) return;
  api("/memories", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({content:content, kind:el("mKind").value, title:el("mTitle").value, project:el("mProj").value, source:"manual"})})
    .then(viewMemories).catch(alertErr);
}
function delMem(id){
  if(!confirm("この記憶を削除しますか?")) return;
  api("/memories/"+id, {method:"DELETE"}).then(viewMemories).catch(alertErr);
}

// ---------- チャット履歴 ----------
function viewChats(){
  api("/conversations").then(function(d){
    var html = '<div class="card"><h2>取込済みチャット ('+d.conversations.length+'件)</h2>';
    if(d.conversations.length){
      html += '<ul class="plain">' + d.conversations.map(function(c){
        return '<li><div class="grow"><a href="javascript:void(0)" onclick="openItem(\\'chat\\','+c.id+')">'+esc(c.name||"(無題)")+'</a>'
          + (c.project_name?' <span class="chip">'+esc(c.project_name)+'</span>':"")
          + '<div class="meta">'+c.message_count+'メッセージ / '+esc((c.updated_at||"").slice(0,16))+'</div></div>'
          + '<button class="ghost" onclick="delConv('+c.id+')">🗑</button></li>';
      }).join("") + '</ul>';
    } else {
      html += '<div class="empty">まだチャット履歴がありません。「📥 取り込み」タブから claude.ai のエクスポートを取り込むと、過去の全チャットを Claude が検索できるようになります。</div>';
    }
    html += '</div>';
    main(html);
  }).catch(showErr);
}
function delConv(id){
  if(!confirm("このチャット履歴を削除しますか?")) return;
  api("/conversations/"+id, {method:"DELETE"}).then(viewChats).catch(alertErr);
}

// ---------- 検索 ----------
function viewSearch(){
  main('<div class="card"><h2>🔍 横断検索(記憶・タスク・チャット全文)</h2>'
    + '<div class="row"><input type="text" id="q" placeholder="キーワード(スペース区切りでAND検索)" onkeydown="if(event.key===\\'Enter\\')doSearch()"><button class="primary" onclick="doSearch()">検索</button></div>'
    + '<div id="results"></div></div>');
  el("q").focus();
}
function hitLi(h){
  var link = h.type==="chat" ? '<a href="javascript:void(0)" onclick="openItem(\\'chat\\','+h.id+')">'+esc(h.title)+'</a>'
    : h.type==="memory" ? '<a href="javascript:void(0)" onclick="openItem(\\'memory\\','+h.id+')">'+esc(h.title)+'</a>' : esc(h.title);
  return '<li><div class="grow">'+link+' <span class="chip">'+esc(h.extra)+'</span>'
    + '<div class="snippet">'+esc(h.snippet)+'</div><div class="meta">'+esc((h.date||"").slice(0,16))+'</div></div></li>';
}
function doSearch(){
  var q = el("q").value.trim(); if(!q) return;
  el("results").innerHTML = '<div class="empty">検索中…</div>';
  api("/search?q=" + encodeURIComponent(q)).then(function(d){
    var r = d.results, html = "";
    if(r.memories.length) html += '<h2>💭 記憶</h2><ul class="plain">'+r.memories.map(hitLi).join("")+'</ul>';
    if(r.tasks.length) html += '<h2>✅ タスク</h2><ul class="plain">'+r.tasks.map(hitLi).join("")+'</ul>';
    if(r.chats.length) html += '<h2>💬 チャット</h2><ul class="plain">'+r.chats.map(hitLi).join("")+'</ul>';
    el("results").innerHTML = html || '<div class="empty">該当なし</div>';
  }).catch(function(e){ el("results").innerHTML = '<div class="err">'+esc(e.message)+'</div>'; });
}

// ---------- 全文ビューア ----------
function openItem(type, id, offset){
  api("/item?type="+type+"&id="+id+"&offset="+(offset||0)).then(function(d){
    el("dlgTitle").textContent = type + "#" + id;
    if(offset) el("dlgBody").textContent += "\\n" + d.text;
    else el("dlgBody").textContent = d.text;
    var more = el("dlgMore");
    if(d.nextOffset !== null && d.nextOffset !== undefined){
      more.style.display = ""; more.onclick = function(){ openItem(type, id, d.nextOffset); };
    } else more.style.display = "none";
    var dlg = el("dlg"); if(!dlg.open) dlg.showModal();
  }).catch(alertErr);
}

// ---------- 取り込み ----------
function viewImport(){
  main('<div class="card"><h2>📥 claude.ai の過去チャットを取り込む</h2>'
    + '<ol style="padding-left:20px;line-height:2">'
    + '<li>claude.ai → 設定 → <b>プライバシー</b> → <b>データをエクスポート</b></li>'
    + '<li>メールで届く zip をダウンロードして解凍</li>'
    + '<li>中の <b>conversations.json</b> を下で選択(projects.json があればそれも)</li></ol>'
    + '<div class="row"><label>conversations.json: <input type="file" id="fConv" accept=".json,application/json"></label></div>'
    + '<div class="row"><label>projects.json(任意): <input type="file" id="fProj" accept=".json,application/json"></label></div>'
    + '<div class="row"><button class="primary" onclick="doImport()">取り込み開始</button></div>'
    + '<progress id="prog" value="0" max="100" style="display:none"></progress>'
    + '<div id="impLog"></div>'
    + '<p class="meta">※同じチャットを再取り込みすると上書き(最新化)されます。ブラウザ上で分割してアップロードするので大きなファイルでもOKです。</p></div>');
}
function logImp(msg, cls){ el("impLog").innerHTML += '<div class="'+(cls||"")+'">'+esc(msg)+'</div>'; }
function doImport(){
  var fc = el("fConv").files[0], fp = el("fProj").files[0];
  if(!fc && !fp){ alert("ファイルを選択してください"); return; }
  el("impLog").innerHTML = "";
  var chain = Promise.resolve();
  if(fp) chain = chain.then(function(){ return importProjects(fp); });
  if(fc) chain = chain.then(function(){ return importConversations(fc); });
  chain.then(function(){ logImp("✅ すべて完了しました。Claude のチャットから検索できるようになりました。","ok"); })
       .catch(function(e){ logImp("❌ エラー: " + e.message, "err"); });
}
function importProjects(file){
  return file.text().then(function(txt){ return api("/import/projects", {method:"POST", headers:{"Content-Type":"application/json"}, body: txt}); })
    .then(function(r){ logImp("projects.json: プロジェクト"+r.imported+"件 / ドキュメント"+r.messages+"件を取り込みました"); });
}
function importConversations(file){
  return file.text().then(function(txt){
    var data = JSON.parse(txt);
    var list = Array.isArray(data) ? data : (data && data.conversations) || [];
    if(!list.length) throw new Error("conversations.json に会話が見つかりません");
    logImp("会話 " + list.length + "件を取り込みます…");
    var prog = el("prog"); prog.style.display = ""; prog.value = 0; prog.max = list.length;
    var CHUNK = 10, i = 0, totals = {imported:0, updated:0, messages:0};
    function next(){
      if(i >= list.length){
        prog.style.display = "none";
        logImp("conversations.json: 新規"+totals.imported+"件 / 更新"+totals.updated+"件 / メッセージ"+totals.messages+"件");
        return Promise.resolve();
      }
      var chunk = list.slice(i, i + CHUNK);
      return api("/import/conversations", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(chunk)})
        .then(function(r){
          totals.imported += r.imported; totals.updated += r.updated; totals.messages += r.messages;
          if(r.errors && r.errors.length) r.errors.forEach(function(e){ logImp("⚠ " + e, "err"); });
          i += CHUNK; prog.value = Math.min(i, list.length);
          return next();
        });
    }
    return next();
  });
}

// ---------- 設定 ----------
function viewSetup(){
  var mcpUrl = location.origin + "/mcp/" + TOKEN;
  var snippet = "【Dscribe(第二の脳)コネクタの使い方】\\n"
    + "- 新しい会話を始めたら、本題に入る前に recall_context を1回実行して、進行中のタスクと直近の記憶を確認する。\\n"
    + "- 過去の会話・決定・「前に話したこと」に言及されたら、search で検索してから答える。\\n"
    + "- 会話中に重要な情報(決定事項、好み、進捗、新しいタスク)が出たら、その都度 save_memory / create_task で保存する。毎回許可を求めなくてよい。\\n"
    + "- タスクの完了・変更が話題に出たら update_task で反映する。";
  var htmlStr = '<div class="card"><h2>🔌 Claude コネクタ設定</h2>'
    + '<p>① claude.ai → 設定 → <b>コネクタ</b> → <b>カスタムコネクタを追加</b> で以下のURLを登録:</p>'
    + '<pre class="code" id="mcpUrl">'+esc(mcpUrl)+'</pre>'
    + '<button class="primary" onclick="copyText(\\'mcpUrl\\')">URLをコピー</button>'
    + '<p class="meta">※このURLにはあなた専用の秘密トークンが含まれています。他人に共有しないでください。</p>'
    + '</div>'
    + '<div class="card"><h2>📝 おすすめ: Claude に自動で使わせる設定</h2>'
    + '<p>claude.ai → 設定 → プロフィール →「Claudeへの共通指示(パーソナル設定)」に以下を貼り付けると、毎回言わなくても Claude が自動で記憶の保存・呼び出しをします:</p>'
    + '<pre class="code" id="snippet">'+esc(snippet)+'</pre>'
    + '<button class="primary" onclick="copyText(\\'snippet\\')">指示文をコピー</button></div>'
    + '<div class="card"><h2>💻 Claude Code から接続する場合</h2>'
    + '<pre class="code" id="ccCmd">claude mcp add --transport http dscribe '+esc(mcpUrl)+'</pre>'
    + '<button class="primary" onclick="copyText(\\'ccCmd\\')">コマンドをコピー</button></div>'
    + '<div class="card"><h2>📦 データのエクスポート</h2>'
    + '<p><a href="'+API+'/export" download="dscribe-export.json">自分の全データをJSONでダウンロード</a>(バックアップ用)</p></div>';
  if(ME && ME.is_owner){
    htmlStr += '<div class="card"><h2>👥 メンバー管理(オーナー専用)</h2>'
      + (ME.join_url
        ? '<p>この<b>招待リンク</b>を知っている人だけが新規登録できます。登録した人のデータは完全に独立していて、あなたからも見えません:</p>'
          + '<pre class="code" id="joinUrl">'+esc(ME.join_url)+'</pre>'
          + '<button class="primary" onclick="copyText(\\'joinUrl\\')">招待リンクをコピー</button>'
        : '<p class="err">INVITE_CODE が未設定のため、新規登録は現在無効です(setup.sh を実行して設定してください)</p>')
      + '<div id="members" style="margin-top:14px">メンバーを読み込み中…</div></div>';
  }
  main(htmlStr);
  if(ME && ME.is_owner) loadMembers();
}
function loadMembers(){
  api("/users").then(function(d){
    el("members").innerHTML = '<ul class="plain">' + d.users.map(function(u){
      return '<li><div class="grow"><b>'+esc(u.email)+'</b>'+(u.is_owner?' <span class="chip done">オーナー</span>':'')
        + '<div class="meta">登録: '+esc((u.created_at||"").slice(0,10))+' / 記憶'+u.memory_count+' / タスク'+u.task_count+' / チャット'+u.conversation_count+'</div>'
        + '<div id="rst'+u.id+'"></div></div>'
        + '<button class="ghost" title="アクセスURLを再発行" onclick="resetMember('+u.id+')">🔑</button>'
        + (u.is_owner ? '' : '<button class="ghost" title="削除" onclick="delMember('+u.id+')">🗑</button>')
        + '</li>';
    }).join("") + '</ul>'
    + '<p class="meta">🔑 = アクセスURLの再発行(URLを無くした人に新しいURLを渡す)。再発行すると古いURLは使えなくなります。</p>';
  }).catch(function(e){ el("members").innerHTML = '<div class="err">'+esc(e.message)+'</div>'; });
}
function resetMember(id){
  var self = ME && id === ME.id;
  if(!confirm(self
    ? "自分のアクセスURLを再発行しますか?(今のURLは使えなくなり、新しいURLに自動で移動します。コネクタのURLも登録し直しが必要です)"
    : "このメンバーのアクセスURLを再発行しますか?(古いURLは使えなくなります)")) return;
  api("/users/"+id+"/reset", {method:"POST"}).then(function(r){
    if(self){ location.href = r.app_url; return; }
    el("rst"+id).innerHTML = '<div class="meta">新しいダッシュボードURL(本人にだけ渡してください):</div>'
      + '<pre class="code" id="rstu'+id+'">'+esc(r.app_url)+'</pre>'
      + '<button class="primary" onclick="copyText(\\'rstu'+id+'\\')">コピー</button>';
  }).catch(alertErr);
}
function delMember(id){
  if(!confirm("このメンバーとそのデータ(記憶・タスク・チャット履歴)を完全に削除しますか?取り消せません。")) return;
  api("/users/"+id, {method:"DELETE"}).then(loadMembers).catch(alertErr);
}
function copyText(id){
  navigator.clipboard.writeText(el(id).textContent).then(function(){ alert("コピーしました"); });
}

function showErr(e){ main('<div class="card err">エラー: '+esc(e.message)+'<br><span class="meta">URLのトークンが正しいか確認してください</span></div>'); }
function alertErr(e){ alert("エラー: " + e.message); }

var VIEWS = {home:viewHome, tasks:viewTasks, memories:viewMemories, chats:viewChats, search:viewSearch, import:viewImport, setup:viewSetup};
var ME = null;
renderNav();
api("/me").then(function(me){
  ME = me;
  el("acct").textContent = me.email + (me.is_owner ? " 👑" : "");
  viewHome();
}).catch(showErr);
</script>
</body>
</html>`;
}

export function renderLanding(): string {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Dscribe</title>
<style>body{font-family:sans-serif;background:#101216;color:#e8eaed;display:grid;place-items:center;height:100vh;margin:0;text-align:center;padding:16px}</style></head>
<body><div><div style="font-size:48px">🧠</div><h1>Dscribe – Second Brain</h1>
<p>稼働中です。ダッシュボードへは自分専用のURL(<code>/app/&lt;トークン&gt;</code>)でアクセスしてください。</p>
<p style="color:#9aa0a6">新規登録には招待リンクが必要です。URLを無くした場合は管理者(招待した人)に再発行を依頼してください。</p></div></body></html>`;
}

export function renderJoinPage(): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧠</text></svg>">
<title>Dscribe – アカウント登録</title>
<style>
:root{ --bg:#f5f6f8; --panel:#ffffff; --text:#1a1d21; --sub:#6b7280; --line:#e5e7eb; --accent:#6c5ce7; --accent2:#00b894; --danger:#e74c3c; --chip:#eef0f4; }
@media (prefers-color-scheme: dark){ :root{ --bg:#101216; --panel:#181b21; --text:#e8eaed; --sub:#9aa0a6; --line:#2a2e36; --chip:#232730; } }
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;font-size:15px;line-height:1.7;display:grid;place-items:center;min-height:100vh;padding:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:28px;max-width:560px;width:100%}
h1{font-size:20px;margin:0 0 4px} .sub{color:var(--sub);font-size:13px}
input{width:100%;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:12px;font-size:15px;margin:14px 0 10px}
button.primary{width:100%;background:var(--accent);color:#fff;border:none;border-radius:10px;padding:12px;font-size:15px;cursor:pointer}
pre.code{background:var(--chip);border-radius:8px;padding:12px;overflow-x:auto;font-size:12px;white-space:pre-wrap;word-break:break-all}
button.copy{background:none;border:1px solid var(--line);color:var(--text);border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px;margin-bottom:10px}
.err{color:var(--danger);margin-top:8px} .ok{color:var(--accent2)}
.warn{background:var(--chip);border-radius:10px;padding:10px 12px;font-size:13px;margin-top:14px}
a{color:var(--accent)}
</style>
</head>
<body>
<div class="card">
  <div style="font-size:40px;text-align:center">🧠</div>
  <h1>Dscribe – Second Brain に登録</h1>
  <div class="sub">あなた専用の「第二の脳」を作成します。データは完全に独立していて、他の人(管理者を含む)からは見えません。</div>
  <div id="form">
    <input type="email" id="email" placeholder="メールアドレス" autocomplete="email">
    <button class="primary" onclick="join()">登録する</button>
    <div id="msg"></div>
  </div>
  <div id="done" style="display:none"></div>
</div>
<script>
"use strict";
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function el(id){ return document.getElementById(id); }
function copyText(id){ navigator.clipboard.writeText(el(id).textContent).then(function(){ alert("コピーしました"); }); }
document.getElementById("email").addEventListener("keydown", function(e){ if(e.key === "Enter") join(); });
function join(){
  var email = el("email").value.trim();
  if(!email){ el("msg").innerHTML = '<div class="err">メールアドレスを入力してください</div>'; return; }
  el("msg").textContent = "登録中…";
  fetch(location.pathname, { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({email:email}) })
    .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error || ("HTTP "+r.status)); return j; }); })
    .then(function(r){
      el("form").style.display = "none";
      var d = el("done");
      d.style.display = "";
      d.innerHTML = '<p class="ok"><b>✅ 登録完了!</b>(' + esc(r.email) + ')</p>'
        + '<p><b>① あなたのダッシュボード</b>(ブックマーク必須):</p>'
        + '<pre class="code" id="appUrl">' + esc(r.app_url) + '</pre>'
        + '<button class="copy" onclick="copyText(\\'appUrl\\')">コピー</button>'
        + '<p><b>② Claude コネクタ用URL</b>(claude.ai → 設定 → コネクタ → カスタムコネクタを追加):</p>'
        + '<pre class="code" id="mcpUrl">' + esc(r.mcp_url) + '</pre>'
        + '<button class="copy" onclick="copyText(\\'mcpUrl\\')">コピー</button>'
        + '<div class="warn">⚠ この2つのURLがあなたの<b>ログイン情報そのもの</b>です。必ずブックマークし、他人に教えないでください。無くした場合は管理者(招待した人)に再発行を依頼できます。</div>'
        + '<p style="margin-top:14px"><a href="' + esc(r.app_url) + '">→ ダッシュボードを開く</a>(Claudeへの設定方法は「⚙️ 設定」タブにあります)</p>';
    })
    .catch(function(e){ el("msg").innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
}
</script>
</body>
</html>`;
}
