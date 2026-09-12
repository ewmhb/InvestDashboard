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
  const s=data.macro?.series||{},rows=id=>macroClean(s[id]?.rows),rate=rows('DGS10'),liq=rows('WRESBAL');
  const f=data.fear?.fear_and_greed,p=data.options?.rows?.at(-1),r=macroStats(rate,100),l=boardTrend(liq,4),proxy=boardBondProxy(data.macro).at(-1);
  const signal=(name,value,date,score,rule,days=7)=>({name,value,date,score:boardFresh(date,days,now)&&Number.isFinite(score)?score:null,rule});
  return [
    signal('유동성',l===null?'미확보':macroSigned(l/1000,'$B / 4주'),liq.at(-1)?.date,l===null?null:l>10000?1:l< -10000?-1:0,'지급준비금 4주 변화 ±$10B',14),
    signal('금리',r.week===null?'미확보':macroSigned(r.week,'bp / 5관측'),r.last?.date,r.week===null?null:r.week>5?-1:r.week< -5?1:0,'10년 금리 5관측 변화 ±5bp'),
    signal('옵션 · Equity P/C',typeof p?.equity_pc==='number'?p.equity_pc.toFixed(2):'미확보',p?.date,typeof p?.equity_pc!=='number'?null:p.equity_pc<0.6?1:p.equity_pc>0.8?-1:0,'Equity P/C <0.6 선호 / >0.8 회피'),
    signal('Fear & Greed',typeof f?.score==='number'?f.score.toFixed(0)+' / 100':'미확보',f?.timestamp,typeof f?.score!=='number'?null:f.score>=55?1:f.score<=45?-1:0,'55 이상 선호 / 45 이하 회피'),
    signal('국채 변동성 · 대체',proxy?proxy.value.toFixed(1)+' / 자체 지수':'미확보',proxy?.date,boardBondRegime(proxy?.value).score,'공식 MOVE 아님 · <80 우호 / 80~100 중립 / ≥100 부담')
  ];
}
function boardComposite(signals) {
  const valid=signals.filter(x=>x.score!==null),sum=valid.reduce((a,b)=>a+b.score,0),score=valid.length?Math.round(50+50*sum/valid.length):null;
  return {score,count:valid.length,label:valid.length<3?'판단 보류':score>=65?'Risk-On 우세':score<=35?'Risk-Off 우세':'혼조 · 중립'};
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
function boardDrawCharts(container,data){container.replaceChildren(legacyFearCard(data),legacyBondCard(data));}
async function setupMarketBoard() {
  const shell=document.querySelector('.shell'),oldDetail=document.querySelector('.macro-detail');
  document.querySelector('.radar-compact')?.remove();
  const nowPanel=boardSection('MARKET NOW','주식을 살 환경인가? 시장의 위험선호와 부담 요인을 함께 확인합니다.','marketNow');
  const summary=radarNode('div','시장 자료 확인 중…','board-summary');summary.setAttribute('aria-live','polite');
  const signalsGrid=radarNode('div',undefined,'board-signals'),rates=radarNode('div',undefined,'board-rates');nowPanel.append(summary,signalsGrid,radarNode('h3','미국 국채 금리 · 최신 일별 관측'),rates);
  const chartPair=radarNode('div',undefined,'board-chart-pair');signalsGrid.after(chartPair);
  const methodology=radarNode('details',undefined,'board-method');methodology.append(radarNode('summary','종합 신호의 기준과 한계'),radarNode('p','연결된 5개 축에 동일 가중치를 적용합니다. 선호 +1, 중립 0, 회피 −1을 평균해 0~100으로 환산합니다. 국채 변동성 축은 공식 MOVE 대신 자체 대체지표를 사용하며, 80 미만 +1 / 80 이상 100 미만 0 / 100 이상 −1을 반영합니다. 65 이상 Risk-On, 35 이하 Risk-Off입니다. 3개 축 미만이면 판단을 보류합니다. 미확보·오래된 자료는 제외하며, 일부 축이 없으면 잠정 신호입니다. 임의 기준의 환경 요약으로 상승 확률이나 매수 추천이 아닙니다. 심리와 옵션은 일부 겹치며 극단적 심리는 반전될 수 있습니다. 금리 하락도 경기 둔화 때문일 수 있으므로 원인을 확인하세요.'));
  const rateDetail=radarNode('details',undefined,'board-method');rateDetail.append(radarNode('summary','금리 수준 · 실질금리 · 과거 변동성 자세히 보기'));nowPanel.append(rateDetail,methodology);
  const liquidity=boardSection('LIQUIDITY','잔고와 1주 · 4주 · 13주 변화 · 단위 $B (10억 달러)','liquidityBoard');
  const liquidityBody=radarNode('div','유동성 자료 확인 중…','board-table-wrap');liquidity.append(liquidityBody);
  const week=boardSection('THIS WEEK','지금부터 7일간 · 한국시간 · CPI / PPI / 고용 / FOMC','thisWeek');
  const calendarBody=radarNode('div','공식 일정 확인 중…','board-events');week.append(calendarBody);
  const stock=boardSection('MY STOCK','선택 종목의 주가와 확인된 Catalyst Timeline','myStock');
  const catalyst=radarNode('div','종목 일정 확인 중…','board-catalyst');
  const control=document.querySelector('.control-bar'),chart=document.querySelector('.stock-chart-card'),metrics=document.querySelector('.metrics'),briefing=document.getElementById('visitChanges'),workspace=document.querySelector('.workspace');
  stock.append(control,catalyst,chart);
  const news=boardSection('NEWS','선택 종목의 새로운 기사와 공식 소식','newsBoard');news.append(briefing,metrics,workspace);
  const hero=document.querySelector('.hero'),tape=document.querySelector('.market-strip');
  shell.replaceChildren(hero,nowPanel,liquidity,week,stock,news);
  nowPanel.append(tape);
  if(oldDetail){oldDetail.querySelector('summary').textContent='기존 지표 상세 · 차트와 출처';liquidity.append(oldDetail);}
  document.querySelector('.lead').textContent='시장 환경부터 확인하고, 내 종목의 일정과 뉴스를 살펴보세요.';
  const data={};
  await Promise.all([['macro','macro_data.json'],['fear','fear_greed.json'],['options','options_sentiment.json'],['calendar','economic_calendar.json'],['catalysts','catalysts.json']].map(async([key,file])=>{try{data[key]=await boardFetch(file);}catch{data[key]=null;}}));
  function drawMarket(){
    const signals=boardSignals(data),overall=boardComposite(signals);
    summary.dataset.state=overall.label.startsWith('Risk-On')?'on':overall.label.startsWith('Risk-Off')?'off':'mixed';
    summary.replaceChildren(radarNode('span',overall.count<5?'잠정 종합 신호':'종합 신호'),radarNode('strong',overall.label),radarNode('p',overall.count>=3?overall.score+' / 100 · 유효 '+overall.count+'/5개 축':'최신 지표가 부족합니다.'));
    const positive=signals.filter(x=>x.score===1).map(x=>x.name),negative=signals.filter(x=>x.score===-1).map(x=>x.name);
    summary.append(radarNode('p','우호: '+(positive.join(', ')||'뚜렷한 신호 없음')+' / 부담: '+(negative.join(', ')||'뚜렷한 신호 없음')));
    summary.append(radarNode('small','지표별 기준일이 다릅니다 · 일별/주별 자료, 실시간 아님'+(Object.values(data).some(d=>d?.localFallback)?' · 일부 자료는 배포 시 저장본':'')));
    signalsGrid.replaceChildren();signals.forEach(s=>{const card=boardCard(s.name,s.value,s.score===null?'미확보 또는 오래된 자료 · 종합 제외':s.score>0?'위험선호에 우호':s.score<0?'위험회피 요인':'중립');card.dataset.signal=s.score===null?'missing':s.score>0?'on':s.score<0?'off':'mixed';card.append(radarNode('small',s.date?'기준 '+s.date.slice(0,10):'기준일 미확보'),radarNode('small',s.rule));signalsGrid.append(card);});
    boardDrawCharts(chartPair,data);
    rates.replaceChildren();for(const [id,name] of [['DGS2','2년'],['DGS10','10년'],['DGS30','30년']]){const s=macroStats(macroClean(data.macro?.series?.[id]?.rows),100),card=boardCard(name,s.last?s.last.value.toFixed(2)+'%':'미확보','직전 관측 대비 '+macroSigned(s.day,'bp'));card.append(radarNode('small',s.last?'기준 '+s.last.date+(boardFresh(s.last.date)?'':' · 오래된 자료'):'자료 연결 확인 중'),officialLink('FRED','https://fred.stlouisfed.org/series/'+id));rates.append(card);}
  }
  drawMarket();
  if(data.macro){const built=macroBuild(data.macro),grid=radarNode('div',undefined,'macro-grid');for(const [id,label,unit] of [['DFII10','10년 실질금리','%'],['T10YIE','10년 손익분기 인플레이션','%'],['REALIZED','10년 금리 실현변동성','bp/일'],['VIXCLS','주식 예상 변동성 VIX','pt']]){const rows=built[id],last=rows.at(-1),card=boardCard(label,last?last.value.toFixed(2)+' '+unit:'미확보',id==='REALIZED'?'20개 일간 금리 변화의 표본 표준편차 · MOVE와 다릅니다.':id==='T10YIE'?'물가 전망 외 위험·유동성 프리미엄도 포함합니다.':'최근 3개월 추세');if(last){card.append(radarNode('small','기준 '+last.date),macroChart(rows,label,90,last.date));}grid.append(card);}rateDetail.append(grid);}
  const table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');['지표','현재 잔고','1주 변화','4주 변화','13주 변화','기준일'].forEach(t=>tr.append(radarNode('th',t)));thead.append(tr);table.append(thead);const body=document.createElement('tbody');
  for(const [id,name,mult] of [['WTREGEN','TGA (주간 평균)',0.001],['RRPONTSYD','ON RRP',1],['WRESBAL','은행 지급준비금',0.001],['WALCL','연준 총자산',0.001]]){const rows=macroClean(data.macro?.series?.[id]?.rows).map(r=>({...r,value:r.value*mult})),last=rows.at(-1),row=document.createElement('tr');const title=document.createElement('th');title.append(officialLink(name,'https://fred.stlouisfed.org/series/'+id));row.append(title,radarNode('td',last?last.value.toLocaleString('en-US',{maximumFractionDigits:1}):'미확보'));[1,4,13].forEach(w=>row.append(radarNode('td',macroSigned(boardTrend(rows,w),'$B'))));row.append(radarNode('td',last?last.date+(boardFresh(last.date,14)?'':' · 지연'):'—'));body.append(row);}table.append(body);liquidityBody.replaceChildren(table,radarNode('p','TGA·ON RRP 감소는 대체로 유동성에 우호적이며, 지급준비금 증가는 은행 유동성 확대를 뜻합니다. 각 지표의 최신 기준일에서 7·28·91일 전까지의 마지막 관측과 비교합니다. TGA는 FRED 주간 평균이며 아래 일별 잔고와 차이가 있습니다.','board-subtitle'));
  function drawCalendar(){calendarBody.replaceChildren();const upcoming=boardUpcoming(data.calendar?.events);const sources=data.calendar?.sources||{};calendarBody.append(radarNode('p','공식 일정 확인: '+Object.entries(sources).map(([k,v])=>k+' '+(v.checkedAt?.slice(0,10)||'미확인')+(v.failed?' (갱신 실패)':'')).join(' · '),'board-subtitle'));if(!upcoming.length)calendarBody.append(radarNode('p',data.calendar?'저장된 공식 일정 중 앞으로 7일에 해당하는 발표가 없습니다.':'일정을 불러오지 못했습니다. 공식 달력에서 확인하세요.'));upcoming.forEach(e=>{const card=boardCard(e.title,boardTime(e.at),'중요도 '+(e.importance||'높음'));card.append(officialLink('공식 일정',e.source));calendarBody.append(card);});calendarBody.append(officialLink('BLS 전체 일정','https://www.bls.gov/schedule/'),officialLink('FOMC 공식 일정','https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'));}
  function drawCatalyst(){const ticker=typeof state!=='undefined'?state.ticker:document.getElementById('tickerSelect').value.toUpperCase(),record=data.catalysts?.tickers?.[ticker];catalyst.replaceChildren(radarNode('h3',ticker+' · Catalyst Timeline'));if(!record){catalyst.append(radarNode('p','이 종목의 확인된 일정이 아직 등록되지 않았습니다. 실적·공시와 기업 IR에서 발표일을 확인하세요.'));return;}catalyst.append(radarNode('p','공식 발표 확인 '+record.checkedAt+' · 확인된 일정만 수록 · 일정 변경은 원문 확인','board-subtitle'));const events=(record.events||[]).filter(e=>Date.parse(e.end||e.at||e.date+'T23:59:59-04:00')>=Date.now()-30*BOARD_DAY).sort((a,b)=>(a.at||a.date).localeCompare(b.at||b.date));if(!events.some(e=>Date.parse(e.at||e.date+'T23:59:59-04:00')>=Date.now()))catalyst.append(radarNode('p','확인된 향후 일정 없음 · 미발표 실적·인증 날짜는 추정하지 않습니다.'));events.forEach(e=>{const past=Date.parse(e.end||e.at||e.date+'T23:59:59-04:00')<Date.now(),card=boardCard(e.kind+' · '+(past?'지난 일정':'예정'),e.title,e.at?boardTime(e.at):e.date+(e.end?' ~ '+e.end:'')+' · 현지 날짜 / 시각 미정');card.append(officialLink('발표 원문',e.source));catalyst.append(card);});catalyst.append(officialLink('기업 공식 일정',record.source));}
  drawCalendar();drawCatalyst();
  document.getElementById('tickerSelect').addEventListener('change',drawCatalyst);
  document.getElementById('tickerSelect').addEventListener('keydown',event=>{if(event.key==='Enter')drawCatalyst();});
  document.getElementById('refreshNow').addEventListener('click',drawCatalyst);
  const previousRender=render;render=function(){previousRender();drawCatalyst();};
  setInterval(()=>{drawMarket();drawCalendar();drawCatalyst();},60000);
}
if(typeof document!=='undefined')setupMarketBoard().catch(error=>{console.error('Market board:',error);const box=document.getElementById('marketNow');if(box)box.append(radarNode('p','일부 화면을 불러오지 못했습니다. 새로고침해 주세요.'));});
