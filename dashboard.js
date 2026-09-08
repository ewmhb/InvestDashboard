/* News-first dashboard. Persist only public article metadata, never API settings. */
const radarSession = { baseline: {}, snapshots: {}, request: 0 };
function readRadar(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function writeRadar(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browsing remains available without storage. */ } }
function radarNode(tag, text, cls) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; }
function articleKey(item) { return item.ticker + ':' + item.title.toLowerCase().replace(/[^a-z0-9가-힣]/g, ''); }
function sourceKind(item) {
  if (/prediction|why i|should you|could .*stock|where will|to buy|vs\./i.test(item.title)) return '의견·전망 (자동 분류)';
  if (/^(ionq|rigetti|d-wave|sealsq|redwire|rocket lab)$/i.test(item.source || '') || /pr newswire|business wire|globenewswire/i.test(item.source || '')) return '기업 발표·배포자료';
  return '언론·기타 보도';
}
function groupNews(items) {
  const groups = [];
  const tokens = title => new Set(title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !['ionq','stock','stocks','quantum','computing','with','from','that','this','news','company'].includes(w)));
  for (const item of items) {
    const words = tokens(item.title);
    const match = groups.find(g => {
      if (g.ticker !== item.ticker || Math.abs(new Date(g.published) - new Date(item.published)) > 3 * 86400000) return false;
      const other = tokens(g.title), overlap = [...words].filter(w => other.has(w)).length;
      const sameResearch = /qc ware/i.test(g.title) && /qc ware/i.test(item.title) && /drug/i.test(g.title) && /drug/i.test(item.title) && /workflow/i.test(g.title) && /workflow/i.test(item.title);
      return sameResearch || articleKey(g) === articleKey(item) || (overlap >= 4 && overlap / Math.max(words.size, other.size) >= .6);
    });
    if (match) match.related.push(item); else groups.push({...item, related: [item]});
  }
  return groups;
}
function recentEvents() { return groupNews(state.news.filter(x => x.ticker === state.ticker && !x.sample && Date.now() - new Date(x.published) <= 30 * 86400000 && new Date(x.published) <= Date.now())); }
function correctFinancialTranslation(title, translation) {
  let text = translation || '';
  if (/\bstocks?\b/i.test(title)) text = text.replace(/재고가/g, '주가가').replace(/재고는/g, '주가는').replace(/재고/g, '주식');
  if (/\bupside\b/i.test(title) && /거꾸로/.test(text)) return title;
  if (/earnings/i.test(title)) text = text.replace(/수익 보고서/g, '실적 발표');
  if (/looks about right/i.test(title) && /오른쪽/.test(text)) return title;
  if (/on the board/i.test(title) && /이사회/.test(text)) return title;
  if (/earnings top views/i.test(title) && /조회 수/.test(text)) return title;
  return text;
}
function newsSignal(items) { return items.length ? Math.max(0, Math.min(100, Math.round(50 + 50 * items.reduce((s,x) => s + Math.sign(x.sentiment), 0) / items.length))) : null; }
function renderRadarNews() {
  els.newsList.replaceChildren();
  const groups = groupNews(filteredNews()).slice(0,30);
  if (!groups.length) { els.newsList.append(radarNode('p', '조건에 맞는 기사가 없습니다. 검색어나 필터를 바꾸거나 다시 조회하세요.')); return; }
  groups.forEach(item => {
    const card = radarNode('article', undefined, 'news-card');
    const meta = radarNode('div', undefined, 'meta');
    meta.append(radarNode('strong', item.ticker, 'ticker'), radarNode('span', item.source), radarNode('span', new Date(item.published).toLocaleString('ko-KR', {timeZone:'Asia/Seoul', dateStyle:'short',timeStyle:'short'}) + ' KST'));
    const title = correctFinancialTranslation(item.title,item.translated);
    card.append(meta, radarNode('small', sourceKind(item)), radarNode('h3', title || item.title));
    const original = radarNode('details'); original.append(radarNode('summary', title && title !== item.title ? '영어 원제 · 자동 번역 확인' : '번역 미확보 · 영어 원제'), radarNode('p',item.title)); card.append(original);
    const summary = radarNode('div', undefined, 'summary');
    summary.append(radarNode('strong','제목 기반 분류'),radarNode('p',item.summary));
    card.append(summary);
    const footer = radarNode('div',undefined,'footer');
    const tags = radarNode('div',undefined,'tags');
    const labels = {contract:'계약·고객', tech:'기술', finance:'재무',risk:'리스크'};
    item.tags.forEach(tag => tags.append(radarNode('span',labels[tag] || tag,'tag '+tag)));
    footer.append(tags,officialLink('원문', /^https?:\/\//i.test(item.link) ? item.link : '#'));card.append(footer);
    if(item.related.length > 1) { const related=radarNode('details'); related.append(radarNode('summary','유사 사건 기사 '+item.related.length+'개 · 자동 묶음'));item.related.forEach(a => related.append(officialLink(a.source+' · '+a.title,/^https?:\/\//i.test(a.link)?a.link:'#')));card.append(related); }
    els.newsList.append(card);
  });
}
function renderRadarMetrics() {
  const items=recentEvents();
  els.metricNews.textContent=items.length;
  els.metricPositive.textContent=items.filter(x=>x.sentiment>0).length;
  els.metricRisk.textContent=items.filter(x=>x.risk>0).length;
  els.metricHeat.textContent=newsSignal(items) ?? '—';
}
function renderRadarAnalysis() {
  const items=recentEvents(), score=newsSignal(items);
  els.analysisTitle.textContent=state.ticker+' 뉴스 신호 점수';
  els.analysisSummary.textContent='최근 30일 · 유사 기사 묶음 '+items.length+'건. 50 + 50 × (긍정 건수 − 부정 건수) ÷ 전체 건수. 중립은 0으로 반영하며 매수 적합도나 기업 가치 평가는 아닙니다. 제목 키워드 분류이므로 원문 확인이 필요합니다.';
  els.scoreRing.textContent=score ?? '—';
  els.scoreRing.style.background='conic-gradient(var(--green) '+(score||0)+'%, #e3e9e5 0)';
  els.factorList.replaceChildren();
  [['계약·고객','contract'],['기술','tech'],['재무','finance'],['수집 기사에서 감지된 리스크','risk']].forEach(([label,key])=>{
    const count=items.filter(x=>x.tags.includes(key)).length;
    const card=radarNode('article',undefined,'factor');card.append(radarNode('strong',label),radarNode('p',count+'건 / '+items.length+'건'));els.factorList.append(card);
  });
}
function rememberRadar() {
  if(state.usingSample || !state.news.length) { const box=document.getElementById('visitChanges'); box.replaceChildren(radarNode('h2',state.ticker+' 조회 상태'),radarNode('p','수집된 기사가 없습니다. 소스 연결을 확인하고 다시 조회해 주세요.')); return; }
  const key='radarSeen:'+state.ticker;
  if(!(state.ticker in radarSession.baseline)) radarSession.baseline[state.ticker]=readRadar(key,null);
  const previous=radarSession.baseline[state.ticker], items=state.news.filter(x=>!x.sample), fresh=previous ? items.filter(x=>!previous.keys.includes(articleKey(x)) && new Date(x.published)>new Date(previous.at)) : [];
  const box=document.getElementById('visitChanges');box.replaceChildren(radarNode('h2',previous?'지난 방문 이후':'오늘의 종목 브리핑'));
  box.append(radarNode('p',previous?'지난 조회 '+new Date(previous.at).toLocaleString('ko-KR')+' 이후 발행된 새 기사 '+fresh.length+'건.':'첫 조회입니다. 다음 방문부터 새 기사를 비교합니다. 저장은 이 브라우저에만 적용됩니다.'));
  (previous?fresh:items).slice(0,3).forEach(a=>box.append(officialLink(correctFinancialTranslation(a.title,a.translated)||a.title,/^https?:\/\//i.test(a.link)?a.link:'#')));
  const record={at:new Date().toISOString(),keys:items.map(articleKey),count:recentEvents().length,score:newsSignal(recentEvents()),risk:recentEvents().filter(x=>x.risk>0).length};
  writeRadar(key,record);
}
function setupDashboard() {
  renderNews=renderRadarNews;renderMetrics=renderRadarMetrics;renderAnalysis=renderRadarAnalysis;
  summarize=function(a,score){if(a.sample)return '샘플 자료는 신호 점수에 포함하지 않습니다.';const labels={contract:'계약·고객',tech:'기술',finance:'재무',risk:'리스크'};const tags=getTags(a.title).map(x=>labels[x]);return '분류: '+(tags.join(' · ')||'일반 기업 소식')+'\n감지 신호: '+(score.sentiment>0?'긍정':score.sentiment<0?'부정':'방향 미확정')+'\n확인할 점: '+(tags.includes('계약·고객')?'계약 금액·기간·매출 반영 시점':tags.includes('재무')?'실적 대상 기간·전년 비교·일회성 항목':'발표 주체·구체적 성과·사업 반영 시점')+'을 원문에서 확인하세요. 본문 분석은 수행하지 않았습니다.';};
  const oldRender=render;render=function(){oldRender();rememberRadar();};
  const shell=document.querySelector('.shell'),hero=document.querySelector('.hero'),control=document.querySelector('.control-bar'),metrics=document.querySelector('.metrics'),workspace=document.querySelector('.workspace'),chart=document.querySelector('.stock-chart-card'),risk=document.querySelector('.risk-indicators'),calendar=document.querySelector('.market-calendar'),tape=document.querySelector('.market-strip');
  const briefing=radarNode('section',undefined,'radar-panel');briefing.id='visitChanges';briefing.setAttribute('aria-live','polite');briefing.append(radarNode('h2','오늘의 종목 브리핑'),radarNode('p','뉴스를 수집하고 있습니다.'));
  const detail=radarNode('details',undefined,'radar-panel macro-detail');detail.append(radarNode('summary','거시지표 상세 · 출처와 기준일'),risk);
  const compact=radarNode('section',undefined,'radar-compact');compact.setAttribute('aria-label','시장 상황 요약');
  [['국채 변동성','moveValue','moveAsOf'],['투자심리','fearGreedValue','fearGreedAsOf'],['Equity P/C','equityPcValue','optionSentimentAsOf'],['유동성 점수','liquidityScore','liquidityWeeklyAsOf']].forEach(([label,id,dateId])=>{const card=radarNode('article');const value=radarNode('strong','—'),date=radarNode('small','확인 중');card.append(radarNode('span',label),value,date);compact.append(card);const source=risk.querySelector("#"+id);if(source){const sync=()=>{value.textContent=source.textContent;date.textContent=document.getElementById(dateId)?.textContent||'상세에서 기준일 확인';};new MutationObserver(sync).observe(source.closest("article"),{childList:true,subtree:true,characterData:true});sync();}});
  shell.replaceChildren(hero,tape,compact,detail,control,briefing,metrics,workspace,chart,calendar);
  renderMarketCalendar=function(){const grid=document.querySelector('.calendar-grid');grid.replaceChildren();[['시장 방향','금리·달러·VIX 변화'],['실적·공시','선택 종목의 실적 발표와 신규 공시'],['유동성','국채 입찰·은행 지급준비금'],['거래시간','미국장 휴장·단축 거래']].forEach(([title,body])=>{const card=radarNode('article',undefined,'calendar-day');card.append(radarNode('strong',title),radarNode('p',body));grid.append(card);});};
}
