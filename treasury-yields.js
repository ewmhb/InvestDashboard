(function(root){
  'use strict';
  const TENORS=[['US2Y','미국채 2년'],['US10Y','미국채 10년'],['US30Y','미국채 30년']];
  const ENDPOINT='https://quote.cnbc.com/quote-html-webservice/quote.htm?symbols=US2Y%7CUS10Y%7CUS30Y&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json';
  function percent(value){
    if(typeof value==='number')return Number.isFinite(value)?value:null;
    if(typeof value!=='string'||!/^[-+]?\d+(?:\.\d+)?%?$/.test(value.trim()))return null;
    const result=Number(value.trim().replace('%',''));return Number.isFinite(result)?result:null;
  }
  function parse(payload){
    const rows=payload?.ITVQuoteResult?.ITVQuote;
    if(!Array.isArray(rows))throw Error('수익률 응답 없음');
    return TENORS.map(([symbol,label])=>{
      const r=rows.find(item=>item.symbol===symbol),value=percent(r?.last),prior=percent(r?.previous_day_closing);
      if(!r||String(r.code)!=='0'||r.type!=='BOND'||value===null||value<=0||value>=30||!r.last_timedate)return {symbol,label,unavailable:true};
      // A yield percentage-point change is 100 basis points. Never use bond price change_pct.
      return {symbol,label,value,changeBp:prior!==null?(value-prior)*100:null,asOf:String(r.last_timedate),market:r.curmktstatus==='REG_MKT'?'장중':'최근 시세',realtime:String(r.realTime)==='true'};
    });
  }
  function mount(){
    const tape=document.getElementById('marketTapeWidget');
    if(!tape||document.getElementById('treasuryYields'))return;
    const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
    const panel=el('div',undefined,'treasury-yields');panel.id='treasuryYields';panel.setAttribute('aria-label','미국채 장중 수익률');
    const grid=el('div',undefined,'treasury-grid'),cards=new Map();
    for(const [symbol,label] of TENORS){
      const card=el('div',undefined,'treasury-ticker'),name=el('a',label),value=el('strong','—','treasury-value'),change=el('b','조회 중','treasury-change'),time=el('small','시세 시각 확인 중','treasury-time');
      name.href='https://www.cnbc.com/quotes/'+symbol;name.target='_blank';name.rel='noreferrer';card.append(name,value,change,time);grid.append(card);cards.set(symbol,{card,value,change,time});
    }
    const status=el('small','CNBC · Tradeweb 수익률 · 1분마다 조회','treasury-status');status.setAttribute('role','status');
    panel.append(grid,status);tape.prepend(panel);
    let busy=false,lastSuccess=null;
    const checked=()=>new Date(lastSuccess).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});
    async function refreshQuotes(){
      if(busy)return;busy=true;
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
      try{
        const response=await fetch(ENDPOINT,{signal:controller.signal,credentials:'omit',cache:'no-store'});
        if(!response.ok)throw Error('시세 조회 실패');
        const quotes=parse(await response.json());
        if(quotes.every(q=>q.unavailable))throw Error('유효한 시세 없음');
        for(const q of quotes){
          const c=cards.get(q.symbol);c.card.classList.toggle('unavailable',!!q.unavailable);
          if(q.unavailable){c.value.textContent='—';c.change.textContent='자료 확인 필요';c.change.className='treasury-change';c.time.textContent='CNBC 원문에서 확인';continue;}
          c.value.textContent=q.value.toFixed(3)+'%';
          c.change.textContent=q.changeBp===null?'전일 대비 미확인':(q.changeBp>0?'+':'')+q.changeBp.toFixed(1)+'bp · 전일 대비';
          c.change.className='treasury-change '+(q.changeBp>0?'rising':q.changeBp<0?'falling':'');
          c.time.textContent=(q.realtime?q.market:'지연 시세')+' · '+q.asOf;
        }
        lastSuccess=Date.now();panel.classList.remove('refresh-error');
        const missing=quotes.filter(q=>q.unavailable).length;
        status.textContent=(missing?'일부 만기 조회 실패 · ':'')+'CNBC · Tradeweb 수익률 · 1분마다 갱신 · 확인 '+checked()+' KST · 시세 시각은 공급자 기준(미 동부)';
      }catch{
        panel.classList.add('refresh-error');
        for(const c of cards.values())c.time.textContent=lastSuccess?'갱신 실패 · 마지막 조회값':'시세 조회 실패';
        status.textContent='갱신 실패 · '+(lastSuccess?'표시값은 마지막 조회 '+checked()+' KST 기준':'시세 미확보')+' · 각 만기의 CNBC 원문을 확인하세요.';
      }finally{clearTimeout(timeout);busy=false;}
    }
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshQuotes();});
    setInterval(()=>{if(!document.hidden)refreshQuotes();},60000);
    refreshQuotes();
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={parse,percent};
  if(typeof document!=='undefined'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  }
})(typeof window==='undefined'?null:window);