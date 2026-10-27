(function(){
const N=20,S=18,cv=document.getElementById('c'),ctx=cv.getContext('2d');
const $=id=>document.getElementById(id);
  const gameOverSound = new Audio('./gameover.mp3');
gameOverSound.preload = 'auto';
const FOODS=['🍔','🍟','🥤'],INK='#1d2a0c';
let snake,dir,nd,food,score,alive=false,timer,speed,best=0,bonus=null;
// ---------- AUDIO ----------
let AC,master,muted=false,musicOn=false,step=0,mt;
function ac(){if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)();master=AC.createGain();master.gain.value=.5;master.connect(AC.destination)}catch(e){}}if(AC&&AC.state==='suspended')AC.resume();return AC}
function tone(f,t,d,type,v,dst){const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(dst||master);o.start(t);o.stop(t+d+.02)}
const mel=[523,0,659,784,659,0,523,392, 587,0,698,880,698,0,587,440, 523,659,784,1047,784,659,523,0, 392,494,587,494,392,0,330,0];
const bas=[131,131,196,196,147,147,220,220,131,131,196,196,98,98,165,165];
function sched(){if(!AC||!musicOn||muted)return;const t=AC.currentTime+.02,i=step%32;
if(mel[i])tone(mel[i],t,.16,'square',.07);
if(i%2==0)tone(bas[(i>>1)%16],t,.28,'triangle',.18);
step++}
function musicStart(){if(!ac())return;musicOn=true;clearInterval(mt);mt=setInterval(sched,140)}
function musicStop(){musicOn=false;clearInterval(mt)}
function blip(){if(!ac()||muted)return;const t=AC.currentTime;tone(880,t,.08,'square',.12);tone(1320,t+.07,.1,'square',.12)}
function scream(){if(!ac()||muted)return;const t=AC.currentTime;
const o=AC.createOscillator(),o2=AC.createOscillator(),g=AC.createGain(),f=AC.createBiquadFilter();
o.type='sawtooth';o2.type='square';f.type='bandpass';f.Q.value=2;
o.frequency.setValueAtTime(500,t);o.frequency.exponentialRampToValueAtTime(1500,t+.25);o.frequency.exponentialRampToValueAtTime(350,t+1.1);
o2.frequency.setValueAtTime(507,t);o2.frequency.exponentialRampToValueAtTime(1530,t+.25);o2.frequency.exponentialRampToValueAtTime(355,t+1.1);
f.frequency.setValueAtTime(1200,t);f.frequency.linearRampToValueAtTime(2200,t+.4);
const lfo=AC.createOscillator(),lg=AC.createGain();lfo.frequency.value=28;lg.gain.value=60;lfo.connect(lg);lg.connect(o.frequency);lfo.start(t);lfo.stop(t+1.2);
g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.35,t+.05);g.gain.exponentialRampToValueAtTime(.001,t+1.2);
o.connect(f);o2.connect(f);f.connect(g);g.connect(master);o.start(t);o2.start(t);o.stop(t+1.25);o2.stop(t+1.25)}
let bnVoice=null;
function pickVoice(){try{const v=speechSynthesis.getVoices();const bn=v.filter(x=>/^bn/i.test(x.lang)||/bengali|bangla/i.test(x.name));bnVoice=bn.find(x=>/\bmale\b|madhur|pradeep|bashkar/i.test(x.name)&&!/female/i.test(x.name))||bn[0]||null}catch(e){}}
try{pickVoice();speechSynthesis.onvoiceschanged=pickVoice}catch(e){}
function shout(){if(!ac()||muted)return;const t=AC.currentTime,D=.7;
const o=AC.createOscillator(),ws=AC.createWaveShaper(),out=AC.createGain(),lf=AC.createOscillator(),lg=AC.createGain();
const cv2=new Float32Array(256);for(let i=0;i<256;i++)cv2[i]=Math.tanh((i/128-1)*7);ws.curve=cv2;
o.type='sawtooth';o.frequency.setValueAtTime(140,t);o.frequency.linearRampToValueAtTime(185,t+.22);o.frequency.exponentialRampToValueAtTime(90,t+D);
lf.frequency.value=38;lg.gain.value=9;lf.connect(lg);lg.connect(o.frequency);
out.gain.setValueAtTime(.0001,t);out.gain.exponentialRampToValueAtTime(1.4,t+.04);out.gain.setValueAtTime(1.4,t+.5);out.gain.exponentialRampToValueAtTime(.001,t+D);
const F=[[[750,700,350,320],[1,1,1,1]],[[1250,1300,2200,2300],[.7,.7,.7,.7]]],T=[0,.22,.32,.5];
F.forEach(([fr,gn])=>{const b=AC.createBiquadFilter(),g=AC.createGain();b.type='bandpass';b.Q.value=7;g.gain.value=gn[0];
b.frequency.setValueAtTime(fr[0],t);fr.forEach((f,i)=>b.frequency.linearRampToValueAtTime(f,t+T[i]));
ws.connect(b);b.connect(g);g.connect(out)});
o.connect(ws);out.connect(master);o.start(t);lf.start(t);o.stop(t+D+.05);lf.stop(t+D+.05);
const nb=AC.createBuffer(1,AC.sampleRate*.2,AC.sampleRate),d=nb.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
[0,.42].forEach(off=>{const s=AC.createBufferSource(),b=AC.createBiquadFilter(),g=AC.createGain();s.buffer=nb;b.type='bandpass';b.frequency.value=off?4200:1800;g.gain.setValueAtTime(.7,t+off);g.gain.exponentialRampToValueAtTime(.001,t+off+.12);s.connect(b);b.connect(g);g.connect(master);s.start(t+off);s.stop(t+off+.15)})}
let khLoading=false;let khBuf=null;
function loadKh(){if(khBuf||!AC||khLoading||typeof KH64==='undefined')return;khLoading=true;try{const s=atob(KH64),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);AC.decodeAudioData(u.buffer,b=>{khBuf=b},()=>{khLoading=false})}catch(e){khLoading=false}}
function khaichi(){if(muted||!ac())return;loadKh();if(!khBuf){shout();return}
const s=AC.createBufferSource(),g=AC.createGain(),c=AC.createDynamicsCompressor();s.buffer=khBuf;s.playbackRate.value=1.03;g.gain.value=1.5;s.connect(g);g.connect(c);c.connect(AC.destination);s.start()}
function oldKhaichi(){if(muted)return;try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance('খাইছি!');u.lang='bn-BD';if(bnVoice){u.voice=bnVoice;u.lang=bnVoice.lang}u.rate=1.2;u.pitch=0;u.volume=1;speechSynthesis.speak(u)}catch(e){}}
// ---------- GAME ----------
function rnd(n){return Math.floor(Math.random()*n)}
function free(){let p;do{p={x:rnd(N),y:rnd(N)}}while(snake.some(s=>s.x==p.x&&s.y==p.y)||(bonus&&bonus.x==p.x&&bonus.y==p.y));return p}
function spawn(){food=free();food.e=FOODS[rnd(3)]}
function reset(){snake=[{x:6,y:10},{x:5,y:10},{x:4,y:10}];dir=nd={x:1,y:0};score=0;speed=150;bonus=null;spawn();$('sc').textContent=0}
function start(){ac();loadKh();setTimeout(loadKh,300);reset();alive=true;$('start').classList.add('hide');$('over').classList.add('hide');musicStart();loop()}
function loop(){clearTimeout(timer);if(!alive)return;tick();if(alive)timer=setTimeout(loop,speed)}
function tick(){dir=nd;const h={x:snake[0].x+dir.x,y:snake[0].y+dir.y};
if(h.x<0||h.y<0||h.x>=N||h.y>=N||snake.some(s=>s.x==h.x&&s.y==h.y)){return die()}
snake.unshift(h);let ate=false;
if(h.x==food.x&&h.y==food.y){score+=10;ate=true;spawn();if(!bonus&&Math.random()<.2){bonus=free();bonus.ttl=50}}
else if(bonus&&h.x==bonus.x&&h.y==bonus.y){score+=20;ate=true;bonus=null}
if(ate){$('sc').textContent=score;speed=Math.max(70,speed-3);blip();khaichi()}else snake.pop();
if(bonus&&--bonus.ttl<=0)bonus=null;draw()}
function die(){alive=false;musicStop();scream();gameOverSound.currentTime = 0;
gameOverSound.play().then(() => {
  console.log("Game-over sound played!");
}).catch(error => {
  console.error("Game-over sound failed:", error);
});draw(true);
if(score>best){best=score;$('bs').textContent=best}
$('res').innerHTML='YOU SCORED<br><b style="font-size:18px">'+score+'</b>';$('over').classList.remove('hide');submit(score)}
function draw(dead){ctx.fillStyle='#b5d62b';ctx.fillRect(0,0,360,360);
ctx.fillStyle='#a3c41f';for(let x=0;x<N;x++)for(let y=0;y<N;y++)if((x+y)%2==0)ctx.fillRect(x*S,y*S,S,S);
ctx.font='15px serif';ctx.textAlign='center';ctx.textBaseline='middle';
ctx.fillText(food.e,food.x*S+S/2,food.y*S+S/2+1);
if(bonus){ctx.globalAlpha=bonus.ttl<12&&bonus.ttl%2?.3:1;ctx.fillText('🍋',bonus.x*S+S/2,bonus.y*S+S/2+1);ctx.globalAlpha=1}
snake.forEach((s,i)=>{ctx.fillStyle=dead?'#7a2a1a':INK;ctx.fillRect(s.x*S+1,s.y*S+1,S-2,S-2);
if(i==0){ctx.fillStyle='#b5d62b';const ex=dir.x?(dir.x>0?11:3):4,ey=dir.y?(dir.y>0?11:3):4;
ctx.fillRect(s.x*S+(dir.x?ex:4),s.y*S+(dir.y?ey:4),3,3);ctx.fillRect(s.x*S+(dir.x?ex:11),s.y*S+(dir.y?ey:11),3,3);
if(dead){ctx.fillStyle='#fff'}}})}
function turn(d){const m={u:{x:0,y:-1},d:{x:0,y:1},l:{x:-1,y:0},r:{x:1,y:0}}[d];if(!m)return;if(m.x==-dir.x&&m.y==-dir.y&&(m.x||m.y)&&snake.length>1)return;nd=m}
addEventListener('keydown',e=>{const k={ArrowUp:'u',ArrowDown:'d',ArrowLeft:'l',ArrowRight:'r',w:'u',s:'d',a:'l',d:'r'}[e.key];if(k){if(alive)e.preventDefault();turn(k)}});
document.querySelectorAll('.pad button').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();turn(b.dataset.d)}));
let tx,ty;cv.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY},{passive:true});
cv.addEventListener('touchmove',e=>{if(tx==null)return;const dx=e.touches[0].clientX-tx,dy=e.touches[0].clientY-ty;if(Math.abs(dx)>22||Math.abs(dy)>22){turn(Math.abs(dx)>Math.abs(dy)?(dx>0?'r':'l'):(dy>0?'d':'u'));tx=null}},{passive:true});
$('go').onclick=()=>{const n=$('nm').value.trim();if(!n){$('nm').focus();$('nm').style.background='#ffb3a0';return}try{localStorage.setItem('4p_name',n)}catch(e){}start()};
$('again').onclick=start;
try{$('nm').value=localStorage.getItem('4p_name')||''}catch(e){}
const mb=document.createElement('button');mb.className='mute';mb.textContent='🔊';mb.onclick=()=>{muted=!muted;mb.textContent=muted?'🔇':'🔊';if(muted)speechSynthesis&&speechSynthesis.cancel()};document.querySelector('.scr').appendChild(mb);
// ---------- LEADERBOARD (shared, Firebase Firestore REST) ----------
const CFG=window.FIREBASE_CONFIG||{};
const online=!!(CFG.apiKey&&CFG.projectId&&!/YOUR/i.test(CFG.apiKey+CFG.projectId));
const BASE=online?'https://firestore.googleapis.com/v1/projects/'+CFG.projectId+'/databases/(default)/documents':'';
const KEY=online?'?key='+encodeURIComponent(CFG.apiKey):'';
let rows=[];
function render(){
  const t = rows.slice().sort((a,b) => b.score - a.score);
  const m = ['🥇','🥈','🥉'];

  $('lb').innerHTML = t.length
    ? t.map((r,i) =>
        '<div><span class="n">' +
        (i < 3 ? m[i] : '#' + (i + 1)) +
        ' ' + esc(r.name) +
        '</span><b>' + r.score + '</b></div>'
      ).join('')
    : '<div>No scores yet. Be the first!</div>';
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function loadLocal(){try{rows=JSON.parse(localStorage.getItem('4p_lb')||'[]')}catch(e){rows=[]}}
function pid(n){return 'p_'+Array.from(new TextEncoder().encode(n.toLowerCase())).map(b=>b.toString(16).padStart(2,'0')).join('')}
async function fetchTop(){
try{const r=await fetch(BASE+':runQuery'+KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({structuredQuery:{from:[{collectionId:'scores'}],orderBy:[{field:{fieldPath:'score'},direction:'DESCENDING'}],limit:200}})});
if(!r.ok)throw 0;const j=await r.json();
rows=j.filter(x=>x.document).map(x=>({name:x.document.fields.name.stringValue,score:parseInt(x.document.fields.score.integerValue,10)}));
render();$('lbnote').textContent='Live leaderboard · same for everyone.'}
catch(e){$('lbnote').textContent='Leaderboard offline – retrying…'}}

