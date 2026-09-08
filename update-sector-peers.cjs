const fs=require('node:fs');
const vm=require('node:vm');
const {setTimeout:delay}=require('node:timers/promises');

async function collect({key,extra='',request,previous={version:1,tickers:{}}}) {
  if(!key) throw new Error('Set the FINNHUB_API_KEY repository Actions secret before collecting data.');
  const context=vm.createContext({URL,Date,Set,Map,Intl,console});
  vm.runInContext(fs.readFileSync('sector-peers.js','utf8'),context);
  const requests=new Map();
  let queue=Promise.resolve();
  context.serverRequest=(path,params)=>{
    const id=path+JSON.stringify(params);
    if(!requests.has(id)) {
      const work=queue.then(()=>request(path,params,key));
      queue=work.catch(()=>{});
      requests.set(id,work);
    }
    return requests.get(id);
  };
  vm.runInContext('peerRequest=(path,params)=>serverRequest(path,params)',context);
  const themes=vm.runInContext('PEER_THEMES.flatMap(x=>Object.keys(x.members))',context);
  const symbols=[...new Set([...themes,'LAES',...Object.keys(previous.tickers||{}),...extra.toUpperCase().split(/[\s,]+/).filter(Boolean)])];
  if(symbols.length>100||symbols.some(s=>!/^[A-Z0-9.-]{1,15}$/.test(s))) throw new Error('Invalid ticker list (maximum 100).');
  const output={version:1,updatedAt:Date.now(),tickers:{}},failed=[];
  for(const ticker of symbols) {
    try {
      context.collectTicker=ticker;
      const data=await vm.runInContext('loadSectorPeerData(collectTicker,"server")',context);
      if(!data.rows.length||data.failures.length) throw new Error('Incomplete collection');
      output.tickers[ticker]=JSON.parse(JSON.stringify(data));
    } catch {
      failed.push(ticker);
      if(previous.tickers?.[ticker]) output.tickers[ticker]={...previous.tickers[ticker],refreshFailed:true};
    }
  }
  return {output,failed};
}
async function main() {
  const file='sector-peers-data.json';
  const previous=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):undefined;
  const request=async(path,params,key)=>{
    await delay(1200);
    const url=new URL('https://finnhub.io/api/v1/'+path);
    for(const [name,value] of Object.entries(params)) url.searchParams.set(name,value);
    const response=await fetch(url,{headers:{'X-Finnhub-Token':key},signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error('Provider request failed');
    const data=await response.json();
    if(data.error) throw new Error('Provider access failed');
    return data;
  };
  const {output,failed}=await collect({key:process.env.FINNHUB_API_KEY,extra:process.env.EXTRA_TICKERS,request,previous});
  if(!Object.keys(output.tickers).length) throw new Error('No comparison data collected; previous file preserved.');
  fs.writeFileSync(file,JSON.stringify(output,null,2)+'\n');
  console.log('Collected '+Object.keys(output.tickers).length+' ticker comparisons.');
  if(failed.length) console.log('::warning::Collection unavailable for: '+failed.join(', '));
}
module.exports={collect};
if(require.main===module) main().catch(()=>{console.error('Collection failed. Check FINNHUB_API_KEY and provider availability; no credentials are logged.');process.exitCode=1;});
