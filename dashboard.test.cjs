const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context=vm.createContext({console,Date,Set,localStorage:{getItem(){return null},setItem(){}}});
vm.runInContext(fs.readFileSync('dashboard.js','utf8'),context);
function check(code){return vm.runInContext(code,context)}
assert.equal(check('newsSignal([])'),null);
assert.equal(check('newsSignal([{sentiment:1},{sentiment:-1}])'),50);
assert.equal(check('newsSignal([{sentiment:1}])'),100);
assert.equal(check('newsSignal([{sentiment:-1}])'),0);
assert.equal(check('correctFinancialTranslation("IonQ stock sinking", "IonQ 재고가 하락")'),'IonQ 주가가 하락');
assert.equal(check('correctFinancialTranslation("Stock looks about right", "오른쪽")'),'Stock looks about right');
assert.equal(check('correctFinancialTranslation("70% upside", "70% 거꾸로")'),'70% upside');
assert.equal(check(`groupNews([{ticker:'IONQ',title:'QC Ware and IonQ Demonstrate High-Precision Hybrid Quantum Workflow for Drug Discovery',published:'2026-09-01'},{ticker:'IONQ',title:'Quantum QC Ware And IonQ Reach 4% Accuracy In Drug-design Workflow',published:'2026-09-01'}]).length`),1);
assert.equal(check(`groupNews([{ticker:'IONQ',title:'Quantum revenue earnings growth',published:'2026-09-01'},{ticker:'IONQ',title:'Quantum revenue earnings growth',published:'2026-08-01'}]).length`),2);
assert.equal(check(`groupNews([{ticker:'IONQ',title:'New customer contract announced today',published:'2026-09-01'},{ticker:'RKLB',title:'New customer contract announced today',published:'2026-09-01'}]).length`),2);
assert.equal(check(`sourceKind({title:'Prediction: Revenue next year',source:'The Motley Fool'})`),'의견·전망 (자동 분류)');
const app=fs.readFileSync('app.js','utf8');
assert.ok(app.includes('requestId!==radarSession.request||state.ticker!==requestTicker'));
assert.ok(!app.includes('return save(buildBaselineValuation'));
console.log('Passed: scoring, missing data, translation safeguards, event grouping, source labels, request guards, stale valuation fallback.');
