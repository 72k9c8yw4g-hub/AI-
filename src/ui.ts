// Web ダッシュボード (単一HTML / 依存なし)
// トークンは URL パス (/app/<token>) から取得し、/api/<token>/... を呼ぶ。

export function renderApp(): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23c9a45c' stroke-width='1.6'><circle cx='12' cy='12' r='8.5'/><circle cx='12' cy='12' r='2.6' fill='%23c9a45c'/></svg>">
<title>Dscribe – Second Brain</title>
<style>
:root{
  --bg:#17150f;--panel:#1e1b13;--panel2:#252118;--panel3:#2e2818;
  --line:#342f22;--line-soft:#272219;
  --text:#ece4d3;--sub:#a99f89;--faint:#746a56;
  --accent:#c9a45c;--accent2:#dcbd7e;--accent-soft:rgba(201,164,92,.12);--accent-line:rgba(201,164,92,.40);
  --ok:#93a06a;--ok-soft:rgba(147,160,106,.15);--danger:#c66a4a;--danger-soft:rgba(198,106,74,.14);
  --chip:#252017;
  --serif:'Hiragino Mincho ProN','Hiragino Mincho Pro','YuMincho','Yu Mincho','Songti SC',serif;
  --sans:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Noto Sans JP',system-ui,sans-serif;
  --r-sm:8px;--r:11px;--r-lg:15px;
  --sh-sm:0 1px 2px rgba(0,0,0,.35);--sh:0 8px 22px -8px rgba(0,0,0,.55);--sh-lg:0 20px 50px -16px rgba(0,0,0,.65);
  --tap:.16s cubic-bezier(.4,0,.2,1);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
  background-image:radial-gradient(1100px 560px at 84% -14%,rgba(201,164,92,.09),transparent 60%),radial-gradient(820px 460px at -10% 4%,rgba(147,160,106,.045),transparent 56%);
  background-attachment:fixed;
  font-family:var(--sans);
  font-size:14px;line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;letter-spacing:.002em}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:#2a2f3e;border-radius:9px;border:2px solid transparent;background-clip:padding-box}
