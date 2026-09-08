const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const calls=[];
const profiles={ROOT:{ticker:'ROOT',country:'US',currency:'USD',finnhubIndustry:'Quantum'},A:{ticker:'A',country:'US',currency:'USD',finnhubIndustry:'Quantum',marketCapitalization:50},B:{ticker:'B',country:'US',currency:'USD',finnhubIndustry:'Quantum',marketCapitalization:500},SPACE:{ticker:'SPACE',country:'US',currency:'USD',finnhubIndustry:'Space',marketCapitalization:900}};
const context=vm.createContext({console,URL,Date,Set,Map,Intl,fetchWithTimeout:async(url,options)=>{
  calls.push({url,options});assert.equal(new URL(url).searchParams.get('token'),'test-key');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(new URL(url).origin,'https://finnhub.io');
  const u=new URL(url),symbol=u.searchParams.get('symbol');let data;
  if(u.pathname.endsWith('/peers')){assert.equal(u.searchParams.get('grouping'),'subIndustry');data=['ROOT','A','B','SPACE','A'];}
  else if(u.pathname.endsWith('/profile2'))data=profiles[symbol];
  else data={c:symbol==='A'?200:100,pc:100,t:1788500000,dp:symbol==='A'?100:0};
  return{ok:true,json:async()=>data};
}});
vm.runInContext(fs.readFileSync('sector-peers.js','utf8'),context);
const run=code=>vm.runInContext(code,context);
(async()=>{
  const data=await run('loadSectorPeerData("ROOT","test-key")');
  assert.deepEqual(Array.from(data.rows,x=>x.ticker),['A','B']);
  assert.equal(data.rows[0].marketCap,50e6);
  assert.equal(run('rankSectorPeers(sectorPeerState.cache.values().next().value.rows,"ROOT","price")[0].ticker'),'A');
  assert.equal(run('rankSectorPeers(sectorPeerState.cache.values().next().value.rows,"ROOT","marketCap")[0].ticker'),'B');
  const count=calls.length;await run('loadSectorPeerData("ROOT","test-key")');assert.equal(calls.length,count);
  assert.equal(run('rankSectorPeers([{ticker:"A",industry:"Q",currency:"EUR",price:99,timestamp:1}],"ROOT","price").length'),0);
  assert.equal(run('rankSectorPeers([{ticker:"ROOT",industry:"Q",currency:"USD",price:99,timestamp:1}],"ROOT","price").length'),0);
  assert.equal(run('rankSectorPeers([{ticker:"A",industry:"Q",currency:"USD",price:0,timestamp:1}],"ROOT","price").length'),0);
  assert.equal(run('rankSectorPeers([{ticker:"A",industry:"Q",currency:"USD",price:99,timestamp:0}],"ROOT","price").length'),0);
  assert.equal(run('rankSectorPeers([],"ROOT","price").length'),0);
  console.log('Passed: current-price and market-cap ranking, sector exclusion, self exclusion, deduplication, currency/missing quote checks, provider-only credentials and caching.');
})().catch(error=>{console.error(error);process.exitCode=1;});
