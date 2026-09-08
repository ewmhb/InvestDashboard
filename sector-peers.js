// Theme membership is maintained from company business descriptions; winners are ranked from live quotes.
const PEER_THEMES = [
  {name:'양자컴퓨팅',reviewed:'2026-09-08',members:{
    IONQ:'https://www.ionq.com/',RGTI:'https://www.rigetti.com/about-rigetti-computing',
    QBTS:'https://www.dwavequantum.com/company/about-d-wave/',QUBT:'https://quantumcomputinginc.com/technology'}},
  {name:'우주·위성',reviewed:'2026-09-08',members:{
    RKLB:'https://rocketlabcorp.com/about/about-us/',RDW:'https://rdw.com/',ASTS:'https://ast-science.com/',
    LUNR:'https://www.intuitivemachines.com/about-us',PL:'https://www.planet.com/company/',
    BKSY:'https://blacksky.com/',SPIR:'https://spire.com/'}}
];
function peerThemeFor(ticker) { return PEER_THEMES.find(theme=>Object.hasOwn(theme.members,ticker)) || null; }
const sectorPeerState = { request: 0, cache: new Map(), inflight: new Map(), active: null };
const PEER_RANK_LABELS = { price: '1주당 현재가', marketCap: '시가총액', change: '당일 등락률' };
function peerNumber(value) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function rankSectorPeers(rows, ticker, criterion) {
  const seen = new Set();
  return rows.filter(row => {
    if (!row || row.ticker === ticker || seen.has(row.ticker) || row.currency !== 'USD' || !row.industry || !(row.price > 0) || !row.timestamp) return false;
    const value = peerNumber(row[criterion]);
    if (value === null || (criterion !== 'change' && value <= 0)) return false;
    seen.add(row.ticker); return true;
  }).sort((a,b) => b[criterion] - a[criterion] || a.ticker.localeCompare(b.ticker)).slice(0,2);
}
async function peerRequest(path, params, key) {
  const url = new URL('https://finnhub.io/api/v1/' + path);
  Object.entries(params).forEach(([name,value]) => url.searchParams.set(name,value));
  // Keys go only to Finnhub, never through the public CORS proxies used for RSS.
  url.searchParams.set('token', key);
  const response = await fetchWithTimeout(url.href, {referrerPolicy:'no-referrer'}, 10000);
  if (!response.ok) throw new Error(response.status === 429 ? '조회 한도에 도달했습니다. 잠시 후 다시 조회하세요.' : '동종업체 데이터 연결을 확인하세요 (HTTP ' + response.status + ').');
  const data = await response.json();
  if (data?.error) throw new Error('동종업체 데이터 이용 권한을 확인하세요.');
  return data;
}
async function loadSectorPeerData(ticker, key) {
  const cacheKey = ticker + ':' + key;
  const cached = sectorPeerState.cache.get(cacheKey);
  if (cached && Date.now() - cached.at < 300000) return cached;
  if (sectorPeerState.inflight.has(cacheKey)) return sectorPeerState.inflight.get(cacheKey);
  const work = (async () => {
    const theme = peerThemeFor(ticker);
    const [profile, symbols] = theme ? [{ticker,finnhubIndustry:theme.name},Object.keys(theme.members)] : await Promise.all([
      peerRequest('stock/profile2', {symbol:ticker}, key),
      peerRequest('stock/peers', {symbol:ticker, grouping:'subIndustry'}, key)
    ]);
    if (!profile?.ticker || !profile.finnhubIndustry || !Array.isArray(symbols)) throw new Error('이 티커의 업종 분류 또는 동종업체 목록이 없습니다.');
    const candidates = [...new Set(symbols.filter(x => typeof x === 'string' && /^[A-Z0-9.-]{1,15}$/.test(x)))].filter(x=>x!==ticker);
    const rows = [], failures = [];
    // Small batches avoid request bursts; every returned candidate is considered.
    for (let i=0; i<candidates.length; i+=3) {
      const results = await Promise.allSettled(candidates.slice(i,i+3).map(async symbol => {
        const [company, quote] = await Promise.all([
          peerRequest('stock/profile2', {symbol}, key), peerRequest('quote', {symbol}, key)
        ]);
        if (!company?.ticker || !company.finnhubIndustry) throw new Error('업종 미확보');
        if (!theme && (company.finnhubIndustry !== profile.finnhubIndustry || company.country !== profile.country)) return null;
        const price=peerNumber(quote.c), previous=peerNumber(quote.pc);
        if (!(price>0) || !(quote.t>0)) throw new Error('시세 미확보');
        return {ticker:symbol,name:company.name||symbol,industry:theme?theme.name:company.finnhubIndustry,currency:company.currency,price,
          marketCap:peerNumber(company.marketCapitalization) === null ? null : company.marketCapitalization*1000000,
          change:peerNumber(quote.dp) ?? (previous>0?(price/previous-1)*100:null),timestamp:quote.t};
      }));
      results.forEach((result,index)=>{if(result.status==='fulfilled'){if(result.value)rows.push(result.value);}else failures.push(candidates[i+index]);});
    }
    const result={at:Date.now(),industry:profile.finnhubIndustry,theme,rows,failures,candidates};
    sectorPeerState.cache.set(cacheKey,result);return result;
  })();
  sectorPeerState.inflight.set(cacheKey,work);
  try{return await work;}finally{sectorPeerState.inflight.delete(cacheKey);}
}
async function renderSectorPeers() {
  const body=document.getElementById('watchRows'),status=document.getElementById('peerStatus'),criterion=document.getElementById('peerRank')?.value||'price';
  if(!body||!status)return;
  const request=++sectorPeerState.request,ticker=state.ticker,key=normalizeApiKey(els.finnhubApiKey?.value);
  body.replaceChildren();
  const universe=document.getElementById('peerUniverse');
  if(universe){universe.replaceChildren();const theme=peerThemeFor(ticker);universe.append(radarNode('summary','비교 후보와 분류 근거'));if(theme){universe.append(radarNode('p',theme.name+' · '+theme.reviewed+' 사업 설명 확인. 등록된 종목 안에서 순위를 계산하며 전 세계 전체 섹터 순위는 아닙니다.'));Object.entries(theme.members).forEach(([symbol,url])=>universe.append(officialLink(symbol+(symbol===ticker?' (조회 종목)':''),url)));}else universe.append(radarNode('p','Finnhub의 세부 업종 동종업체 목록을 사용합니다. 제공처 업종은 투자 테마보다 넓을 수 있습니다.'));}
  if(!key){status.textContent='자동 비교를 사용하려면 설정의 Finnhub API 키를 연결해 주세요. 임의 종목은 표시하지 않습니다.';return;}
  status.textContent=ticker+'의 동종업체와 최신 시세를 조회하고 있습니다…';
  try{
    const data=await loadSectorPeerData(ticker,key);
    if(request!==sectorPeerState.request||ticker!==state.ticker)return;
    sectorPeerState.active=data;
    const rows=rankSectorPeers(data.rows,ticker,criterion);
    const incomplete=data.failures.length>0||data.rows.some(row=>row.currency==='USD'&&peerNumber(row[criterion])===null);
    status.textContent=ticker+' · '+data.industry+' · '+(data.theme?'등록된 동일 테마 후보 ':'Finnhub 세부 업종 후보 ')+data.candidates.length+'개 중 '+PEER_RANK_LABELS[criterion]+' 내림차순 · '+(incomplete?'일부 데이터 미확보: 전체 후보 순위는 확정할 수 없습니다.':'')+' 시세 조회 '+new Date(data.at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST';
    if(!rows.length){status.textContent+=' · 비교 가능한 USD 종목이 없습니다.';return;}
    rows.forEach((row,index)=>{
      const tr=radarNode('tr'),tickerCell=radarNode('td'),button=radarNode('button',row.ticker);button.type='button';
      button.onclick=()=>{els.tickerSelect.value=row.ticker;applyTicker();};tickerCell.append(button,radarNode('small',row.name));
      tr.append(radarNode('td',incomplete?'확보 자료 '+(index+1):String(index+1)),tickerCell,
        radarNode('td',new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(row.price)),
        radarNode('td',row.marketCap===null?'미제공':formatMoney(row.marketCap)),
        radarNode('td',row.change===null?'미제공':(row.change>=0?'+':'')+row.change.toFixed(2)+'%'),
        radarNode('td',new Date(row.timestamp*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST'));
      body.append(tr);
    });
    if(rows.length<2)status.textContent+=' · 조건을 충족한 종목이 '+rows.length+'개뿐입니다.';
  }catch(error){if(request!==sectorPeerState.request||ticker!==state.ticker)return;status.textContent='자동 비교를 불러오지 못했습니다. '+(error instanceof TypeError?'금융 데이터 제공처 연결이 제한되었습니다. 잠시 후 다시 조회하세요.':error instanceof Error?error.message:'연결을 확인하세요.');}
}
function setupSectorPeers() {
  renderWatchlist=renderSectorPeers;
  const rank=document.getElementById('peerRank');
  const saved=readRadar('radarPeerRank','price');rank.value=Object.hasOwn(PEER_RANK_LABELS,saved)?saved:'price';
  rank.addEventListener('change',()=>{writeRadar('radarPeerRank',rank.value);renderSectorPeers();});
  document.getElementById('peerRetry').onclick=()=>{sectorPeerState.cache.clear();renderSectorPeers();};
  const oldApply=applyTicker;applyTicker=function(){oldApply();renderSectorPeers();};
  els.finnhubApiKey.addEventListener('change',()=>{sectorPeerState.cache.clear();renderSectorPeers();});
  renderSectorPeers();
}