::-webkit-scrollbar-thumb:hover{background:#39405280}
header{display:flex;align-items:center;gap:11px;padding:14px 20px;padding-top:max(14px,env(safe-area-inset-top));background:rgba(15,17,24,.72);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--line-soft);position:sticky;top:0;z-index:5}
header>div{min-width:0}
header h1{font-family:var(--serif);font-size:17.5px;margin:0;font-weight:700;letter-spacing:.02em;white-space:nowrap}
header .sub{color:var(--sub);font-size:12px;font-weight:500}
#acct{margin-left:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#osLink{text-decoration:none;background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:7px 14px;font-size:12.5px;font-weight:600;color:var(--text);white-space:nowrap;flex:0 0 auto;transition:background var(--tap),border-color var(--tap),transform var(--tap)}
#osLink:hover{background:var(--panel3);border-color:var(--accent-line);transform:translateY(-1px);text-decoration:none}
@media(max-width:620px){
  header{gap:9px;padding:12px 14px}
  header h1 .sub{display:none}
  #acct{font-size:11px;max-width:40vw}
  #osLink{padding:7px 11px;font-size:12px}
}
nav{display:flex;gap:7px;padding:14px 16px 6px;flex-wrap:wrap;max-width:900px;margin:0 auto}
nav button{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--panel2);color:var(--sub);padding:8px 15px;border-radius:999px;cursor:pointer;font-size:13px;font-weight:600;transition:color var(--tap),background var(--tap),border-color var(--tap),transform var(--tap),box-shadow var(--tap)}
.brand-mark{width:22px;height:22px;color:var(--accent);flex:0 0 auto}
nav button:hover{color:var(--text);background:var(--panel3);border-color:#2f3547}
nav button.active{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent2)}
nav button:active{transform:translateY(1px)}
nav button:focus-visible{outline:none;box-shadow:0 0 0 3px var(--accent-soft),0 0 0 1px var(--accent-line)}
main{max-width:900px;margin:0 auto;padding:8px 16px 80px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r-lg);padding:18px;margin:14px 0;box-shadow:var(--sh-sm)}
.card h2{font-family:var(--serif);font-size:16px;margin:0 0 13px;font-weight:700;letter-spacing:.01em;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ic{width:1em;height:1em;display:inline-block;vertical-align:-.14em;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto}
#osLink .ic{width:.9em;height:.9em}
.card.err{border-color:rgba(240,100,110,.35);color:var(--danger)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin:14px 0}
.stat{background:linear-gradient(165deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:var(--r-lg);padding:16px 14px;text-align:center;box-shadow:var(--sh-sm);transition:transform var(--tap),border-color var(--tap)}
.stat:hover{transform:translateY(-2px);border-color:var(--accent-line)}
.stat b{display:block;font-family:var(--serif);font-size:31px;font-weight:700;letter-spacing:0;line-height:1.1;color:var(--accent2)}
.stat span{color:var(--sub);font-size:12px;font-weight:500}
ul.plain{list-style:none;margin:0;padding:0}
ul.plain li{padding:11px 8px;border-bottom:1px solid var(--line-soft);display:flex;gap:9px;align-items:flex-start;border-radius:8px;transition:background var(--tap)}
ul.plain li:hover{background:var(--panel2)}
ul.plain li:last-child{border-bottom:none}
.grow{flex:1;min-width:0}
.meta{color:var(--sub);font-size:12px}
.chip{display:inline-block;background:var(--chip);border:1px solid var(--line-soft);border-radius:999px;padding:2px 9px;font-size:11px;color:var(--sub);white-space:nowrap;font-weight:600}
.chip.high{color:var(--danger);background:var(--danger-soft);border-color:rgba(240,100,110,.28)}
.chip.done{color:var(--ok);background:var(--ok-soft);border-color:rgba(67,214,160,.26)}
input,select,textarea{background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:9px 12px;font-size:14px;font-family:inherit;transition:border-color var(--tap),box-shadow var(--tap)}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--accent-line);box-shadow:0 0 0 3px var(--accent-soft)}
textarea{width:100%;min-height:70px;resize:vertical;line-height:1.55}
.row{display:flex;gap:9px;flex-wrap:wrap;margin:10px 0;align-items:center}
.row input[type=text]{flex:1;min-width:160px}
button.primary{background:var(--accent);color:#1c1810;border:1px solid transparent;border-radius:10px;padding:9px 17px;cursor:pointer;font-size:14px;font-weight:700;box-shadow:var(--sh-sm);transition:filter var(--tap),transform var(--tap),box-shadow var(--tap)}
button.primary:hover{filter:brightness(1.07);transform:translateY(-1px)}
button.primary:active{transform:translateY(1px)}
button.primary:focus-visible{outline:none;box-shadow:0 0 0 3px var(--accent-soft),0 0 0 1px var(--accent-line)}
button.ghost{background:none;border:none;color:var(--sub);cursor:pointer;font-size:13px;padding:5px;border-radius:7px;transition:color var(--tap),background var(--tap)}
button.ghost:hover{color:var(--danger);background:var(--danger-soft)}
.snippet{color:var(--sub);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
pre.code{background:var(--panel2);border:1px solid var(--line-soft);border-radius:var(--r);padding:13px;overflow-x:auto;font-size:12px;white-space:pre-wrap;word-break:break-all;line-height:1.6;color:#d6dae6}
.copybtn{float:right}
progress{width:100%;height:10px;border:none;border-radius:6px;overflow:hidden;background:var(--panel2)}
progress::-webkit-progress-bar{background:var(--panel2);border-radius:6px}
progress::-webkit-progress-value{background:var(--accent);border-radius:6px}
progress::-moz-progress-bar{background:var(--accent);border-radius:6px}
.viewer{white-space:pre-wrap;max-height:60vh;overflow-y:auto;background:var(--panel2);border:1px solid var(--line-soft);border-radius:var(--r);padding:14px;font-size:13px;line-height:1.7}
dialog{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:var(--r-lg);max-width:800px;width:92vw;padding:18px;box-shadow:var(--sh-lg)}
dialog::backdrop{background:rgba(4,5,9,.6);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.ok{color:var(--ok)} .err{color:var(--danger)}
a{color:var(--accent2);text-decoration:none}
a:hover{text-decoration:underline}
.empty{color:var(--sub);text-align:center;padding:22px 16px;line-height:1.8}
.oldmem{opacity:.5}
a.btnlike{display:inline-block;background:var(--accent);color:#1c1810;border-radius:10px;padding:9px 15px;font-size:13px;font-weight:700;text-decoration:none;box-shadow:var(--sh-sm);transition:filter var(--tap),transform var(--tap)}
a.btnlike:hover{filter:brightness(1.07);transform:translateY(-1px);text-decoration:none}
</style>
</head>
<body>
<header><svg class="brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none"/></svg><div><h1>Dscribe <span class="sub">– Second Brain for Claude</span></h1></div><div class="sub" id="acct"></div><a id="osLink" href="#"><svg class="ic" viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4 10.5 13.5"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/></svg> 意思決定OS</a></header>
<nav id="nav"></nav>
<main id="main"><div class="empty">読み込み中…</div></main>
<dialog id="dlg"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><b id="dlgTitle"></b><button class="ghost" onclick="document.getElementById('dlg').close()">✕ 閉じる</button></div><div class="viewer" id="dlgBody"></div><div style="margin-top:8px;text-align:center"><button class="primary" id="dlgMore" style="display:none">続きを読む</button></div></dialog>
<script>
"use strict";
var TOKEN = location.pathname.split("/")[2] || "";
var API = "/api/" + TOKEN;
var TABS = [["home","home","ホーム"],["tasks","check","タスク"],["memories","note","記憶"],["chats","chat","チャット履歴"],["search","search","検索"],["import","imp","取り込み"],["export","exp","エクスポート"],["setup","set","設定"]];
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
// 統一SVGラインアイコン(絵文字は使わない)
var ICONS={
home:'<path d="M3 10.6 12 3.2l9 7.4"/><path d="M5.2 9.6V20a1 1 0 0 0 1 1h11.6a1 1 0 0 0 1-1V9.6"/><path d="M9.6 21v-6.2h4.8V21"/>',
check:'<circle cx="12" cy="12" r="8.6"/><path d="m8.4 12.2 2.6 2.6 4.6-5"/>',
note:'<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><line x1="8" y1="8.5" x2="16" y2="8.5"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="15.5" x2="13" y2="15.5"/>',
chat:'<path d="M20.5 15.2a1.9 1.9 0 0 1-1.9 1.9H8l-4.5 3.6V4.9A1.9 1.9 0 0 1 5.4 3h13.2a1.9 1.9 0 0 1 1.9 1.9z"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/>',
imp:'<path d="M12 3.5v9"/><path d="m8 9 4 4 4-4"/><path d="M4.5 15v3.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V15"/>',
exp:'<path d="M12 14.5v-9"/><path d="m8 9 4-4 4 4"/><path d="M4.5 15v3.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V15"/>',
set:'<line x1="20" y1="7.5" x2="10" y2="7.5"/><line x1="6" y1="7.5" x2="4" y2="7.5"/><line x1="20" y1="16.5" x2="14" y2="16.5"/><line x1="10" y1="16.5" x2="4" y2="16.5"/><circle cx="8" cy="7.5" r="2.2"/><circle cx="12" cy="16.5" r="2.2"/>',
external:'<path d="M14 4h6v6"/><path d="M20 4 10.5 13.5"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
key:'<circle cx="7.5" cy="15.5" r="3.6"/><path d="m10.1 13 8.4-8.4"/><path d="m14.6 8.4 2.5 2.5"/><path d="m17.6 5.4 2.5 2.5"/>',
trash:'<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>'
};
function svg(name,cls){ return '<svg class="ic'+(cls?" "+cls:"")+'" viewBox="0 0 24 24" aria-hidden="true">'+(ICONS[name]||"")+'</svg>'; }

function renderNav(){
  el("nav").innerHTML = TABS.map(function(t){
    return '<button class="'+(current===t[0]?"active":"")+'" onclick="go(\\''+t[0]+'\\')">'+svg(t[1])+' '+t[2]+'</button>';
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
    html += '<div class="card"><h2>未完了タスク</h2>' + (d.tasks.length ? '<ul class="plain">' + d.tasks.map(taskLi).join("") + '</ul>' : '<div class="empty">未完了タスクはありません</div>') + '</div>';
    html += '<div class="card"><h2>プロジェクト</h2>' + (d.projects.length ? '<ul class="plain">' + d.projects.map(projLi).join("") + '</ul>' : '<div class="empty">まだありません。記憶やタスクにプロジェクト名を付けると自動で作られます</div>') + '</div>';
    html += '<div class="card"><h2>最近の記憶</h2>' + (d.memories.length ? '<ul class="plain">' + d.memories.map(memLi).join("") + '</ul>' : '<div class="empty">まだ記憶がありません。Claudeとの会話で自動保存されます</div>') + '</div>';
    main(html);
  }).catch(showErr);
}

// ---------- プロジェクト知識ベース ----------
function projLi(p){
  return '<li><div class="grow"><a href="javascript:void(0)" onclick="viewProject(decodeURIComponent(\\''+encodeURIComponent(p.name)+'\\'))"><b>'+esc(p.name)+'</b></a>'
    + (p.description?'<div class="snippet">'+esc(p.description.slice(0,100))+'</div>':"")
    + '<div class="meta">記憶'+p.memory_count+' / 未完了タスク'+p.open_tasks+' / チャット'+p.conversation_count+'</div></div></li>';
}
function viewProject(name){
  api("/overview?project=" + encodeURIComponent(name)).then(function(d){
    var html = '<div style="margin:10px 0"><button class="ghost" onclick="go(\\'home\\')">← ホーム</button></div>';
    html += '<div class="card"><h2>'+esc(name)+'</h2>'
      + (d.brief ? '<div style="white-space:pre-wrap">'+esc(d.brief)+'</div>' : '<div class="empty">概要はまだありません</div>')
      + '<p class="meta">概要は Claude が管理します。会話で「'+esc(name)+' の概要を◯◯に更新して」と頼むと書き換わります。</p>'
      + '</div>';
    html += '<div class="card"><h2>現行の決定事項</h2>' + (d.decisions&&d.decisions.length ? '<ul class="plain">'+d.decisions.map(memLi).join("")+'</ul>' : '<div class="empty">まだありません(決定が変わった場合、旧版は自動で履歴になります)</div>') + '</div>';
    html += '<div class="card"><h2>未完了タスク</h2>' + (d.tasks.length ? '<ul class="plain">'+d.tasks.map(taskLi).join("")+'</ul>' : '<div class="empty">未完了タスクはありません</div>') + '</div>';
    html += '<div class="card"><h2>最近の記憶</h2>' + (d.memories.length ? '<ul class="plain">'+d.memories.map(memLi).join("")+'</ul>' : '<div class="empty">まだありません</div>') + '</div>';
    html += '<div class="card"><h2>このプロジェクトのチャット</h2>' + (d.recentConvs&&d.recentConvs.length
      ? '<ul class="plain">'+d.recentConvs.map(function(c){
          return '<li><div class="grow"><a href="javascript:void(0)" onclick="openItem(\\'chat\\','+c.id+')">'+esc(c.name||"(無題)")+'</a>'
            + '<div class="meta">'+c.message_count+'メッセージ / '+esc((c.updated_at||"").slice(0,16))+'</div></div></li>';
        }).join("")+'</ul>'
      : '<div class="empty">まだありません(取り込み時にプロジェクト名が一致すると紐づきます)</div>') + '</div>';
    main(html);
  }).catch(showErr);
}
// ---------- エクスポート ----------
function expBtn(label, query, fname){
  return '<a class="btnlike" href="'+API+'/export'+query+'" download="'+fname+'">'+label+'</a>';
}
function viewExport(){
  api("/projects").then(function(d){
    var html = '<div class="card"><h2>データのエクスポート</h2>'
      + '<p>「第二の脳」の中身を JSON でダウンロードできます(バックアップ・引っ越し用)。チャット履歴はメッセージ全文つきです。</p>'
      + '<h2 style="margin-top:14px">全体</h2>'
      + '<div class="row">'+expBtn("全データ","","dscribe-all.json")+'</div>'
      + '<h2 style="margin-top:14px">カテゴリ別</h2>'
      + '<div class="row">'
      + expBtn("記憶","?type=memories","dscribe-memories.json")
      + expBtn("タスク","?type=tasks","dscribe-tasks.json")
      + expBtn("チャット履歴","?type=conversations","dscribe-conversations.json")
      + expBtn("プロジェクト一覧","?type=projects","dscribe-projects.json")
      + '</div>'
      + '<h2 style="margin-top:14px">プロジェクト単位(記憶+タスク+チャット)</h2>'
      + (d.projects.length
        ? '<div class="row">'+d.projects.map(function(p){
            return expBtn(esc(p.name),"?project="+encodeURIComponent(p.name),"dscribe-"+encodeURIComponent(p.name)+".json");
          }).join("")+'</div>'
        : '<div class="empty">プロジェクトはまだありません</div>')
      + '</div>';
    main(html);
  }).catch(showErr);
}

// ---------- タスク (閲覧専用: 編集は Claude との会話で) ----------
function taskLi(t){
  var mark = t.status==="done" ? "✓" : t.status==="doing" ? "◐" : "○";
  var chips = "";
  if(t.priority==="high") chips += ' <span class="chip high">高</span>';
  if(t.status==="done") chips += ' <span class="chip done">完了</span>';
  else if(t.status==="doing") chips += ' <span class="chip">進行中</span>';
  if(t.due_date) chips += ' <span class="chip">期限 '+esc(t.due_date)+'</span>';
  if(t.project) chips += ' <span class="chip">'+esc(t.project)+'</span>';
  return '<li><span>'+mark+'</span>'
    + '<div class="grow"><div>'+(t.status==="done"?"<s>":"")+esc(t.title)+(t.status==="done"?"</s>":"")+chips+'</div>'
    + (t.description?'<div class="snippet">'+esc(t.description.slice(0,150))+'</div>':"")
    + '</div></li>';
}
function viewTasks(){
  var f = (window.__taskFilter = window.__taskFilter || "active");
  api("/tasks?status=" + f).then(function(d){
    var html = '<div class="card"><h2>タスク一覧 '
      + '<select onchange="window.__taskFilter=this.value;viewTasks()">'
      + ["active","open","doing","done","all"].map(function(s){ return '<option value="'+s+'" '+(f===s?"selected":"")+'>'+({active:"未完了",open:"未着手",doing:"進行中",done:"完了",all:"すべて"})[s]+'</option>'; }).join("")
      + '</select></h2>'
      + (d.tasks.length ? '<ul class="plain">' + d.tasks.map(taskLi).join("") + '</ul>' : '<div class="empty">タスクはありません</div>')
      + '<p class="meta">'+READONLY_NOTE+'</p></div>';
    main(html);
  }).catch(showErr);
}

// ---------- 記憶 ----------
function memLi(m){
  var kindLabel = {memory:"記憶",decision:"決定",note:"ノート"}[m.kind] || m.kind;
  var badges = '<span class="chip">'+esc(kindLabel)+'</span> ';
  if(m.source==="chat") badges += '<span class="chip" title="Claudeが会話から自動保存">自動</span> ';
  else if(m.source && m.source!=="manual") badges += '<span class="chip" title="別のAIが保存">'+esc(m.source)+'</span> ';
  if(m.superseded_by_id) badges += '<span class="chip">旧版 → #'+m.superseded_by_id+'</span> ';
  else if(m.supersedes_id) badges += '<span class="chip done">更新版</span> ';
  return '<li'+(m.superseded_by_id?' class="oldmem"':'')+'><div class="grow">'
    + '<div>'+badges+(m.project?'<span class="chip">'+esc(m.project)+'</span> ':"")
    + (m.title?'<b>'+esc(m.title)+'</b> — ':"") + esc(m.content.slice(0,200)) + '</div>'
    + '<div class="meta">'+esc((m.created_at||"").slice(0,16))+(m.tags?' / '+esc(m.tags):"")+' <a href="javascript:void(0)" onclick="openItem(\\'memory\\','+m.id+')">全文</a></div>'
    + '</div></li>';
}
function viewMemories(){
  api("/memories?limit=100").then(function(d){
    var html = '<div class="card"><h2>保存済みの記憶(最新100件)</h2>'
      + (d.memories.length ? '<ul class="plain">' + d.memories.map(memLi).join("") + '</ul>' : '<div class="empty">まだありません。Claudeとの会話で自動保存されます</div>')
      + '<p class="meta">'+READONLY_NOTE+' 例:「memory#12 消して」「◯◯の件、△△に変更して覚えて」</p></div>';
    main(html);
  }).catch(showErr);
}

// ---------- チャット履歴 (閲覧専用) ----------
function viewChats(){
  api("/conversations").then(function(d){
    var html = '<div class="card"><h2>取込済みチャット ('+d.conversations.length+'件)</h2>';
    if(d.conversations.length){
      html += '<ul class="plain">' + d.conversations.map(function(c){
        return '<li><div class="grow"><a href="javascript:void(0)" onclick="openItem(\\'chat\\','+c.id+')">'+esc(c.name||"(無題)")+'</a>'
          + (c.project_name?' <span class="chip">'+esc(c.project_name)+'</span>':"")
          + '<div class="meta">'+c.message_count+'メッセージ / '+esc((c.updated_at||"").slice(0,16))+'</div></div></li>';
      }).join("") + '</ul>';
    } else {
      html += '<div class="empty">まだチャット履歴がありません。「取り込み」タブから claude.ai のエクスポートを取り込むと、過去の全チャットを Claude が検索できるようになります。</div>';
    }
    html += '</div>';
    main(html);
  }).catch(showErr);
}

// ---------- 検索 ----------
function viewSearch(){
  main('<div class="card"><h2>横断検索(記憶・タスク・チャット全文)</h2>'
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
    if(r.memories.length) html += '<h2>記憶</h2><ul class="plain">'+r.memories.map(hitLi).join("")+'</ul>';
    if(r.tasks.length) html += '<h2>タスク</h2><ul class="plain">'+r.tasks.map(hitLi).join("")+'</ul>';
    if(r.chats.length) html += '<h2>チャット</h2><ul class="plain">'+r.chats.map(hitLi).join("")+'</ul>';
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
  main('<div class="card"><h2>claude.ai の過去チャットを取り込む</h2>'
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
  chain.then(function(){ logImp("すべて完了しました。Claude のチャットから検索できるようになりました。","ok"); })
       .catch(function(e){ logImp("エラー: " + e.message, "err"); });
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
          if(r.errors && r.errors.length) r.errors.forEach(function(e){ logImp("・ " + e, "err"); });
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
    + "- 新しい会話では本題の前に recall_context を1回実行し、進行中のタスクと直近の記憶を確認する。\\n"
    + "- 「前に話した」「この前決めた」「あの件」が出たら、推測せず search で検索してから答える。\\n"
    + "- 次のシグナルが出たら、毎回許可を求めずその場で保存する:\\n"
    + "  ・決定(「〜に決めた」「〜で行こう」) → save_memory を kind=decision で\\n"
    + "  ・好み・属性(「〜が好き」「普段は〜」) → save_memory を kind=memory で\\n"
    + "  ・進捗(「〜が終わった」「〜まで進んだ」) → save_memory を kind=memory で\\n"
    + "  ・約束・TODO(「〜までにやる」「今度〜する」) → create_task(期日があれば due_date)\\n"
    + "- 決定を変更する話(「やっぱりBにする」「〜は中止」)が出たら: search で旧決定のIDを探し、\\n"
    + "  save_memory を kind=decision, supersedes=旧ID, reason=変更理由 で保存する(旧決定は自動で履歴になる)。\\n"
    + "- タスク完了の話が出たら update_task で status=done にする。\\n"
    + "- ダッシュボードは閲覧専用。削除は「これ消して」→ delete_memory、プロジェクト概要は\\n"
    + "  「◯◯の概要を更新して」→ update_project。編集はすべて会話経由で AI が行う。\\n"
    + "- 会話が終わりそうなときは要点を save_memory で保存する(次の会話への引き継ぎ)。\\n"
    + "- 保存したら「📝 記憶しました」と一言だけ添える。";
  var htmlStr = '<div class="card"><h2>Claude コネクタ設定</h2>'
    + '<p>① claude.ai → 設定 → <b>コネクタ</b> → <b>カスタムコネクタを追加</b> で以下のURLを登録:</p>'
    + '<pre class="code" id="mcpUrl">'+esc(mcpUrl)+'</pre>'
    + '<button class="primary" onclick="copyText(\\'mcpUrl\\')">URLをコピー</button>'
    + '<p class="meta">※このURLにはあなた専用の秘密トークンが含まれています。他人に共有しないでください。</p>'
    + '</div>'
    + '<div class="card"><h2>おすすめ: Claude に自動で使わせる設定</h2>'
    + '<p>claude.ai → 設定 → プロフィール →「Claudeへの共通指示(パーソナル設定)」に以下を貼り付けると、毎回言わなくても Claude が自動で記憶の保存・呼び出しをします:</p>'
    + '<pre class="code" id="snippet">'+esc(snippet)+'</pre>'
    + '<button class="primary" onclick="copyText(\\'snippet\\')">指示文をコピー</button></div>'
    + '<div class="card"><h2>Claude Code から接続する場合</h2>'
    + '<pre class="code" id="ccCmd">claude mcp add --transport http dscribe '+esc(mcpUrl)+'</pre>'
    + '<button class="primary" onclick="copyText(\\'ccCmd\\')">コマンドをコピー</button></div>'
    + '<div class="card"><h2>データのエクスポート</h2>'
    + '<p><a href="'+API+'/export" download="dscribe-export.json">自分の全データをJSONでダウンロード</a>(バックアップ用)</p></div>';
  if(ME && ME.is_owner){
    htmlStr += '<div class="card"><h2>メンバー管理(オーナー専用)</h2>'
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
        + '<button class="ghost" title="アクセスURLを再発行" onclick="resetMember('+u.id+')">'+svg("key")+'</button>'
        + (u.is_owner ? '' : '<button class="ghost" title="削除" onclick="delMember('+u.id+')">'+svg("trash")+'</button>')
        + '</li>';
    }).join("") + '</ul>'
    + '<p class="meta">鍵アイコン=アクセスURLの再発行(URLを無くした人に新しいURLを渡す)。再発行すると古いURLは使えなくなります。</p>';
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

var VIEWS = {home:viewHome, tasks:viewTasks, memories:viewMemories, chats:viewChats, search:viewSearch, import:viewImport, export:viewExport, setup:viewSetup};
var READONLY_NOTE = "このダッシュボードは閲覧専用です。追加・変更・削除は Claude との会話で頼んでください(第二の脳の管理者は AI)。";
var ME = null;
el("osLink").href = "/os/" + TOKEN;
renderNav();
api("/me").then(function(me){
  ME = me;
  el("acct").textContent = me.email + (me.is_owner ? "(オーナー)" : "");
  viewHome();
}).catch(showErr);
</script>
</body>
</html>`;
}

export function renderLanding(): string {
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Dscribe</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px;text-align:center;background:#17150f;color:#ece4d3;
  background-image:radial-gradient(900px 520px at 82% -12%,rgba(201,164,92,.13),transparent 60%),radial-gradient(700px 420px at -8% 6%,rgba(147,160,106,.05),transparent 55%);
  font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN','Noto Sans JP',system-ui,sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:.002em;line-height:1.7}
h1{font-family:'Hiragino Mincho ProN','Yu Mincho',serif;font-weight:700;letter-spacing:.01em;margin:.5em 0}
code{background:#252118;border:1px solid #342f22;border-radius:7px;padding:2px 7px;font-size:.9em}
a{color:#dcbd7e}
</style></head>
<body><div><div style="color:#c9a45c"><svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/></svg></div><h1>Dscribe – Second Brain</h1>
<p>稼働中です。ダッシュボードへは自分専用のURL(<code>/app/&lt;トークン&gt;</code>)でアクセスしてください。</p>
<p style="color:#9aa0a6">新規登録には招待リンクが必要です。URLを無くした場合は管理者(招待した人)に再発行を依頼してください。</p></div></body></html>`;
}

export function renderSetupPage(): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23c9a45c' stroke-width='1.6'><circle cx='12' cy='12' r='8.5'/><circle cx='12' cy='12' r='2.6' fill='%23c9a45c'/></svg>">
<title>Dscribe – 初期設定</title>
<style>
:root{
  --bg:#17150f;--panel:#1e1b13;--panel2:#252118;--panel3:#2e2818;--text:#ece4d3;--sub:#a99f89;--line:#342f22;--line-soft:#272219;
  --accent:#c9a45c;--accent2:#dcbd7e;--danger:#c66a4a;--ok:#93a06a;--chip:#252017;
  --serif:'Hiragino Mincho ProN','Hiragino Mincho Pro','YuMincho','Yu Mincho','Songti SC',serif;
  --sans:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Noto Sans JP',system-ui,sans-serif;
  --tap:.16s cubic-bezier(.4,0,.2,1);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
  background-image:radial-gradient(900px 520px at 82% -12%,rgba(201,164,92,.11),transparent 60%),radial-gradient(700px 420px at -8% 6%,rgba(147,160,106,.05),transparent 55%);
  font-family:var(--sans);font-size:15px;line-height:1.7;-webkit-font-smoothing:antialiased;letter-spacing:.002em;display:grid;place-items:center;min-height:100vh;min-height:100dvh;padding:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:30px;max-width:600px;width:100%;box-shadow:0 24px 60px -20px rgba(0,0,0,.7)}
h1{font-family:var(--serif);font-size:22px;margin:0 0 4px;font-weight:700;letter-spacing:.01em} .sub{color:var(--sub);font-size:13px}
input{width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:11px;padding:12px 14px;font-size:15px;margin:14px 0 10px;font-family:inherit;transition:border-color var(--tap),box-shadow var(--tap)}
input:focus{outline:none;border-color:rgba(201,164,92,.42);box-shadow:0 0 0 3px rgba(201,164,92,.13)}
button.primary{width:100%;background:var(--accent);color:#1c1810;border:1px solid transparent;border-radius:11px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 3px 10px -4px rgba(0,0,0,.5);transition:filter var(--tap),transform var(--tap)}
button.primary:hover{filter:brightness(1.07);transform:translateY(-1px)} button.primary:active{transform:translateY(1px)}
pre.code{background:var(--panel2);border:1px solid var(--line-soft);border-radius:10px;padding:12px;overflow-x:auto;font-size:12px;white-space:pre-wrap;word-break:break-all;color:#d6dae6}
button.copy{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:9px;padding:7px 13px;cursor:pointer;font-size:13px;margin-bottom:10px;font-weight:600;transition:background var(--tap)}
button.copy:hover{background:var(--panel3)}
.err{color:var(--danger);margin-top:8px} .ok{color:var(--ok)}
.warn{background:rgba(240,180,94,.1);border:1px solid rgba(240,180,94,.28);color:#f0b45e;border-radius:12px;padding:11px 13px;font-size:13px;margin-top:14px;line-height:1.7}
a{color:var(--accent2)}
</style>
</head>
<body>
<div class="card">
  <div style="text-align:center;color:var(--accent)"><svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/></svg></div>
  <h1>Dscribe – 初期設定(オーナー登録)</h1>
  <div class="sub">デプロイ成功です!あなた(オーナー)のメールアドレスを登録して、専用URLを発行します。この画面は最初の1回だけ表示されます。</div>
  <div id="form">
    <input type="email" id="email" placeholder="あなたのメールアドレス" autocomplete="email">
    <button class="primary" onclick="setup()">オーナーとして登録する</button>
    <div id="msg"></div>
  </div>
  <div id="done" style="display:none"></div>
</div>
<script>
"use strict";
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function el(id){ return document.getElementById(id); }
function copyText(id){ navigator.clipboard.writeText(el(id).textContent).then(function(){ alert("コピーしました"); }); }
document.getElementById("email").addEventListener("keydown", function(e){ if(e.key === "Enter") setup(); });
function setup(){
  var email = el("email").value.trim();
  if(!email){ el("msg").innerHTML = '<div class="err">メールアドレスを入力してください</div>'; return; }
  el("msg").textContent = "登録中…";
  fetch("/setup", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({email:email}) })
    .then(function(r){ return r.json().then(function(j){ if(!r.ok) throw new Error(j.error || ("HTTP "+r.status)); return j; }); })
    .then(function(r){
      el("form").style.display = "none";
      var d = el("done");
      d.style.display = "";
      d.innerHTML = '<p class="ok"><b>設定完了しました</b>(' + esc(r.email) + ')</p>'
        + '<p><b>① あなたのダッシュボード</b>(ブックマーク必須):</p>'
        + '<pre class="code" id="appUrl">' + esc(r.app_url) + '</pre>'
        + '<button class="copy" onclick="copyText(\\'appUrl\\')">コピー</button>'
        + '<p><b>② Claude コネクタ用URL</b>(claude.ai → 設定 → コネクタ → カスタムコネクタを追加):</p>'
        + '<pre class="code" id="mcpUrl">' + esc(r.mcp_url) + '</pre>'
        + '<button class="copy" onclick="copyText(\\'mcpUrl\\')">コピー</button>'
        + '<p><b>③ 招待リンク</b>(他の人を入れたいときにだけ渡す。あなた専用データとは完全に分離されます):</p>'
        + '<pre class="code" id="joinUrl">' + esc(r.join_url) + '</pre>'
        + '<button class="copy" onclick="copyText(\\'joinUrl\\')">コピー</button>'
        + '<div class="warn">①②はあなたの<b>ログイン情報そのもの</b>です。必ずブックマークし、他人に教えないでください(③は後からダッシュボードの「設定」タブでも確認できます)。</div>'
        + '<p style="margin-top:14px"><a href="' + esc(r.app_url) + '">→ ダッシュボードを開く</a></p>';
    })
    .catch(function(e){ el("msg").innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
}
</script>
</body>
</html>`;
}

export function renderJoinPage(): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23c9a45c' stroke-width='1.6'><circle cx='12' cy='12' r='8.5'/><circle cx='12' cy='12' r='2.6' fill='%23c9a45c'/></svg>">
<title>Dscribe – アカウント登録</title>
<style>
:root{
  --bg:#17150f;--panel:#1e1b13;--panel2:#252118;--panel3:#2e2818;--text:#ece4d3;--sub:#a99f89;--line:#342f22;--line-soft:#272219;
  --accent:#c9a45c;--accent2:#dcbd7e;--danger:#c66a4a;--ok:#93a06a;--chip:#252017;
  --serif:'Hiragino Mincho ProN','Hiragino Mincho Pro','YuMincho','Yu Mincho','Songti SC',serif;
  --sans:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic','Noto Sans JP',system-ui,sans-serif;
  --tap:.16s cubic-bezier(.4,0,.2,1);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);
  background-image:radial-gradient(900px 520px at 82% -12%,rgba(201,164,92,.11),transparent 60%),radial-gradient(700px 420px at -8% 6%,rgba(147,160,106,.05),transparent 55%);
  font-family:var(--sans);font-size:15px;line-height:1.7;-webkit-font-smoothing:antialiased;letter-spacing:.002em;display:grid;place-items:center;min-height:100vh;min-height:100dvh;padding:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:30px;max-width:560px;width:100%;box-shadow:0 24px 60px -20px rgba(0,0,0,.7)}
h1{font-family:var(--serif);font-size:22px;margin:0 0 4px;font-weight:700;letter-spacing:.01em} .sub{color:var(--sub);font-size:13px}
input{width:100%;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:11px;padding:12px 14px;font-size:15px;margin:14px 0 10px;font-family:inherit;transition:border-color var(--tap),box-shadow var(--tap)}
input:focus{outline:none;border-color:rgba(201,164,92,.42);box-shadow:0 0 0 3px rgba(201,164,92,.13)}
button.primary{width:100%;background:var(--accent);color:#1c1810;border:1px solid transparent;border-radius:11px;padding:12px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 3px 10px -4px rgba(0,0,0,.5);transition:filter var(--tap),transform var(--tap)}
button.primary:hover{filter:brightness(1.07);transform:translateY(-1px)} button.primary:active{transform:translateY(1px)}
pre.code{background:var(--panel2);border:1px solid var(--line-soft);border-radius:10px;padding:12px;overflow-x:auto;font-size:12px;white-space:pre-wrap;word-break:break-all;color:#d6dae6}
button.copy{background:var(--panel2);border:1px solid var(--line);color:var(--text);border-radius:9px;padding:7px 13px;cursor:pointer;font-size:13px;margin-bottom:10px;font-weight:600;transition:background var(--tap)}
button.copy:hover{background:var(--panel3)}
.err{color:var(--danger);margin-top:8px} .ok{color:var(--ok)}
.warn{background:rgba(240,180,94,.1);border:1px solid rgba(240,180,94,.28);color:#f0b45e;border-radius:12px;padding:11px 13px;font-size:13px;margin-top:14px;line-height:1.7}
a{color:var(--accent2)}
</style>
</head>
<body>
<div class="card">
  <div style="text-align:center;color:var(--accent)"><svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/></svg></div>
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
      d.innerHTML = '<p class="ok"><b>登録完了しました</b>(' + esc(r.email) + ')</p>'
        + '<p><b>① あなたのダッシュボード</b>(ブックマーク必須):</p>'
        + '<pre class="code" id="appUrl">' + esc(r.app_url) + '</pre>'
        + '<button class="copy" onclick="copyText(\\'appUrl\\')">コピー</button>'
        + '<p><b>② Claude コネクタ用URL</b>(claude.ai → 設定 → コネクタ → カスタムコネクタを追加):</p>'
        + '<pre class="code" id="mcpUrl">' + esc(r.mcp_url) + '</pre>'
        + '<button class="copy" onclick="copyText(\\'mcpUrl\\')">コピー</button>'
        + '<div class="warn">この2つのURLがあなたの<b>ログイン情報そのもの</b>です。必ずブックマークし、他人に教えないでください。無くした場合は管理者(招待した人)に再発行を依頼できます。</div>'
        + '<p style="margin-top:14px"><a href="' + esc(r.app_url) + '">→ ダッシュボードを開く</a>(Claudeへの設定方法は「⚙️ 設定」タブにあります)</p>';
    })
    .catch(function(e){ el("msg").innerHTML = '<div class="err">' + esc(e.message) + '</div>'; });
}
</script>
</body>
</html>`;
}
