// Shared data and explicit observation periods for every liquidity view.
const LIQ_DAY=86400000;
function liquidityClean(rows){return [...new Map((rows||[]).filter(r=>r&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&Number.isFinite(r.value)).map(r=>[r.date,r])).values()].sort((a,b)=>a.date.localeCompare(b.date));}
function liquidityCompare(rows,weeks){
  rows=liquidityClean(rows);const last=rows.at(-1);if(!last)return null;
  const target=Date.parse(last.date)-weeks*7*LIQ_DAY;
  const prior=rows.filter(r=>Date.parse(r.date)<=target).at(-1);
  return prior&&target-Date.parse(prior.date)<7*LIQ_DAY?{value:last.value-prior.value,from:prior.date,to:last.date}:null;
}
function liquidityFresh(date,days=14){const age=Date.now()-Date.parse(date);return Number.isFinite(age)&&age>=0&&age<=days*LIQ_DAY;}
let liquidityPromise=null,liquidityLoadedAt=0;
function loadLiquidityData(force=false){
  if(force||!liquidityPromise||Date.now()-liquidityLoadedAt>300000){
    liquidityLoadedAt=Date.now();liquidityPromise=(async()=>{
      const local=location.hostname==='localhost'||location.hostname==='127.0.0.1';
      const file='liquidity.json?v='+Math.floor(Date.now()/300000);
      const urls=local?['./'+file]:['https://raw.githubusercontent.com/ewmhb/InvestDashboard/main/'+file,'./'+file];
      for(const [i,url] of urls.entries())try{
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
        try{const r=await fetch(url,{cache:'no-store',credentials:'omit',signal:controller.signal});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();if(data.version!==2)throw Error('공유 자료 갱신 대기');data.localFallback=!local&&i>0;return data;}finally{clearTimeout(timer);}
      }catch(error){if(i===urls.length-1)throw error;}
    })().catch(error=>{liquidityPromise=null;throw error;});
  }
  return liquidityPromise;
}
function liquiditySeriesStatus(series){
  const last=series?.rows?.at(-1);
  return series?.failed?'수집 실패 · 보관값':!last?'자료 미확보':!liquidityFresh(last.date,series.frequency==='daily'?5:14)?'발표 지연 확인 필요':'최근 발표분';
}
function liquidityDirection(key,change){
  if(change===0)return '유동성 영향 중립';
  if(key==='TGA'||key==='RRPONTSYD')return change>0?'유동성 흡수 방향':'시장 유동성 증가 방향';
  return change>0?'은행권 유동성 증가 방향':'은행권 유동성 감소 방향';
}
function renderLiquidityDetails(data){
  const set=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text;};
  const series=data.series||{};
  for(const [key,prefix,label,mult] of [['TGA','tga','TGA',1],['RRPONTSYD','rrp','ON RRP',1000],['WRESBAL','reserve','은행 지급준비금',1]]){
    const source=series[key],rows=liquidityClean(source?.rows).map(r=>({...r,value:r.value*mult})),last=rows.at(-1),period=liquidityCompare(rows,4);
    set(prefix+'Balance',last?'$'+(last.value/1000).toFixed(1)+'B':'미확보');
    set(prefix+'AsOf',last?last.date+' 관측 · '+(key==='WRESBAL'?'주간 평균':'일별')+' · '+liquiditySeriesStatus(source):'자료 미확보');
    set(prefix+'Change',period?'4주전대비 '+signedBillions(period.value/1000)+' · '+liquidityDirection(key,period.value)+' ('+period.from+' → '+period.to+')':'4주전대비 비교 자료 부족');
    const changeEl=document.getElementById(prefix+'Change');
    if(changeEl)changeEl.className=period?(key==='TGA'||key==='RRPONTSYD'?(period.value<0?'liquidity-up':period.value>0?'liquidity-down':''):(period.value>0?'liquidity-up':period.value<0?'liquidity-down':'')):'';
    if(rows.length>1)renderTgaChart(rows,prefix+'Chart',label,key==='WRESBAL'?'#2563a9':'#087a5b');
  }
  const rows=liquidityClean(data.rows),last=rows.at(-1),period=liquidityCompare(rows,4),week=liquidityCompare(rows,1);
  if(!last||!period){set('liquidityScore','—');set('liquidityScoreLabel','공통 기준 자료 부족');return;}
  const prior=rows.find(r=>r.date===period.from),prev=rows.at(-2),prev2=rows.at(-3);
  const reserveChange=(last.reserves-prior.reserves)/1000;
  const consecutive=prev&&prev2&&Date.parse(last.date)-Date.parse(prev.date)===7*LIQ_DAY&&Date.parse(prev.date)-Date.parse(prev2.date)===7*LIQ_DAY;
  const valid=liquidityFresh(last.date)&&consecutive&&!data.failed;
  const acceleration=consecutive?(last.value-prev.value)-(prev.value-prev2.value):0;
  const score=Math.max(0,Math.min(100,Math.round(50+20*Math.tanh(period.value/100)+15*Math.tanh(reserveChange/100)+15*Math.tanh(acceleration/75))));
  set('liquidityScore',valid?score:'—');set('liquidityScoreLabel',valid?liquidityBand(score):'갱신 확인 필요 · 판단 보류');
  set('liquidityWeeklySignal','4주 순유동성 '+signedBillions(period.value)+' · 준비금 '+signedBillions(reserveChange));
  set('liquidityWeeklyAsOf',period.from+' → '+period.to+' · 주간 자료 기준');
  const age=Math.max(0,Math.floor((Date.now()-Date.parse(last.date))/LIQ_DAY));
  set('liquidityConfidence',valid?'최근 수집 완료':'갱신 확인 필요');
  set('liquidityLag','관측일 '+last.date+' · '+age+'일 경과');
  document.querySelector('.liquidity-scoreboard')?.classList.toggle('absorbing',valid&&score<46);
  set('netLiquidityValue','$'+(last.value/1000).toFixed(2)+'T');set('netLiquidityWeek',week?signedBillions(week.value):'비교 자료 부족');set('netLiquidityMonth',signedBillions(period.value));
  set('netLiquiditySignal',valid?(period.value>20?'유동성 확대':period.value< -20?'유동성 축소':'중립'):'갱신 확인 필요');
  set('netLiquidityAsOf',last.date+' 주간 기준 · 4주 비교 '+period.from+' → '+period.to);
  set('netLiquidityComponents','연준 $'+(last.walcl/1000).toFixed(2)+'T · TGA $'+last.tga.toFixed(1)+'B ('+last.sourceDates?.tga+') · ON RRP $'+last.rrp.toFixed(1)+'B ('+last.sourceDates?.rrp+')');
  renderNetLiquidityChart(rows.slice(-27));
  const tga=series.TGA?.rows?.at(-1),rrp=series.RRPONTSYD?.rows?.at(-1);
  if(valid&&tga&&rrp&&!series.TGA.failed&&!series.RRPONTSYD.failed&&liquidityFresh(tga.date,5)&&liquidityFresh(rrp.date,5)&&tga.date>=last.date&&rrp.date>=last.date){
    const estimate=last.reserves/1000-(tga.value/1000-last.tga)-(rrp.value-last.rrp);
    set('liquidityReserveNowcast','$'+(estimate/1000).toFixed(2)+'T 추정');
    set('liquidityNowcastAsOf','TGA '+tga.date+' / ON RRP '+rrp.date+' · 주간 준비금 '+last.date+'에서 추정');
  }else{set('liquidityReserveNowcast','추정 보류');set('liquidityNowcastAsOf','최신 일별·주간 자료 확인 필요');}
  set('tgaInterpretation','자료 확인 '+new Date(data.updated_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST'+(data.failed?' · 일부 수집 실패':'')+(data.localFallback?' · 사이트 보관본':'')+'. TGA·ON RRP는 일별, 준비금은 주간 평균입니다. 주간 신호는 연준 발표 자료를 사용하며 오늘의 실측 잔고가 아닙니다. 4주는 표시된 관측 종료일에서 28일 전과 비교합니다. 일별 추정치는 TGA·ON RRP 변화만 반영한 단순 추정입니다.');
}
async function renderSharedLiquidity(){try{const data=await loadLiquidityData();renderLiquidityDetails(data);return data;}catch(error){const el=document.getElementById('liquidityScoreLabel');if(el)el.textContent='유동성 자료 조회 실패';console.warn('Shared liquidity',error);}}
