import{n as Q,r as b,a as X,A as Z,j as s,E as w,L as C}from"./index-C6gwIhxm.js";import{M as U,b as V,s as D,a as Y}from"./matchPositions-BYb0uDYI.js";import{n as tt}from"./normalizeError-cqadwSjt.js";function h(t){const n=Number(t);return Number.isFinite(n)?n:0}function S(t){return t==null||Number.isNaN(Number(t))?null:Math.round(Number(t)*10)/10}function z(t){return h(t.aces)+h(t.serve_in)+h(t.serve_err)}function M(t){const n=h(t.pass_total);return n?S((h(t.pass_hash)+h(t.pass_plus))/n*100):null}function A(t){const n=h(t.pass_total);return n?S(h(t.pass_hash)/n*100):null}function B(t){const n=h(t.attack_attempts);return n?S((h(t.kills)-h(t.attack_err))/n*100):null}function p(t){return t==null?"·":`${t}%`}function i(t){return t==null||t===""||t===0?"·":t}function y(t){const n=h(t);return n>0?`+${n}`:String(n)}function H(t){const n=h(t.block_total);return n||h(t.blocks)+h(t.block_touch)+h(t.block_err)}function I(t){const n=h(t.digs);return n||h(t.dig_plus)+h(t.dig_zero)+h(t.dig_minus)}const F=["points","kills","attack_zero","attack_err","attack_attempts","aces","serve_in","serve_err","blocks","block_touch","block_err","block_total","digs","dig_plus","dig_zero","dig_minus","pass_hash","pass_plus","pass_minus","pass_err","pass_total","set_hash","set_plus","set_minus","set_err","set_total","indiv_err","errors"];function K(t=[]){const n=Object.fromEntries(F.map(l=>[l,0]));for(const l of t)for(const a of F)n[a]+=h(l[a]);if(n.attack_pct=n.attack_attempts?S(n.kills/n.attack_attempts*100):null,n.digs||(n.digs=n.dig_plus+n.dig_zero+n.dig_minus),n.block_total||(n.block_total=n.blocks+n.block_touch+n.block_err),n.pass_total){const l=n.pass_hash*3+n.pass_plus*2+n.pass_minus;n.pass_avg=S(l/n.pass_total)}else n.pass_avg=null;if(n.set_total){const l=n.set_hash*3+n.set_plus*2+n.set_minus;n.set_avg=S(l/n.set_total)}else n.set_avg=null;return n}function st(t,{sideOut:n,byRotation:l}={}){const a=[],e=n||(t==null?void 0:t.side_out);if(e!=null&&e.side_out_attempts&&a.push({id:"so",label:"Side-out",value:`${e.side_out_won||0}/${e.side_out_attempts||0}`,sub:e.side_out_pct!=null?`${e.side_out_pct}%`:"",tone:e.side_out_pct!=null&&e.side_out_pct>=55?"good":"neutral"}),e!=null&&e.break_attempts&&a.push({id:"bp",label:"Break",value:`${e.break_won||0}/${e.break_attempts||0}`,sub:e.break_pct!=null?`${e.break_pct}%`:"",tone:e.break_pct!=null&&e.break_pct>=40?"good":"neutral"}),e&&((e.points_for||0)>0||(e.points_against||0)>0)){const o=h(e.points_for)-h(e.points_against);a.push({id:"pts",label:"Точки",value:`${e.points_for||0}:${e.points_against||0}`,sub:y(o),tone:o>0?"good":o<0?"bad":"neutral"})}const v=(l||(t==null?void 0:t.by_rotation)||[]).filter(o=>h(o.points_for)+h(o.points_against)>=2);if(v.length){const o=v.reduce((_,j)=>h(j.point_diff)>h(_.point_diff)?j:_);h(o.point_diff)>0&&a.push({id:"rot",label:"Силна ротация",value:`R${o.rotation}`,sub:y(o.point_diff),tone:"good"})}const k=((t==null?void 0:t.athletes)||[]).filter(o=>h(o.points)>0);if(k.length){const o=k.reduce((_,j)=>h(j.points)>h(_.points)?j:_);a.push({id:"mvp",label:"Топ точки",value:`#${o.jersey_number||"·"}`,sub:`${o.points} т.`,tone:"accent"})}const R=h(t==null?void 0:t.opp_errors);return R>0&&a.push({id:"oppErr",label:"Гр. противник",value:String(R),sub:h(t==null?void 0:t.opp_points)>0?`атака ${t.opp_points}`:"за нас",tone:"good"}),a}const d=t=>String(t!=null?t:"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");function c(t){return t==null||t===""||t===0?"·":d(t)}function $(t){return t==null?"·":d(`${t}%`)}function nt(t){return t.map(n=>{const l=D(n.athlete_name)||n.athlete_name||"";return`<tr>
        <td class="num">${c(n.jersey_number)}</td>
        <td class="name">${d(l)}</td>
        <td>${d(Y(n.position)||"")}</td>
        <td class="num strong">${c(n.points)}</td>
        <td class="num">${c(z(n))}</td>
        <td class="num">${c(n.serve_err)}</td>
        <td class="num">${c(n.aces)}</td>
        <td class="num">${c(n.pass_total)}</td>
        <td class="num">${c(n.pass_err)}</td>
        <td class="num">${$(M(n))}</td>
        <td class="num">${$(A(n))}</td>
        <td class="num">${n.pass_avg!=null?d(n.pass_avg):"·"}</td>
        <td class="num">${c(n.attack_attempts)}</td>
        <td class="num">${c(n.attack_err)}</td>
        <td class="num">${c(n.kills)}</td>
        <td class="num">${$(n.attack_pct)}</td>
        <td class="num">${$(B(n))}</td>
        <td class="num">${c(H(n))}</td>
        <td class="num">${c(n.blocks)}</td>
        <td class="num">${c(n.block_err)}</td>
        <td class="num">${c(I(n))}</td>
        <td class="num">${c(n.dig_plus)}</td>
        <td class="num">${c(n.dig_zero)}</td>
        <td class="num">${c(n.dig_minus)}</td>
        <td class="num">${c(n.set_total)}</td>
        <td class="num">${c(n.set_hash)}</td>
        <td class="num">${c(n.set_plus)}</td>
        <td class="num">${c(n.set_minus)}</td>
        <td class="num">${n.set_avg!=null?d(n.set_avg):"·"}</td>
        <td class="num">${c(n.errors)}</td>
      </tr>`}).join("")}function et(t){return`<tr class="totals">
    <td colspan="3"><strong>Общо отбор</strong></td>
    <td class="num strong">${c(t.points)}</td>
    <td class="num">${c(z(t))}</td>
    <td class="num">${c(t.serve_err)}</td>
    <td class="num">${c(t.aces)}</td>
    <td class="num">${c(t.pass_total)}</td>
    <td class="num">${c(t.pass_err)}</td>
    <td class="num">${$(M(t))}</td>
    <td class="num">${$(A(t))}</td>
    <td class="num">${t.pass_avg!=null?d(t.pass_avg):"·"}</td>
    <td class="num">${c(t.attack_attempts)}</td>
    <td class="num">${c(t.attack_err)}</td>
    <td class="num">${c(t.kills)}</td>
    <td class="num">${$(t.attack_pct)}</td>
    <td class="num">${$(B(t))}</td>
    <td class="num">${c(H(t))}</td>
    <td class="num">${c(t.blocks)}</td>
    <td class="num">${c(t.block_err)}</td>
    <td class="num">${c(I(t))}</td>
    <td class="num">${c(t.dig_plus)}</td>
    <td class="num">${c(t.dig_zero)}</td>
    <td class="num">${c(t.dig_minus)}</td>
    <td class="num">${c(t.set_total)}</td>
    <td class="num">${c(t.set_hash)}</td>
    <td class="num">${c(t.set_plus)}</td>
    <td class="num">${c(t.set_minus)}</td>
    <td class="num">${t.set_avg!=null?d(t.set_avg):"·"}</td>
    <td class="num">${c(t.errors)}</td>
  </tr>`}function at(t=[]){return t.length?`<h2>Ротации (diff)</h2><table class="rot"><tr>${t.map(l=>{const a=h(l.point_diff);return`<td class="${a>0?"good":a<0?"bad":""}"><div class="rotLab">R${d(l.rotation)}</div><div class="rotDiff">${d(y(a))}</div><div class="rotPts">${d(l.points_for)}:${d(l.points_against)}</div></td>`}).join("")}</tr></table>`:""}function lt(t=[]){return t.length?`<table class="sets"><tr>${t.map(n=>`<td><strong>G${d(n.set_number)}</strong> ${d(n.our_score)}:${d(n.opp_score)}</td>`).join("")}</tr></table>`:""}function it({report:t,athletes:n,sideOut:l,byRotation:a,scopeLabel:e="Целият мач"}){var N,L,E;const T=n||(t==null?void 0:t.athletes)||[],v=K(T),m=l||(t==null?void 0:t.side_out)||{},k=((N=U.find(g=>g.code===((t==null?void 0:t.format)||"bo5")))==null?void 0:N.label)||"3 от 5",R=(t==null?void 0:t.match_won_by)==="us"?"Победа":(t==null?void 0:t.match_won_by)==="opp"?"Загуба":V[t==null?void 0:t.status]||(t==null?void 0:t.status)||"",o=(t==null?void 0:t.team_name)||"Наш отбор",_=(t==null?void 0:t.opponent_name)||"противник",j=new Date().toLocaleDateString("bg-BG",{day:"numeric",month:"long",year:"numeric"}),u=((t==null?void 0:t.insights)||[]).map(g=>`<li>${d(g)}</li>`).join(""),P=`<!DOCTYPE html>
<html lang="bg"><head>
<meta charset="utf-8"/>
<title>Статистика · ${d(o)} vs ${d(_)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; color: #111; font-size: 10px; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  h2 { font-size: 11px; margin: 10px 0 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta { color: #444; margin: 0 0 8px; }
  .score { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
  .kpi { display: flex; gap: 10px; flex-wrap: wrap; margin: 6px 0 10px; }
  .kpi div { border: 1px solid #ccc; padding: 4px 8px; min-width: 90px; }
  .kpi strong { display: block; font-size: 14px; }
  .kpi span { color: #555; font-size: 9px; text-transform: uppercase; }
  table.box { width: 100%; border-collapse: collapse; }
  table.box th, table.box td { border: 1px solid #bbb; padding: 2px 3px; white-space: nowrap; }
  table.box th { background: #eee; font-size: 8px; font-weight: 700; text-align: center; }
  table.box td.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.box td.name { text-align: left; max-width: 110px; overflow: hidden; text-overflow: ellipsis; }
  table.box td.strong { font-weight: 800; }
  table.box tr.totals td { background: #f3f3f3; font-weight: 700; }
  table.box thead tr.grp th { background: #ddd; }
  table.sets td { border: 1px solid #ccc; padding: 3px 8px; }
  table.rot { width: auto; border-collapse: collapse; }
  table.rot td { border: 1px solid #bbb; padding: 4px 10px; text-align: center; min-width: 48px; }
  table.rot td.good { background: #e8f5e9; }
  table.rot td.bad { background: #fce8e6; }
  .rotLab { font-weight: 800; }
  .rotDiff { font-size: 12px; font-weight: 800; }
  .rotPts { color: #555; font-size: 9px; }
  ul.ins { margin: 4px 0 0; padding-left: 16px; columns: 2; column-gap: 18px; }
  ul.ins li { margin: 0 0 2px; break-inside: avoid; }
  .foot { margin-top: 10px; color: #666; font-size: 9px; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head><body>
  <h1>${d(o)} vs ${d(_)}</h1>
  <div class="score">${d((L=t==null?void 0:t.sets_won_us)!=null?L:0)} : ${d((E=t==null?void 0:t.sets_won_opp)!=null?E:0)} · ${d(R)}</div>
  <p class="meta">${d(k)} · ${d((t==null?void 0:t.system)||"")}
    ${t!=null&&t.match_date?` · ${d(t.match_date)}`:""}
    ${t!=null&&t.venue?` · ${d(t.venue)}`:""}
    · ${d(e)} · ${d(j)}</p>
  ${lt((t==null?void 0:t.sets)||[])}

  <div class="kpi">
    <div><span>Side-out</span><strong>${d(m.side_out_won||0)}/${d(m.side_out_attempts||0)} ${m.side_out_pct!=null?d(`(${m.side_out_pct}%)`):""}</strong></div>
    <div><span>Break-point</span><strong>${d(m.break_won||0)}/${d(m.break_attempts||0)} ${m.break_pct!=null?d(`(${m.break_pct}%)`):""}</strong></div>
    <div><span>Точки</span><strong>${d(m.points_for||0)}:${d(m.points_against||0)} (${d(y(h(m.points_for)-h(m.points_against)))})</strong></div>
    <div><span>Гр. противник</span><strong>${d((t==null?void 0:t.opp_errors)||0)}</strong></div>
    <div><span>Атака противник</span><strong>${d((t==null?void 0:t.opp_points)||0)}</strong></div>
    <div><span>Записи</span><strong>${d((t==null?void 0:t.event_count)||0)}</strong></div>
  </div>

  ${((t==null?void 0:t.insights)||[]).length?`<h2>Изводи</h2><ul class="ins">${u}</ul>`:""}

  <h2>По състезател</h2>
  <table class="box">
    <thead>
      <tr class="grp">
        <th colspan="3"></th>
        <th>Тч</th>
        <th colspan="3">Сервис</th>
        <th colspan="5">Посрещане</th>
        <th colspan="5">Атака</th>
        <th colspan="3">Блок</th>
        <th colspan="4">Защита</th>
        <th colspan="5">Вдигане</th>
        <th>Гр</th>
      </tr>
      <tr>
        <th>#</th><th>Име</th><th>Поз</th>
        <th>Tot</th>
        <th>Tot</th><th>Err</th><th>Ас</th>
        <th>Tot</th><th>Err</th><th>Pos%</th><th>Prf%</th><th>Ср</th>
        <th>Tot</th><th>Err</th><th>Pt</th><th>Pt%</th><th>Eff%</th>
        <th>Tot</th><th>Pt</th><th>Err</th>
        <th>Tot</th><th>+</th><th>0</th><th>−</th>
        <th>Tot</th><th>#</th><th>+</th><th>−</th><th>Ср</th>
        <th>Tot</th>
      </tr>
    </thead>
    <tbody>
      ${nt(T)}
      ${et(v)}
    </tbody>
  </table>

  ${at(a||(t==null?void 0:t.by_rotation)||[])}

  <p class="foot">Volley Platform · статистика на мача · при печат изберете „Запази като PDF“.</p>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };<\/script>
</body></html>`,f=window.open("","_blank","width=1100,height=800");if(!f){alert("Изскачащият прозорец е блокиран. Разрешете pop-ups, за да изтеглите PDF.");return}f.document.open(),f.document.write(P),f.document.close()}function ct({sideOut:t}){return!t||!((t.side_out_attempts||0)+(t.break_attempts||0)+(t.points_for||0)>0)?null:s.jsxs("div",{className:"matchReportSideOut",children:[s.jsxs("div",{className:"matchReportSideOutCard",children:[s.jsx("span",{className:"matchReportSideOutLabel",children:"Side-out"}),s.jsxs("strong",{children:[t.side_out_won||0,"/",t.side_out_attempts||0]}),s.jsx("span",{className:"matchReportSideOutPct",children:p(t.side_out_pct)}),s.jsx("span",{className:"matchReportSideOutHint",children:"точки при посрещане"})]}),s.jsxs("div",{className:"matchReportSideOutCard",children:[s.jsx("span",{className:"matchReportSideOutLabel",children:"Break Point"}),s.jsxs("strong",{children:[t.break_won||0,"/",t.break_attempts||0]}),s.jsx("span",{className:"matchReportSideOutPct",children:p(t.break_pct)}),s.jsx("span",{className:"matchReportSideOutHint",children:"точки при наш сервис"})]}),s.jsxs("div",{className:"matchReportSideOutCard",children:[s.jsx("span",{className:"matchReportSideOutLabel",children:"Точки"}),s.jsxs("strong",{children:[t.points_for||0,":",t.points_against||0]}),s.jsx("span",{className:"matchReportSideOutPct",children:y(h(t.points_for)-h(t.points_against))}),s.jsx("span",{className:"matchReportSideOutHint",children:"за нас : противник"})]})]})}function dt({rows:t}){return t!=null&&t.length?s.jsxs("div",{className:"matchReportRotation",children:[s.jsxs("div",{className:"matchReportSectionHead",children:[s.jsx("h3",{children:"Ротации"}),s.jsx("span",{className:"matchReportSectionHint",children:"разлика точки за/срещу"})]}),s.jsx("div",{className:"matchReportRotStrip",children:t.map(n=>{const l=h(n.point_diff),a=l>0?"is-good":l<0?"is-bad":"";return s.jsxs("div",{className:`matchReportRotCell ${a}`,children:[s.jsxs("span",{className:"matchReportRotLab",children:["R",n.rotation]}),s.jsx("strong",{children:y(l)}),s.jsxs("span",{className:"matchReportRotPts",children:[n.points_for||0,":",n.points_against||0]}),s.jsxs("span",{className:"matchReportRotSo",children:["SO ",p(n.side_out_pct)," · BP ",p(n.break_pct)]})]},n.rotation)})})]}):null}function G(t,n){const l=D(n)||n||"·";return t?`#${t} ${l}`:l}function ht({rows:t,showSet:n=!0}){return t!=null&&t.length?s.jsxs("details",{className:"matchReportSubs",open:t.length<=12,children:[s.jsxs("summary",{children:["Смени ",s.jsxs("strong",{children:["(",t.length,")"]})]}),s.jsx("ol",{className:"matchReportSubsList",children:t.map(l=>s.jsxs("li",{children:[s.jsxs("span",{className:"matchReportSubsMeta",children:[n?`G${l.set_number} · `:"",l.our_score,":",l.opp_score,l.rotation?` · R${l.rotation}`:""]}),s.jsxs("span",{className:"matchReportSubsSwap",children:[s.jsx("span",{className:"matchReportSubsOut",children:G(l.out_jersey,l.out_athlete_name)}),s.jsx("span",{className:"matchReportSubsArrow","aria-hidden":!0,children:"→"}),s.jsx("span",{className:"matchReportSubsIn",children:G(l.in_jersey,l.in_athlete_name)})]})]},l.id||`${l.set_number}-${l.out_athlete_id}-${l.in_athlete_id}-${l.our_score}`))})]}):null}function ot({rows:t}){if(!(t!=null&&t.length))return s.jsx("p",{className:"coachMobileMuted",children:"Няма записи за този изглед."});const n=K(t),l=(a,e)=>s.jsxs("tr",{children:[s.jsx("td",{children:i(a.jersey_number)}),s.jsx("td",{className:"matchLiveStatTableName",children:D(a.athlete_name)||a.athlete_name}),s.jsx("td",{children:Y(a.position)}),s.jsx("td",{className:"matchReportColStrong",children:i(a.points)}),s.jsx("td",{children:i(z(a))}),s.jsx("td",{children:i(a.serve_err)}),s.jsx("td",{children:i(a.aces)}),s.jsx("td",{children:i(a.pass_total)}),s.jsx("td",{children:i(a.pass_err)}),s.jsx("td",{children:p(M(a))}),s.jsx("td",{children:p(A(a))}),s.jsx("td",{children:a.pass_avg!=null?a.pass_avg:"·"}),s.jsx("td",{children:i(a.attack_attempts)}),s.jsx("td",{children:i(a.attack_err)}),s.jsx("td",{children:i(a.kills)}),s.jsx("td",{children:p(a.attack_pct)}),s.jsx("td",{children:p(B(a))}),s.jsx("td",{children:i(H(a))}),s.jsx("td",{children:i(a.blocks)}),s.jsx("td",{children:i(a.block_err)}),s.jsx("td",{children:i(I(a))}),s.jsx("td",{children:i(a.dig_plus)}),s.jsx("td",{children:i(a.dig_zero)}),s.jsx("td",{children:i(a.dig_minus)}),s.jsx("td",{children:i(a.set_total)}),s.jsx("td",{children:i(a.set_hash)}),s.jsx("td",{children:i(a.set_plus)}),s.jsx("td",{children:i(a.set_minus)}),s.jsx("td",{children:a.set_avg!=null?a.set_avg:"·"}),s.jsx("td",{children:i(a.errors)})]},e);return s.jsx("div",{className:"matchReportTableWrap",children:s.jsxs("table",{className:"matchLiveStatTable matchReportTable matchReportBox",children:[s.jsxs("thead",{children:[s.jsxs("tr",{className:"matchReportGroupRow",children:[s.jsx("th",{colSpan:3}),s.jsx("th",{children:"Тч"}),s.jsx("th",{colSpan:3,children:"Сервис"}),s.jsx("th",{colSpan:5,children:"Посрещане"}),s.jsx("th",{colSpan:5,children:"Атака"}),s.jsx("th",{colSpan:3,children:"Блок"}),s.jsx("th",{colSpan:4,children:"Защита"}),s.jsx("th",{colSpan:5,children:"Вдигане"}),s.jsx("th",{children:"Гр"})]}),s.jsxs("tr",{children:[s.jsx("th",{children:"#"}),s.jsx("th",{children:"Име"}),s.jsx("th",{children:"Поз"}),s.jsx("th",{title:"Точки (атака + ас + блок)",children:"Tot"}),s.jsx("th",{title:"Общо сервирания",children:"Tot"}),s.jsx("th",{title:"Грешки сервис",children:"Err"}),s.jsx("th",{title:"Асове",children:"Ас"}),s.jsx("th",{title:"Общо посрещания",children:"Tot"}),s.jsx("th",{title:"Грешки посрещане",children:"Err"}),s.jsx("th",{title:"Позитивно (# + +)",children:"Pos%"}),s.jsx("th",{title:"Перфектно (#)",children:"Prf%"}),s.jsx("th",{title:"Средно посрещане",children:"Ср"}),s.jsx("th",{title:"Опити атака",children:"Tot"}),s.jsx("th",{title:"Грешки атака",children:"Err"}),s.jsx("th",{title:"Точки атака",children:"Pt"}),s.jsx("th",{title:"% точки / опити",children:"Pt%"}),s.jsx("th",{title:"Ефективност (точки − грешки) / опити",children:"Eff%"}),s.jsx("th",{title:"Общо блок (точки + touch + грешки)",children:"Tot"}),s.jsx("th",{title:"Блок точки",children:"Pt"}),s.jsx("th",{title:"Грешки блок",children:"Err"}),s.jsx("th",{title:"Общо защита",children:"Tot"}),s.jsx("th",{title:"Защита +",children:"+"}),s.jsx("th",{title:"Защита 0",children:"0"}),s.jsx("th",{title:"Защита −",children:"−"}),s.jsx("th",{title:"Общо вдигания",children:"Tot"}),s.jsx("th",{title:"Вдигане #",children:"#"}),s.jsx("th",{title:"Вдигане +",children:"+"}),s.jsx("th",{title:"Вдигане −",children:"−"}),s.jsx("th",{title:"Средно вдигане",children:"Ср"}),s.jsx("th",{title:"Общо грешки",children:"Tot"})]})]}),s.jsxs("tbody",{children:[t.map(a=>l(a,a.athlete_id)),s.jsxs("tr",{className:"matchReportTotalsRow",children:[s.jsx("td",{colSpan:3,children:s.jsx("strong",{children:"Общо отбор"})}),s.jsx("td",{className:"matchReportColStrong",children:i(n.points)}),s.jsx("td",{children:i(z(n))}),s.jsx("td",{children:i(n.serve_err)}),s.jsx("td",{children:i(n.aces)}),s.jsx("td",{children:i(n.pass_total)}),s.jsx("td",{children:i(n.pass_err)}),s.jsx("td",{children:p(M(n))}),s.jsx("td",{children:p(A(n))}),s.jsx("td",{children:n.pass_avg!=null?n.pass_avg:"·"}),s.jsx("td",{children:i(n.attack_attempts)}),s.jsx("td",{children:i(n.attack_err)}),s.jsx("td",{children:i(n.kills)}),s.jsx("td",{children:p(n.attack_pct)}),s.jsx("td",{children:p(B(n))}),s.jsx("td",{children:i(H(n))}),s.jsx("td",{children:i(n.blocks)}),s.jsx("td",{children:i(n.block_err)}),s.jsx("td",{children:i(I(n))}),s.jsx("td",{children:i(n.dig_plus)}),s.jsx("td",{children:i(n.dig_zero)}),s.jsx("td",{children:i(n.dig_minus)}),s.jsx("td",{children:i(n.set_total)}),s.jsx("td",{children:i(n.set_hash)}),s.jsx("td",{children:i(n.set_plus)}),s.jsx("td",{children:i(n.set_minus)}),s.jsx("td",{children:n.set_avg!=null?n.set_avg:"·"}),s.jsx("td",{children:i(n.errors)})]})]})]})})}function pt(){const{teamId:t,matchId:n}=Q(),l=Number(t),a=Number(n),[e,T]=b.useState(null),[v,m]=b.useState(!0),[k,R]=b.useState(""),[o,_]=b.useState("all");b.useEffect(()=>{let r=!0;return(async()=>{try{m(!0),R("");const x=await X.get(Z.TEAM_MATCH_REPORT(l,a));if(!r)return;T(x.data)}catch(x){if(!r)return;R(tt(x,"Неуспешно зареждане на отчета."))}finally{r&&m(!1)}})(),()=>{r=!1}},[l,a]);const j=b.useMemo(()=>{var x;const r=(e==null?void 0:e.format)||"bo5";return((x=U.find(J=>J.code===r))==null?void 0:x.label)||"3 от 5"},[e==null?void 0:e.format]),u=b.useMemo(()=>{if(!e||o==="all")return null;const r=Number(String(o).replace("set:",""));return(e.by_set||[]).find(x=>Number(x.set_number)===r)||null},[e,o]),P=b.useMemo(()=>e?o==="all"?e.athletes||[]:(u==null?void 0:u.athletes)||[]:[],[e,o,u]),f=o==="all"?e==null?void 0:e.side_out:u==null?void 0:u.side_out,N=o==="all"?e==null?void 0:e.by_rotation:u==null?void 0:u.by_rotation,L=o==="all"?e==null?void 0:e.substitutions:u==null?void 0:u.substitutions,E=o==="all"?"Целият мач":`Гейм ${(u==null?void 0:u.set_number)||""}`,g=b.useMemo(()=>{var r,x;return e?o==="all"?e:{...e,athletes:(u==null?void 0:u.athletes)||[],opp_errors:(r=u==null?void 0:u.opp_errors)!=null?r:0,opp_points:(x=u==null?void 0:u.opp_points)!=null?x:0}:null},[e,o,u]),O=b.useMemo(()=>g?st(g,{sideOut:f,byRotation:N}):[],[g,f,N]);if(v)return s.jsx("p",{className:"coachMobileMuted",children:"Зареждане на отчет..."});if(k)return s.jsx(w,{title:"Грешка",description:k});if(!e)return null;const W=e.match_won_by==="us"?"Победа":e.match_won_by==="opp"?"Загуба":V[e.status]||e.status,q=e.team_name||"Наш отбор";return s.jsxs("section",{className:"matchReportPage",children:[s.jsxs("div",{className:"matchReportTop",children:[s.jsx(C,{to:`/coach/teams/${l}/matches`,className:"matchLiveBack",children:"← Мачове"}),s.jsxs("div",{className:"matchReportMeta",children:[s.jsx("p",{className:"matchReportBrand",children:"Volley Platform · Tabellino"}),s.jsxs("h2",{children:[q," ",s.jsx("span",{className:"matchReportVs",children:"vs"})," ",e.opponent_name||"противник"]}),s.jsxs("p",{className:"matchReportScoreLine",children:[s.jsxs("strong",{children:[e.sets_won_us,":",e.sets_won_opp]})," ","· ",W," · ",j," · ",e.system,e.match_date?` · ${e.match_date}`:"",e.venue?` · ${e.venue}`:""]})]}),s.jsxs("div",{className:"matchReportTopActions",children:[s.jsx("button",{type:"button",className:"matchReportLinkBtn matchReportLinkBtn--pdf",onClick:()=>it({report:g||e,athletes:P,sideOut:f,byRotation:N,scopeLabel:E}),children:"PDF"}),s.jsx(C,{to:`/coach/teams/${l}/matches/${a}`,className:"matchReportLinkBtn",children:"Настройки"}),s.jsx(C,{to:`/coach/teams/${l}/matches/${a}/video`,className:"matchReportLinkBtn",children:"Видео"}),e.status!=="finished"?s.jsx(C,{to:`/coach/teams/${l}/matches/${a}/live`,className:"matchReportLinkBtn matchReportLinkBtn--live",children:"Live"}):null]})]}),(e.sets||[]).length>0?s.jsx("div",{className:"matchLiveSetStrip matchReportSetStrip","aria-label":"Резултат по геймове",children:(e.sets||[]).map(r=>s.jsxs("span",{className:r.status==="finished"?"is-done":"is-live",children:["G",r.set_number," ",r.our_score,":",r.opp_score]},r.set_number))}):null,O.length?s.jsx("div",{className:"matchReportChips","aria-label":"Бързи изводи",children:O.map(r=>s.jsxs("div",{className:`matchReportChip matchReportChip--${r.tone||"neutral"}`,children:[s.jsx("span",{className:"matchReportChipLabel",children:r.label}),s.jsx("strong",{children:r.value}),r.sub?s.jsx("span",{className:"matchReportChipSub",children:r.sub}):null]},r.id))}):null,(e.insights||[]).length?s.jsxs("details",{className:"matchReportInsights",children:[s.jsxs("summary",{children:["Изводи ",s.jsxs("span",{className:"matchReportEventCount",children:["· ",e.event_count||0," записа"]})]}),s.jsx("ul",{children:(e.insights||[]).map(r=>s.jsx("li",{children:r},r))})]}):null,s.jsxs("div",{className:"matchReportTabs",role:"tablist","aria-label":"Филтър по гейм",children:[s.jsx("button",{type:"button",role:"tab",className:o==="all"?"is-active":"","aria-selected":o==="all",onClick:()=>_("all"),children:"Целият мач"}),(e.by_set||[]).map(r=>s.jsxs("button",{type:"button",role:"tab",className:o===`set:${r.set_number}`?"is-active":"","aria-selected":o===`set:${r.set_number}`,onClick:()=>_(`set:${r.set_number}`),children:["Гейм ",r.set_number]},r.set_number))]}),s.jsx(ct,{sideOut:f}),s.jsx(dt,{rows:N}),s.jsxs("div",{className:"matchReportSectionHead",children:[s.jsx("h3",{className:"matchReportPlayersTitle",children:"По състезател"}),s.jsxs("span",{className:"matchReportSectionHint",children:["Блок Tot = Pt + touch + Err · Защита +/0/− · Pos% = # + + · Eff% = (Pt − Err) / Tot",o==="all"&&e.opp_errors?` · Гр. противник: ${e.opp_errors}`:u!=null&&u.opp_errors?` · Гр. противник: ${u.opp_errors}`:""]})]}),s.jsx(ot,{rows:P}),s.jsx(ht,{rows:L||[],showSet:o==="all"})]})}export{pt as default};
