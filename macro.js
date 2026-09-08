function macroClean(rows) {
  return [...new Map((rows||[]).filter(r=>r&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&typeof r.value==='number'&&Number.isFinite(r.value)).map(r=>[r.date,r])).values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function macroJoin(left,right,operation) {
  const lookup=new Map(right.map(r=>[r.date,r.value]));
  return left.filter(r=>lookup.has(r.date)).map(r=>({date:r.date,value:operation(r.value,lookup.get(r.date))}));
}
function macroVolatility(rows) {
  const changes=rows.slice(1).map((r,i)=>({date:r.date,value:(r.value-rows[i].value)*100}));
  return changes.slice(19).map((r,i)=>{
    const sample=changes.slice(i,i+20).map(x=>x.value),mean=sample.reduce((a,b)=>a+b,0)/20;
    return {date:r.date,value:Math.sqrt(sample.reduce((sum,x)=>sum+(x-mean)**2,0)/19)};
  });
}
function macroStats(rows,multiplier=1) {
  const last=rows.at(-1);
  return {last,day:rows.length>1?(last.value-rows.at(-2).value)*multiplier:null,week:rows.length>5?(last.value-rows.at(-6).value)*multiplier:null};
}
function macroBuild(payload) {
  const series={};
  for(const id of ['DGS2','DGS10','DFII10','T10YIE','VIXCLS'])series[id]=macroClean(payload.series?.[id]?.rows);
  series.SPREAD=macroJoin(series.DGS10,series.DGS2,(a,b)=>(a-b)*100);
  series.REALIZED=macroVolatility(series.DGS10);
  return series;
}
function macroSigned(value,unit) {return value===null?'미확보':(value>0?'+':'')+value.toFixed(2)+' '+unit;}
function macroSummary(series) {
  const ids=['DGS2','DGS10','DFII10','T10YIE','VIXCLS','REALIZED'];
  const common=series.DGS10.filter(row=>ids.every(id=>series[id].some(r=>r.date===row.date))).map(r=>r.date);
  if(common.length<2)return {text:'같은 기준일의 자료가 부족해 시장 요약을 보류합니다.',date:null};
  const date=common.at(-1),previous=common.at(-2);
  const direction=id=>{const rows=series[id],a=rows.find(r=>r.date===date).value,b=rows.find(r=>r.date===previous).value;return Math.abs(a-b)<0.00001?'보합':a>b?'상승':'하락';};
  return {date,previous,text:'10년 금리 '+direction('DGS10')+' · 과거 금리 변동성 '+direction('REALIZED')+' · VIX '+direction('VIXCLS'),detail:'2년 금리 '+direction('DGS2')+' · 10년 실질금리 '+direction('DFII10')+' · 기대인플레이션 '+direction('T10YIE')};
}
function macroChart(rows,label,days,end) {
  const cutoff=new Date(end+'T00:00:00Z').getTime()-days*86400000;
  const points=rows.filter(r=>new Date(r.date+'T00:00:00Z').getTime()>=cutoff&&r.date<=end);
  if(points.length<2)return radarNode('p','선택한 기간의 관측값이 부족합니다.');
  const low=Math.min(...points.map(r=>r.value)),high=Math.max(...points.map(r=>r.value)),span=Math.max(high-low,0.01);
  const x=r=>48+(new Date(r.date+'T00:00:00Z').getTime()-cutoff)/(days*86400000)*330,y=r=>18+(high-r.value)/span*88;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 400 140');svg.setAttribute('role','img');svg.setAttribute('aria-label',label+' '+points[0].date+'부터 '+points.at(-1).date+'까지 추세');
  svg.innerHTML='<line x1="48" x2="380" y1="106" y2="106" stroke="#d6e1df"/><path fill="none" stroke="#147966" stroke-width="2.5" d="'+points.map((r,i)=>(i?'L':'M')+x(r).toFixed(2)+' '+y(r).toFixed(2)).join(' ')+'"/><text x="2" y="22">'+high.toFixed(2)+'</text><text x="2" y="107">'+low.toFixed(2)+'</text><text x="48" y="132">'+new Date(cutoff).toISOString().slice(5,10)+'</text><text x="380" y="132" text-anchor="end">'+end.slice(5)+'</text>';
  return svg;
}
const MACRO_CARDS=[
  ['DGS2','금리 수준','미국채 2년','%','bp',100,'단기 국채 금리입니다. 정책금리 기대와 함께 살펴보세요.'],
  ['DGS10','금리 수준','미국채 10년','%','bp',100,'장기 국채 금리입니다. 방향과 절대 수준은 별개입니다.'],
  ['SPREAD','금리 구조','10년 − 2년 금리차','bp','bp',1,'양수는 장기금리가 더 높은 상태, 음수는 역전 상태입니다.'],
  ['DFII10','금리 구성','10년 실질금리','%','bp',100,'물가연동국채(TIPS) 수익률입니다.'],
  ['T10YIE','금리 구성','10년 기대인플레이션','%','bp',100,'명목·실질금리 차이인 손익분기 인플레이션율입니다. 순수한 물가 전망 외 위험·유동성 프리미엄도 포함됩니다.'],
  ['REALIZED','과거 변동성','10년 금리 실현변동성','bp/일','bp/일',1,'최근 20개 일간 금리 변화(bp)의 표본 표준편차입니다. 연율화하지 않으며 MOVE와 다른 지표입니다.'],
  ['VIXCLS','주식 변동성','VIX 일별 종가','pt','pt',1,'주식 옵션에 반영된 예상 변동성입니다. 채권 변동성과 구분합니다.']
];
async function setupMacroNow() {
  const panel=radarNode('section',undefined,'radar-panel macro-now');panel.setAttribute('aria-label','Market Now 매크로');
  const head=radarNode('div',undefined,'macro-head');head.append(radarNode('div',undefined));head.firstChild.append(radarNode('h2','Market Now'),radarNode('p','금리의 방향과 변동성을 따로 읽습니다.'));
  const label=radarNode('label','차트 기간 '),select=document.createElement('select');
  for(const [value,text] of [[30,'1개월'],[90,'3개월'],[365,'1년']]){const option=radarNode('option',text);option.value=value;select.append(option);}select.value='90';label.append(select);head.append(label);
  const summary=radarNode('div','공통 매크로 자료를 불러오고 있습니다.','macro-summary'),stamp=radarNode('p',undefined,'macro-note'),grid=radarNode('div',undefined,'macro-grid');
  panel.append(head,summary,stamp,grid);document.querySelector('.market-strip').after(panel);
  let payload;
  try {
    const response=await fetchWithTimeout('https://raw.githubusercontent.com/ewmhb/InvestDashboard/main/macro_data.json?v='+Math.floor(Date.now()/300000),{credentials:'omit'},12000);
    if(!response.ok)throw new Error('unavailable');payload=await response.json();
  } catch {
    try {const response=await fetch('./macro_data.json',{cache:'no-store'});if(!response.ok)throw new Error('unavailable');payload=await response.json();stamp.textContent='최근 공통 자료 연결 실패 · 배포 시 저장된 자료를 표시합니다.';}catch{summary.textContent='매크로 자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.';return;}
  }
  if(payload.version!==1||!payload.series){summary.textContent='매크로 데이터 형식을 확인하세요.';return;}
  const series=macroBuild(payload),overall=macroSummary(series),latestDates=Object.values(series).flatMap(rows=>rows.length?[rows.at(-1).date]:[]),end=latestDates.sort().at(-1);
  if(!end){summary.textContent='유효한 금리 자료가 없습니다.';return;}
  summary.replaceChildren(radarNode('strong',overall.text));
  if(overall.detail)summary.append(radarNode('p',overall.detail));
  summary.append(radarNode('small',overall.date?'요약 공통 기준 '+overall.date+' · 비교일 '+overall.previous+' · MOVE는 자료 미확보로 요약 제외':'요약 대기'));
  if(overall.date&&Date.now()-new Date(overall.date+'T00:00:00Z').getTime()>7*86400000)summary.append(radarNode('p','공통 기준일이 오래되었습니다. 현재 시장 판단에는 최신 자료를 확인하세요.'));
  if(Object.values(payload.series).some(item=>item.failed))summary.append(radarNode('p','일부 지표 갱신 실패 · 마지막 확보 자료로 계산했습니다.'));
  const differing=new Set(latestDates).size>1;
  stamp.textContent+=(stamp.textContent?' · ':'')+'일별 자료 · 실시간 아님 · 수집 '+new Date(payload.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST'+(differing?' · 지표별 최신 기준일이 다릅니다.':'');
  function draw(){
    grid.replaceChildren();
    for(const [id,group,title,unit,changeUnit,mult,note] of MACRO_CARDS){
      const card=radarNode('article',undefined,'macro-card'),rows=series[id],stats=macroStats(rows,mult),sourceId=id==='SPREAD'?'DGS10':id==='REALIZED'?'DGS10':id;
      card.append(radarNode('span',group,'macro-group'),radarNode('h3',title),radarNode('strong',stats.last?stats.last.value.toFixed(2)+' '+unit:'미제공','macro-value'));
      card.append(radarNode('p','직전 관측 대비 '+macroSigned(stats.day,changeUnit)+' · 5개 관측 전 대비 '+macroSigned(stats.week,changeUnit),'macro-changes'));
      const failed=payload.series[sourceId]?.failed||(id==='SPREAD'&&payload.series.DGS2?.failed),old=stats.last&&(Date.now()-new Date(stats.last.date+'T00:00:00Z').getTime()>7*86400000);
      card.append(radarNode('small',(stats.last?'기준 '+stats.last.date:'기준일 미확보')+(failed?' · 갱신 실패':'')+(old?' · 오래된 자료':'')));
      card.append(macroChart(rows,title,Number(select.value),end),radarNode('p',note,'macro-note'));
      const link=officialLink('출처 · FRED','https://fred.stlouisfed.org/series/'+sourceId);card.append(link);grid.append(card);
    }
    const move=radarNode('article',undefined,'macro-card macro-unavailable');move.append(radarNode('span','예상 채권 변동성','macro-group'),radarNode('h3','MOVE'),radarNode('strong','공식 데이터 미연결','macro-value'),radarNode('p','미국채 옵션에 반영된 예상 금리 변동성입니다. 금리 수준이나 과거 실현변동성과 구분합니다.'),radarNode('p','기존 자체 계산값은 공식 MOVE로 표시하지 않습니다.','macro-note'),officialLink('MOVE 제공처 확인','https://developer.ice.com/fixed-income-data-services/catalog/ice-data-indices-move-index'));grid.append(move);
  }
  select.addEventListener('change',draw);draw();
}
if(typeof document!=='undefined')setupMacroNow();
