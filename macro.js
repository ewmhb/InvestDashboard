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
