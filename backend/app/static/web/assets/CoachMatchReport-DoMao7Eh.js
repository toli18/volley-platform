import{n as W,r as f,a as q,A as J,j as s,E as Q,L as E}from"./index-CLF6gZMt.js";import{M as O,b as F,s as z,a as G}from"./matchPositions-BYb0uDYI.js";import{n as X}from"./normalizeError-cqadwSjt.js";function o(t){const e=Number(t);return Number.isFinite(e)?e:0}function v(t){return t==null||Number.isNaN(Number(t))?null:Math.round(Number(t)*10)/10}function C(t){return o(t.aces)+o(t.serve_in)+o(t.serve_err)}function M(t){const e=o(t.pass_total);return e?v((o(t.pass_hash)+o(t.pass_plus))/e*100):null}function A(t){const e=o(t.pass_total);return e?v(o(t.pass_hash)/e*100):null}function B(t){const e=o(t.attack_attempts);return e?v((o(t.kills)-o(t.attack_err))/e*100):null}function _(t){return t==null?"·":`${t}%`}function c(t){return t==null||t===""||t===0?"·":t}function S(t){const e=o(t);return e>0?`+${e}`:String(e)}const I=["points","kills","attack_zero","attack_err","attack_attempts","aces","serve_in","serve_err","blocks","digs","pass_hash","pass_plus","pass_minus","pass_err","pass_total","set_hash","set_plus","set_minus","set_err","set_total","indiv_err","errors"];function U(t=[]){const e=Object.fromEntries(I.map(l=>[l,0]));for(const l of t)for(const n of I)e[n]+=o(l[n]);if(e.attack_pct=e.attack_attempts?v(e.kills/e.attack_attempts*100):null,e.pass_total){const l=e.pass_hash*3+e.pass_plus*2+e.pass_minus;e.pass_avg=v(l/e.pass_total)}else e.pass_avg=null;if(e.set_total){const l=e.set_hash*3+e.set_plus*2+e.set_minus;e.set_avg=v(l/e.set_total)}else e.set_avg=null;return e}function Z(t,{sideOut:e,byRotation:l}={}){const n=[],a=e||(t==null?void 0:t.side_out);if(a!=null&&a.side_out_attempts&&n.push({id:"so",label:"Side-out",value:`${a.side_out_won||0}/${a.side_out_attempts||0}`,sub:a.side_out_pct!=null?`${a.side_out_pct}%`:"",tone:a.side_out_pct!=null&&a.side_out_pct>=55?"good":"neutral"}),a!=null&&a.break_attempts&&n.push({id:"bp",label:"Break",value:`${a.break_won||0}/${a.break_attempts||0}`,sub:a.break_pct!=null?`${a.break_pct}%`:"",tone:a.break_pct!=null&&a.break_pct>=40?"good":"neutral"}),a&&((a.points_for||0)>0||(a.points_against||0)>0)){const u=o(a.points_for)-o(a.points_against);n.push({id:"pts",label:"Точки",value:`${a.points_for||0}:${a.points_against||0}`,sub:S(u),tone:u>0?"good":u<0?"bad":"neutral"})}const N=(l||(t==null?void 0:t.by_rotation)||[]).filter(u=>o(u.points_for)+o(u.points_against)>=2);if(N.length){const u=N.reduce((r,x)=>o(x.point_diff)>o(r.point_diff)?x:r);o(u.point_diff)>0&&n.push({id:"rot",label:"Силна ротация",value:`R${u.rotation}`,sub:S(u.point_diff),tone:"good"})}const $=((t==null?void 0:t.athletes)||[]).filter(u=>o(u.points)>0);if($.length){const u=$.reduce((r,x)=>o(x.points)>o(r.points)?x:r);n.push({id:"mvp",label:"Топ точки",value:`#${u.jersey_number||"·"}`,sub:`${u.points} т.`,tone:"accent"})}return n}const i=t=>String(t!=null?t:"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");function d(t){return t==null||t===""||t===0?"·":i(t)}function g(t){return t==null?"·":i(`${t}%`)}function w(t){return t.map(e=>{const l=z(e.athlete_name)||e.athlete_name||"";return`<tr>
        <td class="num">${d(e.jersey_number)}</td>
        <td class="name">${i(l)}</td>
        <td>${i(G(e.position)||"")}</td>
        <td class="num strong">${d(e.points)}</td>
        <td class="num">${d(C(e))}</td>
        <td class="num">${d(e.serve_err)}</td>
        <td class="num">${d(e.aces)}</td>
        <td class="num">${d(e.pass_total)}</td>
        <td class="num">${d(e.pass_err)}</td>
        <td class="num">${g(M(e))}</td>
        <td class="num">${g(A(e))}</td>
        <td class="num">${e.pass_avg!=null?i(e.pass_avg):"·"}</td>
        <td class="num">${d(e.attack_attempts)}</td>
        <td class="num">${d(e.attack_err)}</td>
        <td class="num">${d(e.kills)}</td>
        <td class="num">${g(e.attack_pct)}</td>
        <td class="num">${g(B(e))}</td>
        <td class="num">${d(e.blocks)}</td>
        <td class="num">${d(e.set_total)}</td>
        <td class="num">${d(e.set_hash)}</td>
        <td class="num">${d(e.set_plus)}</td>
        <td class="num">${d(e.set_minus)}</td>
        <td class="num">${e.set_avg!=null?i(e.set_avg):"·"}</td>
        <td class="num">${d(e.errors)}</td>
      </tr>`}).join("")}function tt(t){return`<tr class="totals">
    <td colspan="3"><strong>Общо отбор</strong></td>
    <td class="num strong">${d(t.points)}</td>
    <td class="num">${d(C(t))}</td>
    <td class="num">${d(t.serve_err)}</td>
    <td class="num">${d(t.aces)}</td>
    <td class="num">${d(t.pass_total)}</td>
    <td class="num">${d(t.pass_err)}</td>
    <td class="num">${g(M(t))}</td>
    <td class="num">${g(A(t))}</td>
    <td class="num">${t.pass_avg!=null?i(t.pass_avg):"·"}</td>
    <td class="num">${d(t.attack_attempts)}</td>
    <td class="num">${d(t.attack_err)}</td>
    <td class="num">${d(t.kills)}</td>
    <td class="num">${g(t.attack_pct)}</td>
    <td class="num">${g(B(t))}</td>
    <td class="num">${d(t.blocks)}</td>
    <td class="num">${d(t.set_total)}</td>
    <td class="num">${d(t.set_hash)}</td>
    <td class="num">${d(t.set_plus)}</td>
    <td class="num">${d(t.set_minus)}</td>
    <td class="num">${t.set_avg!=null?i(t.set_avg):"·"}</td>
    <td class="num">${d(t.errors)}</td>
  </tr>`}function st(t=[]){return t.length?`<h2>Ротации (diff)</h2><table class="rot"><tr>${t.map(l=>{const n=o(l.point_diff);return`<td class="${n>0?"good":n<0?"bad":""}"><div class="rotLab">R${i(l.rotation)}</div><div class="rotDiff">${i(S(n))}</div><div class="rotPts">${i(l.points_for)}:${i(l.points_against)}</div></td>`}).join("")}</tr></table>`:""}function et(t=[]){return t.length?`<table class="sets"><tr>${t.map(e=>`<td><strong>G${i(e.set_number)}</strong> ${i(e.our_score)}:${i(e.opp_score)}</td>`).join("")}</tr></table>`:""}function at({report:t,athletes:e,sideOut:l,byRotation:n,scopeLabel:a="Целият мач"}){var R,T,L;const y=e||(t==null?void 0:t.athletes)||[],N=U(y),p=l||(t==null?void 0:t.side_out)||{},$=((R=O.find(k=>k.code===((t==null?void 0:t.format)||"bo5")))==null?void 0:R.label)||"3 от 5",u=(t==null?void 0:t.match_won_by)==="us"?"Победа":(t==null?void 0:t.match_won_by)==="opp"?"Загуба":F[t==null?void 0:t.status]||(t==null?void 0:t.status)||"",r=(t==null?void 0:t.team_name)||"Наш отбор",x=(t==null?void 0:t.opponent_name)||"противник",H=new Date().toLocaleDateString("bg-BG",{day:"numeric",month:"long",year:"numeric"}),m=((t==null?void 0:t.insights)||[]).map(k=>`<li>${i(k)}</li>`).join(""),P=`<!DOCTYPE html>
<html lang="bg"><head>
<meta charset="utf-8"/>
<title>Статистика · ${i(r)} vs ${i(x)}</title>
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
  <h1>${i(r)} vs ${i(x)}</h1>
  <div class="score">${i((T=t==null?void 0:t.sets_won_us)!=null?T:0)} : ${i((L=t==null?void 0:t.sets_won_opp)!=null?L:0)} · ${i(u)}</div>
  <p class="meta">${i($)} · ${i((t==null?void 0:t.system)||"")}
    ${t!=null&&t.match_date?` · ${i(t.match_date)}`:""}
    ${t!=null&&t.venue?` · ${i(t.venue)}`:""}
    · ${i(a)} · ${i(H)}</p>
  ${et((t==null?void 0:t.sets)||[])}

  <div class="kpi">
    <div><span>Side-out</span><strong>${i(p.side_out_won||0)}/${i(p.side_out_attempts||0)} ${p.side_out_pct!=null?i(`(${p.side_out_pct}%)`):""}</strong></div>
    <div><span>Break-point</span><strong>${i(p.break_won||0)}/${i(p.break_attempts||0)} ${p.break_pct!=null?i(`(${p.break_pct}%)`):""}</strong></div>
    <div><span>Точки</span><strong>${i(p.points_for||0)}:${i(p.points_against||0)} (${i(S(o(p.points_for)-o(p.points_against)))})</strong></div>
    <div><span>Записи</span><strong>${i((t==null?void 0:t.event_count)||0)}</strong></div>
  </div>

  ${((t==null?void 0:t.insights)||[]).length?`<h2>Изводи</h2><ul class="ins">${m}</ul>`:""}

  <h2>По състезател</h2>
  <table class="box">
    <thead>
      <tr class="grp">
        <th colspan="3"></th>
        <th>Тч</th>
        <th colspan="3">Сервис</th>
        <th colspan="5">Посрещане</th>
        <th colspan="5">Атака</th>
        <th>Бл</th>
        <th colspan="5">Вдигане</th>
        <th>Гр</th>
      </tr>
      <tr>
        <th>#</th><th>Име</th><th>Поз</th>
        <th>Tot</th>
        <th>Tot</th><th>Err</th><th>Ас</th>
        <th>Tot</th><th>Err</th><th>Pos%</th><th>Prf%</th><th>Ср</th>
        <th>Tot</th><th>Err</th><th>Pt</th><th>Pt%</th><th>Eff%</th>
        <th>Pt</th>
        <th>Tot</th><th>#</th><th>+</th><th>−</th><th>Ср</th>
        <th>Tot</th>
      </tr>
    </thead>
    <tbody>
      ${w(y)}
      ${tt(N)}
    </tbody>
  </table>

  ${st(n||(t==null?void 0:t.by_rotation)||[])}

  <p class="foot">Volley Platform · статистика на мача · при печат изберете „Запази като PDF“.</p>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };<\/script>
</body></html>`,b=window.open("","_blank","width=1100,height=800");if(!b){alert("Изскачащият прозорец е блокиран. Разрешете pop-ups, за да изтеглите PDF.");return}b.document.open(),b.document.write(P),b.document.close()}function nt({sideOut:t}){return!t||!((t.side_out_attempts||0)+(t.break_attempts||0)+(t.points_for||0)>0)?null:s.jsxs("div",{className:"matchReportSideOut",children:[s.jsxs("div",{className:"matchReportSideOutCard",children:[s.jsx("span",{className:"matchReportSideOutLabel",children:"Side-out"}),s.jsxs("strong",{children:[t.side_out_won||0,"/",t.side_out_attempts||0]}),s.jsx("span",{className:"matchReportSideOutPct",children:_(t.side_out_pct)}),s.jsx("span",{className:"matchReportSideOutHint",children:"точки при посрещане"})]}),s.jsxs("div",{className:"matchReportSideOutCard",children:[s.jsx("span",{className:"matchReportSideOutLabel",children:"Break Point"}),s.jsxs("strong",{children:[t.break_won||0,"/",t.break_attempts||0]}),s.jsx("span",{className:"matchReportSideOutPct",children:_(t.break_pct)}),s.jsx("span",{className:"matchReportSideOutHint",children:"точки при наш сервис"})]}),s.jsxs("div",{className:"matchReportSideOutCard",children:[s.jsx("span",{className:"matchReportSideOutLabel",children:"Точки"}),s.jsxs("strong",{children:[t.points_for||0,":",t.points_against||0]}),s.jsx("span",{className:"matchReportSideOutPct",children:S(o(t.points_for)-o(t.points_against))}),s.jsx("span",{className:"matchReportSideOutHint",children:"за нас : противник"})]})]})}function lt({rows:t}){return t!=null&&t.length?s.jsxs("div",{className:"matchReportRotation",children:[s.jsxs("div",{className:"matchReportSectionHead",children:[s.jsx("h3",{children:"Ротации"}),s.jsx("span",{className:"matchReportSectionHint",children:"разлика точки за/срещу"})]}),s.jsx("div",{className:"matchReportRotStrip",children:t.map(e=>{const l=o(e.point_diff),n=l>0?"is-good":l<0?"is-bad":"";return s.jsxs("div",{className:`matchReportRotCell ${n}`,children:[s.jsxs("span",{className:"matchReportRotLab",children:["R",e.rotation]}),s.jsx("strong",{children:S(l)}),s.jsxs("span",{className:"matchReportRotPts",children:[e.points_for||0,":",e.points_against||0]}),s.jsxs("span",{className:"matchReportRotSo",children:["SO ",_(e.side_out_pct)," · BP ",_(e.break_pct)]})]},e.rotation)})})]}):null}function D(t,e){const l=z(e)||e||"·";return t?`#${t} ${l}`:l}function it({rows:t,showSet:e=!0}){return t!=null&&t.length?s.jsxs("details",{className:"matchReportSubs",open:t.length<=12,children:[s.jsxs("summary",{children:["Смени ",s.jsxs("strong",{children:["(",t.length,")"]})]}),s.jsx("ol",{className:"matchReportSubsList",children:t.map(l=>s.jsxs("li",{children:[s.jsxs("span",{className:"matchReportSubsMeta",children:[e?`G${l.set_number} · `:"",l.our_score,":",l.opp_score,l.rotation?` · R${l.rotation}`:""]}),s.jsxs("span",{className:"matchReportSubsSwap",children:[s.jsx("span",{className:"matchReportSubsOut",children:D(l.out_jersey,l.out_athlete_name)}),s.jsx("span",{className:"matchReportSubsArrow","aria-hidden":!0,children:"→"}),s.jsx("span",{className:"matchReportSubsIn",children:D(l.in_jersey,l.in_athlete_name)})]})]},l.id||`${l.set_number}-${l.out_athlete_id}-${l.in_athlete_id}-${l.our_score}`))})]}):null}function ct({rows:t}){if(!(t!=null&&t.length))return s.jsx("p",{className:"coachMobileMuted",children:"Няма записи за този изглед."});const e=U(t),l=(n,a)=>s.jsxs("tr",{children:[s.jsx("td",{children:c(n.jersey_number)}),s.jsx("td",{className:"matchLiveStatTableName",children:z(n.athlete_name)||n.athlete_name}),s.jsx("td",{children:G(n.position)}),s.jsx("td",{className:"matchReportColStrong",children:c(n.points)}),s.jsx("td",{children:c(C(n))}),s.jsx("td",{children:c(n.serve_err)}),s.jsx("td",{children:c(n.aces)}),s.jsx("td",{children:c(n.pass_total)}),s.jsx("td",{children:c(n.pass_err)}),s.jsx("td",{children:_(M(n))}),s.jsx("td",{children:_(A(n))}),s.jsx("td",{children:n.pass_avg!=null?n.pass_avg:"·"}),s.jsx("td",{children:c(n.attack_attempts)}),s.jsx("td",{children:c(n.attack_err)}),s.jsx("td",{children:c(n.kills)}),s.jsx("td",{children:_(n.attack_pct)}),s.jsx("td",{children:_(B(n))}),s.jsx("td",{children:c(n.blocks)}),s.jsx("td",{children:c(n.set_total)}),s.jsx("td",{children:c(n.set_hash)}),s.jsx("td",{children:c(n.set_plus)}),s.jsx("td",{children:c(n.set_minus)}),s.jsx("td",{children:n.set_avg!=null?n.set_avg:"·"}),s.jsx("td",{children:c(n.errors)})]},a);return s.jsx("div",{className:"matchReportTableWrap",children:s.jsxs("table",{className:"matchLiveStatTable matchReportTable matchReportBox",children:[s.jsxs("thead",{children:[s.jsxs("tr",{className:"matchReportGroupRow",children:[s.jsx("th",{colSpan:3}),s.jsx("th",{children:"Тч"}),s.jsx("th",{colSpan:3,children:"Сервис"}),s.jsx("th",{colSpan:5,children:"Посрещане"}),s.jsx("th",{colSpan:5,children:"Атака"}),s.jsx("th",{children:"Бл"}),s.jsx("th",{colSpan:5,children:"Вдигане"}),s.jsx("th",{children:"Гр"})]}),s.jsxs("tr",{children:[s.jsx("th",{children:"#"}),s.jsx("th",{children:"Име"}),s.jsx("th",{children:"Поз"}),s.jsx("th",{title:"Точки (атака + ас + блок)",children:"Tot"}),s.jsx("th",{title:"Общо сервирания",children:"Tot"}),s.jsx("th",{title:"Грешки сервис",children:"Err"}),s.jsx("th",{title:"Асове",children:"Ас"}),s.jsx("th",{title:"Общо посрещания",children:"Tot"}),s.jsx("th",{title:"Грешки посрещане",children:"Err"}),s.jsx("th",{title:"Позитивно (# + +)",children:"Pos%"}),s.jsx("th",{title:"Перфектно (#)",children:"Prf%"}),s.jsx("th",{title:"Средно посрещане",children:"Ср"}),s.jsx("th",{title:"Опити атака",children:"Tot"}),s.jsx("th",{title:"Грешки атака",children:"Err"}),s.jsx("th",{title:"Точки атака",children:"Pt"}),s.jsx("th",{title:"% точки / опити",children:"Pt%"}),s.jsx("th",{title:"Ефективност (точки − грешки) / опити",children:"Eff%"}),s.jsx("th",{title:"Блок точки",children:"Pt"}),s.jsx("th",{title:"Общо вдигания",children:"Tot"}),s.jsx("th",{title:"Вдигане #",children:"#"}),s.jsx("th",{title:"Вдигане +",children:"+"}),s.jsx("th",{title:"Вдигане −",children:"−"}),s.jsx("th",{title:"Средно вдигане",children:"Ср"}),s.jsx("th",{title:"Общо грешки",children:"Tot"})]})]}),s.jsxs("tbody",{children:[t.map(n=>l(n,n.athlete_id)),s.jsxs("tr",{className:"matchReportTotalsRow",children:[s.jsx("td",{colSpan:3,children:s.jsx("strong",{children:"Общо отбор"})}),s.jsx("td",{className:"matchReportColStrong",children:c(e.points)}),s.jsx("td",{children:c(C(e))}),s.jsx("td",{children:c(e.serve_err)}),s.jsx("td",{children:c(e.aces)}),s.jsx("td",{children:c(e.pass_total)}),s.jsx("td",{children:c(e.pass_err)}),s.jsx("td",{children:_(M(e))}),s.jsx("td",{children:_(A(e))}),s.jsx("td",{children:e.pass_avg!=null?e.pass_avg:"·"}),s.jsx("td",{children:c(e.attack_attempts)}),s.jsx("td",{children:c(e.attack_err)}),s.jsx("td",{children:c(e.kills)}),s.jsx("td",{children:_(e.attack_pct)}),s.jsx("td",{children:_(B(e))}),s.jsx("td",{children:c(e.blocks)}),s.jsx("td",{children:c(e.set_total)}),s.jsx("td",{children:c(e.set_hash)}),s.jsx("td",{children:c(e.set_plus)}),s.jsx("td",{children:c(e.set_minus)}),s.jsx("td",{children:e.set_avg!=null?e.set_avg:"·"}),s.jsx("td",{children:c(e.errors)})]})]})]})})}function rt(){const{teamId:t,matchId:e}=W(),l=Number(t),n=Number(e),[a,y]=f.useState(null),[N,p]=f.useState(!0),[$,u]=f.useState(""),[r,x]=f.useState("all");f.useEffect(()=>{let h=!0;return(async()=>{try{p(!0),u("");const j=await q.get(J.TEAM_MATCH_REPORT(l,n));if(!h)return;y(j.data)}catch(j){if(!h)return;u(X(j,"Неуспешно зареждане на отчета."))}finally{h&&p(!1)}})(),()=>{h=!1}},[l,n]);const H=f.useMemo(()=>{var j;const h=(a==null?void 0:a.format)||"bo5";return((j=O.find(K=>K.code===h))==null?void 0:j.label)||"3 от 5"},[a==null?void 0:a.format]),m=f.useMemo(()=>{if(!a||r==="all")return null;const h=Number(String(r).replace("set:",""));return(a.by_set||[]).find(j=>Number(j.set_number)===h)||null},[a,r]),P=f.useMemo(()=>a?r==="all"?a.athletes||[]:(m==null?void 0:m.athletes)||[]:[],[a,r,m]),b=r==="all"?a==null?void 0:a.side_out:m==null?void 0:m.side_out,R=r==="all"?a==null?void 0:a.by_rotation:m==null?void 0:m.by_rotation,T=r==="all"?a==null?void 0:a.substitutions:m==null?void 0:m.substitutions,L=r==="all"?"Целият мач":`Гейм ${(m==null?void 0:m.set_number)||""}`,k=f.useMemo(()=>a?Z(a,{sideOut:b,byRotation:R}):[],[a,b,R]);if(N)return s.jsx("p",{className:"coachMobileMuted",children:"Зареждане на отчет..."});if($)return s.jsx(Q,{title:"Грешка",description:$});if(!a)return null;const V=a.match_won_by==="us"?"Победа":a.match_won_by==="opp"?"Загуба":F[a.status]||a.status,Y=a.team_name||"Наш отбор";return s.jsxs("section",{className:"matchReportPage",children:[s.jsxs("div",{className:"matchReportTop",children:[s.jsx(E,{to:`/coach/teams/${l}/matches`,className:"matchLiveBack",children:"← Мачове"}),s.jsxs("div",{className:"matchReportMeta",children:[s.jsx("p",{className:"matchReportBrand",children:"Volley Platform · Tabellino"}),s.jsxs("h2",{children:[Y," ",s.jsx("span",{className:"matchReportVs",children:"vs"})," ",a.opponent_name||"противник"]}),s.jsxs("p",{className:"matchReportScoreLine",children:[s.jsxs("strong",{children:[a.sets_won_us,":",a.sets_won_opp]})," ","· ",V," · ",H," · ",a.system,a.match_date?` · ${a.match_date}`:"",a.venue?` · ${a.venue}`:""]})]}),s.jsxs("div",{className:"matchReportTopActions",children:[s.jsx("button",{type:"button",className:"matchReportLinkBtn matchReportLinkBtn--pdf",onClick:()=>at({report:a,athletes:P,sideOut:b,byRotation:R,scopeLabel:L}),children:"PDF"}),s.jsx(E,{to:`/coach/teams/${l}/matches/${n}`,className:"matchReportLinkBtn",children:"Настройки"}),s.jsx(E,{to:`/coach/teams/${l}/matches/${n}/video`,className:"matchReportLinkBtn",children:"Видео"}),a.status!=="finished"?s.jsx(E,{to:`/coach/teams/${l}/matches/${n}/live`,className:"matchReportLinkBtn matchReportLinkBtn--live",children:"Live"}):null]})]}),(a.sets||[]).length>0?s.jsx("div",{className:"matchLiveSetStrip matchReportSetStrip","aria-label":"Резултат по геймове",children:(a.sets||[]).map(h=>s.jsxs("span",{className:h.status==="finished"?"is-done":"is-live",children:["G",h.set_number," ",h.our_score,":",h.opp_score]},h.set_number))}):null,k.length?s.jsx("div",{className:"matchReportChips","aria-label":"Бързи изводи",children:k.map(h=>s.jsxs("div",{className:`matchReportChip matchReportChip--${h.tone||"neutral"}`,children:[s.jsx("span",{className:"matchReportChipLabel",children:h.label}),s.jsx("strong",{children:h.value}),h.sub?s.jsx("span",{className:"matchReportChipSub",children:h.sub}):null]},h.id))}):null,(a.insights||[]).length?s.jsxs("details",{className:"matchReportInsights",children:[s.jsxs("summary",{children:["Изводи ",s.jsxs("span",{className:"matchReportEventCount",children:["· ",a.event_count||0," записа"]})]}),s.jsx("ul",{children:(a.insights||[]).map(h=>s.jsx("li",{children:h},h))})]}):null,s.jsxs("div",{className:"matchReportTabs",role:"tablist","aria-label":"Филтър по гейм",children:[s.jsx("button",{type:"button",role:"tab",className:r==="all"?"is-active":"","aria-selected":r==="all",onClick:()=>x("all"),children:"Целият мач"}),(a.by_set||[]).map(h=>s.jsxs("button",{type:"button",role:"tab",className:r===`set:${h.set_number}`?"is-active":"","aria-selected":r===`set:${h.set_number}`,onClick:()=>x(`set:${h.set_number}`),children:["Гейм ",h.set_number]},h.set_number))]}),s.jsx(nt,{sideOut:b}),s.jsx(lt,{rows:R}),s.jsxs("div",{className:"matchReportSectionHead",children:[s.jsx("h3",{className:"matchReportPlayersTitle",children:"По състезател"}),s.jsx("span",{className:"matchReportSectionHint",children:"Pos% = # + + · Prf% = # · Eff% = (Pt − Err) / Tot"})]}),s.jsx(ct,{rows:P}),s.jsx(it,{rows:T||[],showSet:r==="all"})]})}export{rt as default};
