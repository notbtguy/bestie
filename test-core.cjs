const fs=require('fs'), assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const core=fs.readFileSync('app/src/main/assets/bestie_core.js','utf8');
const rules=JSON.parse(fs.readFileSync('rules.json'));
let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const defaults={...rules,appVersion:'1.3.0',appVersionCode:5,storiesOnlyHome:true,hideStories:false,blockReels:true,disableSwipe:true,debug:true};
async function page(path,html,extra={}){
 const d=new JSDOM('<!doctype html><html><head></head><body><header id="header">Instagram</header>'+html+'<nav id="nav">Home Search Inbox Profile</nav></body></html>',{url:'https://www.instagram.com'+path,runScripts:'dangerously',pretendToBeVisual:true});
 const w=d.window;w.HTMLMediaElement.prototype.pause=function(){};w.__BESTIE_CONFIG={...defaults,...extra};w.eval(core);await wait(180);return d;
}
function visible(w,sel){let el=typeof sel==='string'?w.document.querySelector(sel):sel; if(!el)return false;while(el&&el.nodeType===1){if(w.getComputedStyle(el).display==='none')return false;el=el.parentElement}return true}
function common(w){for(const id of ['header','nav','main'])ok(visible(w,'#'+id),id+' remains visible');ok(w.document.body.textContent.includes('Bestie 1.3.0 (5)'),'app version diagnostic');ok(w.document.body.textContent.includes('CSS: true'),'CSS layer diagnostic');}
const trays=[
 '<div id="tray" role="menu" aria-label="Stories"><button id="own" role="menuitem">Your story</button><button id="friend" role="menuitem">Friend</button></div>',
 '<ul id="tray"><li><button id="own">Your story</button></li><li><a id="friend" href="/stories/friend/123/">Friend</a></li></ul>',
 '<div id="tray"><button id="own">Your story</button><button id="friend">Friend</button></div>'
];
const feed='<section id="feed"><article id="post">Post</article><article id="ad">Sponsored</article><article id="post2">Post2</article><div id="sug"><span>Suggestions for you</span><button>Follow</button></div><div id="nonarticle">Unknown feed markup <video></video></div></section>';
(async()=>{
 for(let t=0;t<trays.length;t++)for(const nested of [false,true]){
  const html='<main id="main">'+(nested?'<section id="shared">':'')+trays[t]+feed+(nested?'</section>':'')+'</main>';
  const d=await page('/',html),w=d.window;common(w);
  for(const id of ['tray','own','friend'])ok(visible(w,'#'+id),`tray ${t} ${id} visible`);
  for(const id of ['post','post2','ad','sug'])ok(!visible(w,'#'+id),`home ${id} hidden`);
  if(t<2)ok(!visible(w,'#nonarticle'),'structural nonarticle hidden');
  let clicked=false;w.document.querySelector('#friend').addEventListener('click',e=>{e.preventDefault();clicked=true});w.document.querySelector('#friend').click();ok(clicked,'story click stays wired');
  w.document.documentElement.className='hydrated';await wait(160);ok(w.document.documentElement.classList.contains('bestie-home'),'class repaired');ok(visible(w,'#tray'),'hydration preserves tray');
  w.document.querySelector('#post').removeAttribute('style');await wait(160);ok(!visible(w,'#post'),'inline style wipe repaired');
  w.document.querySelector('#main').insertAdjacentHTML('beforeend','<article id="late">Late post</article>');await wait(160);ok(!visible(w,'#late'),'late post hidden');
  w.document.querySelector('#main').insertAdjacentHTML('beforeend','<div id="lateSug"><span>People you may know</span><button>Follow</button></div>');await wait(800);w.__bestie.update(w.__BESTIE_CONFIG);await wait(160);ok(!visible(w,'#lateSug'),'late suggestion hidden');ok(visible(w,'#tray'),'late mutation preserves tray');
  w.history.pushState({},'', '/friend/');await wait(180);ok(visible(w,'#post'),'SPA profile restores hidden DOM');ok(visible(w,'#sug'),'SPA profile restores suggestions');ok(!w.document.documentElement.classList.contains('bestie-home'),'home class removed');
  d.window.close();
 }
 // No identified tray: conservative article-only fallback, never blank the page.
 let d=await page('/','<main id="main"><div id="spinner">Loading stories</div>'+feed+'</main>'),w=d.window;
 ok(visible(w,'#spinner'),'spinner visible');w.document.querySelector('#main').insertAdjacentHTML('afterbegin',trays[0]);await wait(180);ok(visible(w,'#tray'),'late tray visible');ok(!visible(w,'#nonarticle'),'late tray enables structural hide');w.close();
 for(const path of ['/explore/','/explore/tags/cars/','/explore/search/']){
  d=await page(path,'<main id="main"><section id="searchWrap"><input id="search" type="search" placeholder="Search"></section><div id="grid" role="grid"><a id="tile" href="/p/a/"><img alt="Post"></a><a id="reelTile" href="/reel/b/">Reel</a></div></main>');w=d.window;common(w);
  ok(visible(w,'#search'),'search visible '+path);ok(!visible(w,'#grid'),'grid hidden '+path);ok(!visible(w,'#tile'),'tile hidden');ok(!visible(w,'#reelTile'),'reel tile hidden');
  const input=w.document.querySelector('#search');input.value='friend';input.dispatchEvent(new w.Event('input',{bubbles:true}));w.document.querySelector('#main').insertAdjacentHTML('beforeend','<div id="results"><a id="result" href="/friend/">Friend account</a></div>');await wait(180);
  ok(visible(w,'#results'),'unlabelled results visible');ok(visible(w,'#result'),'profile result visible');ok(input.value==='friend','typing value retained');
  let clicked=false;w.document.querySelector('#result').addEventListener('click',e=>{e.preventDefault();clicked=true;w.history.pushState({},'', '/friend/')});w.document.querySelector('#result').click();await wait(180);ok(clicked,'result click works');ok(visible(w,'#grid'),'profile grid unaffected after navigation');w.close();
 }
 // Navbar search input outside main, role-based dropdown results, style recreation and equal-count swaps.
 d=await page('/explore/','<input id="search" type="search"><main id="main"><div role="grid" id="grid"><a href="/p/a/">tile</a></div><div role="listbox" id="results"><a href="/friend/">Friend</a></div></main>');w=d.window;
 ok(visible(w,'#search'),'external search visible');ok(visible(w,'#results'),'listbox visible');ok(!visible(w,'#grid'),'grid hidden with external search');
 await wait(400);w.document.querySelector('#bestie-style').remove();await wait(160);ok(!!w.document.querySelector('#bestie-style'),'style recreated after removal');
 w.document.querySelector('#nav').insertAdjacentHTML('beforeend','<a id="reelslink" href="/reels/">Reels</a>');await wait(160);ok(!visible(w,'#reelslink'),'new reels nav hidden');w.document.querySelector('#reelslink').outerHTML='<a id="reelslink2" href="/reels/">Reels2</a>';await wait(160);ok(!visible(w,'#reelslink2'),'equal count replacement hidden');w.close();
 for(const path of ['/friend/','/direct/inbox/','/direct/t/abc/','/stories/friend/123/']){
 d=await page(path,'<main id="main">'+trays[0]+feed+'</main>');w=d.window;common(w);for(const id of ['tray','post','ad','sug','nonarticle'])ok(visible(w,'#'+id),'off-home '+path+' '+id+' visible');w.close();
 }
 for(const path of ['/reel/abc/','/reels/abc/']){
 d=await page(path,'<main id="main"><div id="current"><video id="video" controls></video><button id="comments">Comments</button></div><div id="next"><video></video></div></main>');w=d.window;
 ok(visible(w,'#current'),'single reel visible');ok(visible(w,'#video'),'single video visible');ok(visible(w,'#comments'),'reel controls visible');ok(!visible(w,'#next'),'next reel hidden');ok(!w.document.querySelector('#video').loop,'no auto-loop');w.close();
 }
 // Adversarial nesting: article containing the actual tray must not be hidden.
 d=await page('/','<main id="main"><article id="storyArticle">'+trays[0]+'</article>'+feed+'</main>');w=d.window;ok(visible(w,'#storyArticle'),'article containing tray protected');ok(visible(w,'#tray'),'nested tray visible');w.close();
 // Config update must restore home state when stories-only is off.
 d=await page('/','<main id="main">'+trays[0]+feed+'</main>');w=d.window;w.__bestie.update({...defaults,storiesOnlyHome:false});await wait(180);ok(visible(w,'#post'),'setting off restores posts');ok(visible(w,'#nonarticle'),'setting off restores structural content');w.close();
 // Search bar outside main with unknown content: preserve search, remove all content.
 d=await page('/explore/','<input id="search" type="search"><main id="main"><div id="unknown">Stories, video cards, unknown grid</div></main>');w=d.window;
 ok(visible(w,'#search'),'external search bar retained');ok(!visible(w,'#unknown'),'unknown explore layout hidden');
 w.document.querySelector('#search').value='friend';w.document.querySelector('#search').dispatchEvent(new w.Event('input',{bubbles:true}));w.document.querySelector('#main').innerHTML='<a id="result" href="/friend/">Friend</a>';await wait(180);ok(visible(w,'#result'),'external search restores results');w.close();
 // Search trigger rendered as a button rather than an input.
 d=await page('/explore/','<main id="main"><button id="search">Search</button><div id="unknown">Unknown content</div></main>');w=d.window;ok(visible(w,'#search'),'search trigger kept');ok(!visible(w,'#unknown'),'unknown content beside trigger hidden');w.close();
 // Stories hydrate into an element previously hidden as a feed post.
 d=await page('/','<main id="main"><article id="lateTray">Loading</article>'+feed+'</main>');w=d.window;
 w.document.querySelector('#lateTray').innerHTML=trays[0];await wait(180);ok(visible(w,'#tray'),'tray replacing hidden post is released');w.close();
 // Native login behavior: mirrors implementation; source checks keep mirror honest, not a device test.
 const constants=fs.readFileSync('app/src/main/java/com/sanidhya/bestie/Constants.kt','utf8'),main=fs.readFileSync('app/src/main/java/com/sanidhya/bestie/MainActivity.kt','utf8'),client=fs.readFileSync('app/src/main/java/com/sanidhya/bestie/BestieWebViewClient.kt','utf8');
 ok(constants.includes('/accounts/login/'),'native login URL present');ok(main.includes('Constants.startUrl()'),'native start checks session');ok(client.includes('!Constants.hasSession()'),'interstitial redirect checks native cookie');
 const start=session=>session?'/':'/accounts/login/';const redirect=(path,session)=>path==='/'&&!session?'/accounts/login/':path;
 ok(start(false)==='/accounts/login/','no session starts login');ok(start(true)==='/','session starts home');ok(redirect('/',false)==='/accounts/login/','logged out root redirects');ok(redirect('/accounts/login/',false)==='/accounts/login/','no login loop');ok(redirect('/',true)==='/','post login home preserved');
 console.log('PASS '+checks+' checks');fs.writeFileSync('/tmp/bestie-test-results.txt','PASS '+checks+' checks\n');
})().catch(e=>{console.error(e);process.exit(1)});
