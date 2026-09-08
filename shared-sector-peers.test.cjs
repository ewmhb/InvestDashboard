const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {collect}=require('./update-sector-peers.cjs');
(async()=>{
  const calls=[];
  const request=async(path,{symbol})=>{
    calls.push(path+symbol);
    if(path==='stock/peers')return ['LAES','OTHER'];
    if(path==='stock/profile2')return {ticker:symbol,name:symbol,country:'US',currency:'USD',finnhubIndustry:'Technology',marketCapitalization:100};
    return {c:20,pc:10,dp:100,t:1788500000};
  };
  const {output,failed}=await collect({key:'private-test-key',request});
  assert.equal(failed.length,0);
  assert.equal(Object.keys(output.tickers).length,12);
  assert(!JSON.stringify(output).includes('private-test-key'));
  assert.equal(new Set(calls).size,calls.length,'duplicate requests must be reused');
  assert(!output.tickers.IONQ.rows.some(r=>r.ticker==='RKLB'||r.ticker==='IONQ'));
  const stale=await collect({key:'private-test-key',previous:output,request:async()=>{throw new Error('offline');}});
  assert.equal(stale.output.tickers.IONQ.at,output.tickers.IONQ.at);
  assert.equal(stale.output.tickers.IONQ.refreshFailed,true);
  await assert.rejects(collect({key:'',request}));
  const context=vm.createContext({URL,Date,Set,Map,Intl,fetchWithTimeout:async(url,options)=>{
    assert.equal(new URL(url).hostname,'raw.githubusercontent.com');
    assert.equal(options.credentials,'omit');
    return {ok:true,json:async()=>output};
  }});
  vm.runInContext(fs.readFileSync('sector-peers.js','utf8'),context);
  const data=await vm.runInContext('loadSharedSectorPeers("IONQ")',context);
  assert.equal(data.shared,true);
  await assert.rejects(vm.runInContext('loadSharedSectorPeers("UNKNOWN")',context));
  console.log('Passed: shared loading without browser keys, request reuse, theme separation, missing tickers, safe output, and retention after collection failures.');
})().catch(e=>{console.error(e);process.exitCode=1;});
