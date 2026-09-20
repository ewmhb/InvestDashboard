(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  const dayLabel=value=>{const date=new Date(value+'T00:00:00');const today=new Date();today.setHours(0,0,0,0);const days=Math.max(0,Math.round((today-date)/86400000));return date.toLocaleDateString('ko-KR')+' 기준 · '+(days===0?'오늘':days+'일 전');};
  function render(payload){
    const rows=Array.isArray(payload?.rows)?payload.rows.filter(row=>Number.isFinite(Number(row.index_pc))&&Number.isFinite(Number(row.equity_pc))&&/^\d{4}-\d{2}-\d{2}$/.test(String(row.date||''))).map(row=>({date:row.date,index:Number(row.index_pc),equity:Number(row.equity_pc)})).sort((a,b)=>a.date.localeCompare(b.date)):[];
    if(!rows.length)throw Error('유효한 옵션 센티먼트 행이 없습니다.');
    const latest=rows.at(-1),history=rows.slice(-21,-1),average=history.length?history.reduce((sum,row)=>sum+row.index,0)/history.length:null,deviation=average?(latest.index/average-1)*100:null;
    const equityRiskOn=latest.equity<=.55,equityRiskOff=latest.equity>=.75,indexElevated=deviation!==null?deviation>=20:latest.index>=.9,indexSpike=deviation!==null?deviation>=40:latest.index>=1.2;
    let state='중립',note='개별주식 심리와 지수 헤지 수요가 기준 범위에 있습니다.',tone='';
    if(equityRiskOff&&(indexElevated||latest.index>=1.1)){state='위험회피';note='개별주식 방어 심리와 지수 헤지가 함께 높습니다.';tone='negative';}else if(equityRiskOn&&indexElevated){state='중립 · 위험선호';note='개별주식 심리는 낙관적이지만 지수 헤지 수요가 높습니다.';tone='caution';}else if(equityRiskOn){state='위험선호';note='개별주식 옵션 흐름은 위험선호 방향입니다.';tone='positive';}else if(indexSpike){state='헤지 급등';note='Index P/C가 평소보다 급등해 지수 방어 수요가 강합니다.';tone='negative';}else if(indexElevated){state='중립 · 헤지 증가';note='시장 전반은 중립이지만 지수 헤지 수요가 상승했습니다.';tone='caution';}
    byId('equityPcValue').textContent=latest.equity.toFixed(2);byId('indexPcValue').textContent=latest.index.toFixed(2);byId('equityPcReading').textContent=(equityRiskOn?'낙관적 · 위험선호':equityRiskOff?'방어적 · 위험회피':'중립 범위')+' · '+dayLabel(latest.date);byId('indexPcReading').textContent=(indexSpike?'헤지 급등':indexElevated?'헤지 수요 상승':'보통 범위')+' · '+dayLabel(latest.date);byId('indexPcDeviation').textContent=deviation===null?'축적 중':(deviation>=0?'+':'')+deviation.toFixed(1)+'%';byId('indexPcAverage').textContent=average===null?'20일 데이터 축적 중 · '+dayLabel(latest.date):'20일 평균 '+average.toFixed(2)+' · '+dayLabel(latest.date);
    const stateEl=byId('optionSentimentState');stateEl.textContent=state;stateEl.className=tone;byId('optionSentimentAsOf').textContent='Cboe 일일 통계 · '+dayLabel(latest.date);byId('optionSentimentNote').textContent=note+(history.length<20?' 20일 기준선은 데이터가 쌓이는 중입니다.':'');
  }
  async function load(){try{const response=await fetch('./options_sentiment.json',{cache:'no-store'});if(!response.ok)throw Error('옵션 데이터 HTTP '+response.status);render(await response.json());}catch(error){console.warn('option sentiment display failed',error);const state=byId('optionSentimentState');if(state)state.textContent='표시 오류';const asOf=byId('optionSentimentAsOf');if(asOf)asOf.textContent='데이터 파일을 불러오지 못했습니다.';}}
  const start=()=>setTimeout(load,800);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
