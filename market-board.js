const BOARD_DAY=86400000;
function boardBondProxy(payload) {
  const tenors=['DGS2','DGS5','DGS10','DGS30'].map(id=>new Map(macroClean(payload?.series?.[id]?.rows).map(r=>[r.date,r.value])));
  const dates=[...tenors[0].keys()].filter(date=>tenors.every(t=>t.has(date))).sort();
  const result=[];
  // Preserve the original 21-change population variance, annualization and scaling.
  for(let i=21;i<dates.length;i++){
    const annualized=tenors.map(t=>{
      const sample=dates.slice(i-20,i+1).map((date,j)=>(t.get(date)-t.get(dates[i-21+j]))*100);
      const mean=sample.reduce((a,b)=>a+b,0)/21;
      return Math.sqrt(sample.reduce((sum,x)=>sum+(x-mean)**2,0)/21)*Math.sqrt(252);
    });
    const raw=1.1255*annualized.reduce((a,b)=>a+b,0)/4;
    result.push({date:dates[i],value:Math.max(55,Math.min(180,raw)),raw});
  }
  return result.slice(-260);
}
function boardBondRegime(value) {
  if(!Number.isFinite(value))return {label:'자료 미확보',score:null,index:-1};
  return value<80?{label:'안정',score:1,index:0}:value<100?{label:'주의',score:0,index:1}:value<120?{label:'높음',score:-1,index:2}:{label:'스트레스',score:-1,index:3};
}
function boardFresh(date,days=7,now=Date.now()) {const age=now-Date.parse(date);return Number.isFinite(age)&&age>=0&&age<=days*BOARD_DAY;}
function boardTrend(rows,weeks) {
  const last=rows.at(-1);if(!last)return null;
  const target=Date.parse(last.date)-weeks*7*BOARD_DAY;
  const prior=rows.filter(r=>Date.parse(r.date)<=target).at(-1);
  return prior&&target-Date.parse(prior.date)<=7*BOARD_DAY?last.value-prior.value:null;
}
function boardSignals(data,now=Date.now()) {
  const s={...data.macro?.series,...data.liquidity?.series},rows=id=>macroClean(s[id]?.rows),rate=rows('DGS10'),liq=rows('WRESBAL');
  const f=data.fear?.fear_and_greed,p=data.options?.rows?.at(-1),r=macroStats(rate,100),l=s.WRESBAL?.failed?null:boardTrend(liq,4),proxy=boardBondProxy(data.macro).at(-1);
  const signal=(name,value,date,score,rule,days=7)=>({name,value,date,score:boardFresh(date,days,now)&&Number.isFinite(score)?score:null,rule});
  return [
    signal('유동성',l===null?'미확보':macroSigned(l/1000,'$B / 4주 전 대비'),liq.at(-1)?.date,l===null?null:l>10000?1:l< -10000?-1:0,'주간 지급준비금 · '+(liquidityCompare(liq,4)?liquidityCompare(liq,4).from+' → '+liquidityCompare(liq,4).to:'비교 자료 부족')+' · ±$10B',14),
    signal('금리',r.week===null?'미확보':macroSigned(r.week,'bp / 최근 5거래일'),r.last?.date,r.week===null?null:r.week>5?-1:r.week< -5?1:0,'10년 금리 최근 5거래일 변화 ±5bp'),
    signal('옵션 · Equity P/C',typeof p?.equity_pc==='number'?p.equity_pc.toFixed(2):'미확보',p?.date,typeof p?.equity_pc!=='number'?null:p.equity_pc<0.6?1:p.equity_pc>0.8?-1:0,'Equity P/C <0.6 선호 / >0.8 회피'),
    signal('Fear & Greed',typeof f?.score==='number'?f.score.toFixed(0)+' / 100':'미확보',f?.timestamp,typeof f?.score!=='number'?null:f.score>=55?1:f.score<=45?-1:0,'55 이상 선호 / 45 이하 회피'),
    signal('국채 변동성 · 대체',proxy?proxy.value.toFixed(1)+' / 자체 지수':'미확보',proxy?.date,boardBondRegime(proxy?.value).score,'공식 MOVE 아님 · <80 우호 / 80~100 중립 / ≥100 부담')
  ];
}
function boardComposite(signals) {
  const valid=signals.filter(x=>x.score!==null),sum=valid.reduce((a,b)=>a+b.score,0),score=valid.length?Math.round(50+50*sum/valid.length):null;
  return {score,count:valid.length,label:valid.length<3?'판단 보류':score>=65?'Risk-On 우세':score<=35?'Risk-Off 우세':'혼조 · 중립'};
}
function boardNarrative(data,signals,now=Date.now()) {
  const clauses=[],[liq,rate,options,fear,bond]=signals;
  const direction=s=>s.score>0?'우호적입니다':s.score<0?'부담입니다':'중립 범위입니다';
  if(liq.score!==null){
    const rows=macroClean((data.liquidity?.series?.WRESBAL||data.macro?.series?.WRESBAL)?.rows),change=boardTrend(rows,4);
    clauses.push('은행 지급준비금은 4주 전 대비 '+Math.abs(change/100).toFixed(0)+'억 달러 '+(change>0?'증가해':change<0?'감소해':'변화가 없어')+' 유동성 여건이 '+direction(liq)+'.');
    const context=[];
    for(const [id,label,mult] of [['TGA','TGA 일별 잔고',0.001],['RRPONTSYD','ON RRP',1]]){
      const series=macroClean((data.liquidity?.series?.[id]||data.macro?.series?.[id])?.rows),delta=boardTrend(series,4);
      if(delta!==null&&!data.liquidity?.series?.[id]?.failed&&boardFresh(series.at(-1)?.date,id==='TGA'||id==='RRPONTSYD'?5:14,now))context.push(label+'는 4주 전 대비 '+Math.abs(delta*mult*10).toFixed(0)+'억 달러 '+(delta>0?'늘어 유동성 흡수 방향':delta<0?'줄어 유동성 공급 방향':'변화가 없는 상태'));
    }
    if(context.length)clauses.push(context.join(', ')+'입니다.');
  }
  if(rate.score!==null){const stats=macroStats(macroClean(data.macro?.series?.DGS10?.rows),100);clauses.push('미 국채 10년 금리는 최근 5거래일 동안 '+Math.abs(stats.week).toFixed(0)+'bp '+(stats.week>0?'올라':stats.week<0?'내려':'변동해')+' 금리 여건이 '+direction(rate)+'.');}
  if(bond.score!==null)clauses.push('국채 변동성 대체지표는 '+(bond.score>0?'안정권으로 우호적입니다':bond.score<0?'높아 부담입니다':'주의 구간으로 중립입니다')+'.');
  if(fear.score!==null)clauses.push('Fear & Greed '+Math.round(data.fear.fear_and_greed.score)+'점은 '+(fear.score>0?'위험선호':fear.score<0?'위험회피':'중립')+' 심리를 보여줍니다.');
  if(options.score!==null)clauses.push('옵션 심리도 '+direction(options)+'.');
  const missing=signals.filter(s=>s.score===null).map(s=>s.name);
  if(missing.length)clauses.push(missing.join(' · ')+' 지표는 최신 자료가 부족해 해석에서 제외했습니다.');
  return clauses.join(' ');
}
function boardStatusGauge(overall) {
  const box=radarNode('div',undefined,'board-status-gauge'),valid=overall.count>=3;
  const heading=radarNode('div',undefined,'status-score');
  heading.append(radarNode('span','시장환경 점수'),radarNode('strong',valid?String(overall.score):'—'),radarNode('small','/ 100'));
  box.append(heading);
  const track=radarNode('div',undefined,'status-track');
  track.setAttribute('role','meter');track.setAttribute('aria-label','시장환경 점수');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
  if(valid){track.setAttribute('aria-valuenow',overall.score);track.setAttribute('aria-valuetext',overall.score+'점, '+overall.label);const marker=radarNode('span',undefined,'status-marker');marker.style.left=overall.score+'%';track.append(marker);}
  else track.setAttribute('aria-valuetext','자료 부족으로 판단 보류');
  box.append(track);
  const labels=radarNode('div',undefined,'status-labels');['위험회피','중립','위험선호'].forEach(t=>labels.append(radarNode('span',t)));box.append(labels);
  box.append(radarNode('small','0 위험회피 · 50 균형 · 100 위험선호','status-explainer'));
  return box;
}
function boardUpcoming(events,now=Date.now(),days=7) {return (events||[]).filter(e=>Date.parse(e.at)>=now&&Date.parse(e.at)<now+days*BOARD_DAY).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));}
async function boardFetch(file) {
  if(location.hostname==='127.0.0.1'||location.hostname==='localhost'){const r=await fetch('./'+file,{cache:'no-store'});if(!r.ok)throw Error();return r.json();}
  try {const r=await fetchWithTimeout('https://raw.githubusercontent.com/ewmhb/InvestDashboard/main/'+file+'?v='+Math.floor(Date.now()/900000),{credentials:'omit'},12000);if(!r.ok)throw Error();return await r.json();}
  catch {const r=await fetchWithTimeout('./'+file,{cache:'no-store'},8000);if(!r.ok)throw Error();const data=await r.json();data.localFallback=true;return data;}
}
function boardSection(title,description,id) {const el=radarNode('section',undefined,'radar-panel board-section');el.id=id;el.append(radarNode('h2',title),radarNode('p',description,'board-subtitle'));return el;}
function boardCard(label,value,detail) {const el=radarNode('article',undefined,'board-card');el.append(radarNode('h3',label),radarNode('strong',value),radarNode('p',detail));return el;}
function boardTime(at) {return new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false})+' KST';}
function boardDrawCharts(container,data){const previous=container.querySelector('[data-legacy-id="moveIndicator"]'),next=legacyBondCard(data);if(previous)previous.replaceWith(next);else container.append(next);}
async function setupMarketBoard() {
  const shell=document.querySelector('.shell'),oldDetail=document.querySelector('.macro-detail');
  document.querySelector('.radar-compact')?.remove();
  const nowPanel=boardSection('MARKET NOW','주식을 살 환경인가? 시장의 위험선호와 부담 요인을 함께 확인합니다.','marketNow');
  const summary=radarNode('div','시장 자료 확인 중…','board-summary');summary.setAttribute('aria-live','polite');
  const signalsGrid=radarNode('div',undefined,'board-signals');nowPanel.append(summary,signalsGrid);
  const chartPair=radarNode('div',undefined,'board-chart-pair board-detail-charts');
  const originalFear=oldDetail?.querySelector('#fearGreedIndicator');
  if(originalFear)chartPair.append(originalFear);
  oldDetail?.querySelector('.risk-indicators')?.prepend(chartPair);
  const methodology=radarNode('details',undefined,'board-method');methodology.append(radarNode('summary','종합 신호의 기준과 한계'),radarNode('p','연결된 5개 축에 동일 가중치를 적용합니다. 선호 +1, 중립 0, 회피 −1을 평균해 0~100으로 환산합니다. 국채 변동성 축은 공식 MOVE 대신 자체 대체지표를 사용하며, 80 미만 +1 / 80 이상 100 미만 0 / 100 이상 −1을 반영합니다. 65 이상 Risk-On, 35 이하 Risk-Off입니다. 3개 축 미만이면 판단을 보류합니다. 미확보·오래된 자료는 제외하며, 일부 축이 없으면 잠정 신호입니다. 임의 기준의 환경 요약으로 상승 확률이나 매수 추천이 아닙니다. 심리와 옵션은 일부 겹치며 극단적 심리는 반전될 수 있습니다. 금리 하락도 경기 둔화 때문일 수 있으므로 원인을 확인하세요.'));
  const rateDetail=radarNode('details',undefined,'board-method');rateDetail.append(radarNode('summary','금리 수준 · 실질금리 · 과거 변동성 자세히 보기'));nowPanel.append(rateDetail,methodology);
  const liquidity=boardSection('LIQUIDITY','최근 발표 잔고와 각 관측일 기준 1주전대비 · 4주전대비 · 13주전대비 · 단위 $B (10억 달러)','liquidityBoard');
  const liquidityBody=radarNode('div','유동성 자료 확인 중…','board-table-wrap');liquidity.append(liquidityBody);
  const week=boardSection('THIS WEEK','지금부터 7일간 · 한국시간 · CPI / PPI / 고용 / FOMC','thisWeek');
  const calendarBody=radarNode('div','공식 일정 확인 중…','board-events');week.append(calendarBody);
  const stock=boardSection('MY STOCK','미국 주식 티커를 입력하면 차트와 밸류에이션을 확인할 수 있습니다.','myStock');

  const control=document.querySelector('.control-bar'),chart=document.querySelector('.stock-chart-card'),metrics=document.querySelector('.metrics'),briefing=document.getElementById('visitChanges'),workspace=document.querySelector('.workspace');
  const valuation=document.querySelector('.valuation-card'),quote=document.getElementById('quoteWidget')?.closest('article');
  stock.append(control,chart);
  if(quote)stock.append(quote);
  if(valuation){valuation.style.cssText='margin-top:18px;padding:18px;border:1px solid var(--line);border-radius:8px;background:#fff;min-width:0';stock.append(valuation);}
  const news=boardSection('NEWS','선택 종목의 새로운 기사와 공식 소식','newsBoard');news.append(briefing,metrics,workspace);
  const hero=document.querySelector('.hero'),tape=document.querySelector('.market-strip');
  shell.replaceChildren(hero,nowPanel,liquidity,week,stock,news);
  nowPanel.append(tape);
  if(oldDetail){oldDetail.querySelector('summary').textContent='기존 지표 상세 · 차트와 출처';liquidity.append(oldDetail);}
  document.querySelector('.lead').textContent='시장 환경부터 확인하고, 내 종목의 일정과 뉴스를 살펴보세요.';
  const data={};
  const refreshData=async()=>{await Promise.all([loadLiquidityData().then(x=>{data.liquidity=x}).catch(()=>{}), ...[['macro','macro_data.json'],['fear','fear_greed.json'],['options','options_sentiment.json'],['calendar','economic_calendar.json']].map(async([key,file])=>{try{data[key]=await boardFetch(file)}catch{}})]);};
  await refreshData();
  function drawMarket(){
    const signals=boardSignals(data),overall=boardComposite(signals);
    summary.dataset.state=overall.label.startsWith('Risk-On')?'on':overall.label.startsWith('Risk-Off')?'off':'mixed';
    const summaryText=radarNode('div',undefined,'board-summary-text');
    summaryText.append(radarNode('span','시장 종합 신호','status-eyebrow'),radarNode('strong',overall.label));
    summaryText.append(radarNode('p',boardNarrative(data,signals),'status-narrative'));
    summaryText.append(radarNode('small','지표 '+overall.count+'개 반영'+(overall.count<5?' / 전체 5개 · 잠정':'')+' · 일별·주별 자료','status-coverage'));
    summary.replaceChildren(summaryText,boardStatusGauge(overall));
    signalsGrid.replaceChildren();signals.forEach(s=>{const card=boardCard(s.name,s.value,s.score===null?'미확보 또는 오래된 자료 · 종합 제외':s.score>0?'위험선호에 우호':s.score<0?'위험회피 요인':'중립');card.dataset.signal=s.score===null?'missing':s.score>0?'on':s.score<0?'off':'mixed';card.append(radarNode('small',s.date?'기준 '+s.date.slice(0,10):'기준일 미확보'),radarNode('small',s.rule));signalsGrid.append(card);});
    boardDrawCharts(chartPair,data);
  }
  drawMarket();
  if(data.macro){const built=macroBuild(data.macro),grid=radarNode('div',undefined,'macro-grid');for(const [id,label,unit] of [['DFII10','10년 실질금리','%'],['T10YIE','10년 손익분기 인플레이션','%'],['REALIZED','10년 금리 실현변동성','bp/일'],['VIXCLS','주식 예상 변동성 VIX','pt']]){const rows=built[id],last=rows.at(-1),card=boardCard(label,last?last.value.toFixed(2)+' '+unit:'미확보',id==='REALIZED'?'20개 일간 금리 변화의 표본 표준편차 · MOVE와 다릅니다.':id==='T10YIE'?'물가 전망 외 위험·유동성 프리미엄도 포함합니다.':'최근 3개월 추세');if(last){card.append(radarNode('small','기준 '+last.date),macroChart(rows,label,90,last.date));}grid.append(card);}rateDetail.append(grid);}
  function drawLiquidity(){
    const table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');
    ['지표','최근 발표 잔고','1주전대비','4주전대비','13주전대비','관측일 · 주기'].forEach(t=>tr.append(radarNode('th',t)));thead.append(tr);table.append(thead);const body=document.createElement('tbody');
    for(const [id,name,mult,frequency] of [['TGA','TGA (일별 잔고)',0.001,'일별'],['RRPONTSYD','ON RRP',1,'일별'],['WRESBAL','은행 지급준비금',0.001,'주간 평균'],['WALCL','연준 총자산',0.001,'주간 수요일']]){
      const source=data.liquidity?.series?.[id],rows=macroClean(source?.rows).map(r=>({...r,value:r.value*mult})),last=rows.at(-1),row=document.createElement('tr'),title=document.createElement('th');
      title.append(officialLink(name,source?.source||(id==='TGA'?'https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/operating-cash-balance':'https://fred.stlouisfed.org/series/'+id)));
      row.append(title,radarNode('td',last?last.value.toLocaleString('en-US',{maximumFractionDigits:1}):'미확보'));
      for(const w of [1,4,13]){const change=liquidityCompare(rows,w),cell=radarNode('td',macroSigned(change?.value??null,'$B'));if(change){const period=radarNode('small',change.from+' → '+change.to);period.style.display='block';period.style.whiteSpace='nowrap';cell.append(period)}row.append(cell)}
      row.append(radarNode('td',last?last.date+' · '+frequency+' · '+liquiditySeriesStatus(source):'자료 미확보'));body.append(row);
    }
    table.append(body);
    const checked=data.liquidity?.updated_at;
    liquidityBody.replaceChildren(table,radarNode('p','자료 확인 '+(checked?new Date(checked).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST':'실패')+(data.liquidity?.failed?' · 일부 수집 실패':'')+(data.liquidity?.localFallback?' · 사이트 보관본':''),'board-subtitle'),radarNode('p','4주는 오늘이 아니라 각 행의 최신 관측일에서 28일 전과 비교합니다. 휴일에는 그 이전의 가장 가까운 관측값을 사용하며 실제 비교 날짜를 표시합니다. TGA는 상세 차트와 같은 일별 마감 잔고입니다. 지급준비금·연준 자산은 매주 발표되므로 다음 발표 전까지 관측일이 유지됩니다.','board-subtitle'));
    if(data.liquidity)renderLiquidityDetails(data.liquidity);
  }
  drawLiquidity();
  function drawCalendar(){calendarBody.replaceChildren();const upcoming=boardUpcoming(data.calendar?.events);const sources=data.calendar?.sources||{};calendarBody.append(radarNode('p','공식 일정 확인: '+Object.entries(sources).map(([k,v])=>k+' '+(v.checkedAt?.slice(0,10)||'미확인')+(v.failed?' (갱신 실패)':'')).join(' · '),'board-subtitle'));if(!upcoming.length)calendarBody.append(radarNode('p',data.calendar?'저장된 공식 일정 중 앞으로 7일에 해당하는 발표가 없습니다.':'일정을 불러오지 못했습니다. 공식 달력에서 확인하세요.'));upcoming.forEach(e=>{const card=boardCard(e.title,boardTime(e.at),'중요도 '+(e.importance||'높음'));card.append(officialLink('공식 일정',e.source));calendarBody.append(card);});calendarBody.append(officialLink('BLS 전체 일정','https://www.bls.gov/schedule/'),officialLink('FOMC 공식 일정','https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'));}
  drawCalendar();
  setInterval(()=>{drawMarket();drawCalendar();},60000);
  let refreshing=false;async function refreshAll(){if(refreshing||document.hidden)return;refreshing=true;try{await refreshData();drawMarket();drawLiquidity();drawCalendar()}finally{refreshing=false}}
  setInterval(refreshAll,300000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshAll()});
}
if(typeof document!=='undefined')setupMarketBoard().catch(error=>{console.error('Market board:',error);const box=document.getElementById('marketNow');if(box)box.append(radarNode('p','일부 화면을 불러오지 못했습니다. 새로고침해 주세요.'));});
