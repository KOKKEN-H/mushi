// index.html 内のゲームロジックを Node.js 上でヘッドレスに動かし、
// ランダムデッキ同士のCPU対CPU戦を複数回自動実行して、
// 例外(クラッシュ)が発生しないかを確認するだけの簡易スモークテストです。
// ユニットテストではなく「壊れていないことの雑な確認」用途です。
//
// 使い方: node tests/headless-sim.js [回数]

const fs = require('fs');
const path = require('path');

const RUNS = parseInt(process.argv[2] || '10', 10);
const htmlPath = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf-8');
const match = html.match(/<script>([\s\S]*)<\/script>/);
if (!match) {
  console.error('index.html から <script> ブロックを抽出できませんでした。');
  process.exit(1);
}
let js = match[1];

// ---- 最低限のDOMスタブ ----
const appEl = {
  _html: '',
  set innerHTML(v) { this._html = v; },
  get innerHTML() { return this._html; },
};
global.document = {
  getElementById: (id) => (id === 'app' ? appEl : null),
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, click(){}, remove(){} }),
  body: { appendChild(){}, removeChild(){} },
};
global.window = {};
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} };
global.Blob = function () {};

// setTimeout を即時実行にして高速化（挙動のロジックは変えず、待ち時間だけ潰す）
const realSetTimeout = setTimeout;
global.setTimeout = (fn) => realSetTimeout(fn, 0);

let crashes = 0;
let finished = 0;
let pending = RUNS;

js += `
let __crashes = 0, __finished = 0, __pending = ${RUNS};
function __runOne(done){
  try{
    randomizePlayerDeck();
    const pa = makePlayer('あなた', buildDeckArray(deckCounts), true);
    const pb = makePlayer('コンピュータ', buildCpuDeck(), true);
    G = { turnNum:1, active:0, players:[pa,pb], phase:'set', log:[], firstTurn:true, gameOver:false, spentCost:0 };
    let ticks = 0;
    const iv = setInterval(()=>{
      ticks++;
      if(G.gameOver || ticks>3000){
        clearInterval(iv);
        if(G.gameOver) __finished++;
        done();
        return;
      }
      if(G.phase==='draw'){ toDrawPhase(); if(me().isCpu) cpuTakeTurn(); }
      else if(G.phase==='set' && me().isCpu){ cpuTakeTurn(); }
      // 'main' フェーズは cpuMainStep が setTimeout チェーンで自走する
    }, 0);
  }catch(e){
    __crashes++;
    console.error('CRASH:', e.message);
    console.error(e.stack.split('\\n').slice(0,4).join('\\n'));
    done();
  }
}
function __loop(){
  if(__pending-- <= 0){
    console.log('\\n完了: ' + __finished + '/${RUNS} 回完走, クラッシュ: ' + __crashes + ' 回');
    process.exit(__crashes>0 ? 1 : 0);
  }
  __runOne(__loop);
}
console.log('ヘッドレス自動対戦シミュレーションを ${RUNS} 回実行します...');
__loop();
`;
eval(js);