async function submit(s) {
  const name = $('nm').value.trim().slice(0, 14) || 'Player';

  if (!online) {
    const r = rows.find(x => x.name === name);
    if (r) {
      if (s > r.score) r.score = s;
    } else {
      rows.push({ name: name, score: s });
    }
    try {
      localStorage.setItem('4p_lb', JSON.stringify(rows));
    } catch (e) {}
    render();
    return;
  }

  try {
    const url = BASE + '/scores/' + pid(name) + KEY;
    const g = await fetch(url);
    let old = -1;

    if (g.ok) {
      const d = await g.json();
      old = parseInt(d.fields.score.integerValue, 10);
    } else if (g.status !== 404) {
      $('lbnote').textContent = 'Leaderboard temporarily unavailable';
      return;
    }

    if (s > old) {
      const w = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            name: { stringValue: name },
            score: { integerValue: String(s) },
            at: { integerValue: String(Date.now()) }
          }
        })
      });

      if (!w.ok) {
        console.error('Score save failed:', w.status, await w.text());
        $('lbnote').textContent = 'Score could not be saved';
        return;
      }
    }

    await fetchTop();
  } catch (e) {
    $('lbnote').textContent = 'Leaderboard temporarily unavailable';
    console.error('Leaderboard error:', e);
  }
}
catch(e){}
fetchTop()}
draw=draw;reset();draw();
if(online){$('lb').innerHTML='<div>Loading…</div>';fetchTop();}
else{loadLocal();render();$('lbnote').textContent='Leaderboard on this device only (online leaderboard not set up).'}
})();
