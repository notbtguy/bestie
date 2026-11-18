const fs=require('fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const core=fs.readFileSync('app/src/main/assets/bestie_core.js','utf8');let checks=0;const ok=(v,m)=>{assert.ok(v,m);checks++};const wait=ms=>new Promise(r=>setTimeout(r,ms));
const nav='<nav id="global"><a href="/">Home</a><a href="/explore/">Search</a><a href="/reels/">Reels</a><a id="activity" href="/accounts/activity/"><svg aria-label="Notifications"></svg></a><a id="profile" href="/my.account/"><svg aria-label="Profile"></svg></a></nav>';
const content='<main><nav id="local"><a href="/direct/t/abc/">Chat</a></nav><article id="post">Profile post</article><div id="suggestion">Suggestions for you</div><div role="grid" id="grid">Grid</div><video id="video" controls></video><textarea id="message"></textarea><input id="search" placeholder="Search"></main>';
function visible(w,id){let el=w.document.getElementById(id);while(el){if(w.getComputedStyle(el).display==='none')return false;el=el.parentElement}return true}
(async()=>{
 for(const route of ['/direct/inbox/','/direct/t/abc/','/accounts/activity/','/my.account/','/friend/','/reel/abc/','/','/explore/']){
 const d=new JSDOM('<html><head></head><body>'+nav+content+'</body></html>',{url:'https://www.instagram.com'+route,runScripts:'dangerously',pretendToBeVisual:true}),w=d.window;let notified=0;w.BestieBridge={onRouteChange:()=>notified++};w.eval(core);await wait(50);
 ok(!visible(w,'global'),'global nav hidden '+route);
 for(const id of ['local','post','suggestion','grid','video','message','search'])ok(visible(w,id),'content untouched '+route+' '+id);
 ok(!w.document.querySelector('[data-bestie-hidden],[data-bestie-scoped]'),'no feed hider markers');ok(w.document.querySelector('#video').loop===false,'video default untouched');
 const msg=w.document.getElementById('message');msg.value='hello';msg.dispatchEvent(new w.Event('input',{bubbles:true}));ok(msg.value==='hello','composer usable');
 let clicked=false;w.document.querySelector('#profile').addEventListener('click',e=>{e.preventDefault();clicked=true});ok(w.__bestie.openProfile(),'own profile resolved');ok(clicked,'actual profile link clicked');clicked=false;w.document.querySelector('#bestie-tabs button[data-tab="Profile"]').click();ok(clicked,'footer profile icon clicks own profile');
 clicked=false;w.document.querySelector('#activity').addEventListener('click',e=>{e.preventDefault();clicked=true});ok(w.__bestie.openActivity(),'activity resolved');ok(clicked,'actual notification link clicked');clicked=false;w.document.querySelector('#bestie-tabs button[data-tab="Activity"]').click();ok(clicked,'footer heart clicks notifications without recursion');
 w.history.pushState({},'', '/direct/t/def/');ok(notified>=2,'SPA route notified');
 w.__bestie.update({storiesOnlyHome:true,blockReels:true,hideStories:true,disableSwipe:true});await wait(400);ok(visible(w,'post'),'old settings cannot reactivate filters');
 const buttons=w.document.querySelectorAll('#bestie-tabs button');ok(buttons.length===3,'3 page-owned buttons');
 for(const button of buttons){ok(button.textContent==='', 'icon only');ok(!!button.getAttribute('aria-label'),'accessible label');ok(button.querySelector('svg'),'svg icon');}
 ok(!w.document.querySelector('#bestie-tabs').hidden,'footer visible');
 const sheet=w.document.querySelector('#bestie-shell-style');w.eval(core);ok(w.document.querySelectorAll('#bestie-shell-style').length===1,'idempotent');
 w.document.querySelector('main').insertAdjacentHTML('beforeend','<article id="late">Late post</article>');await wait(400);ok(visible(w,'late'),'late posts untouched');
 d.window.close();
 }
 // Div-based mobile footer, and in-content navigation are distinct.
 let plain=new JSDOM('<body><div id="footer"><a href="/">Home</a><a href="/explore/">Explore</a><a href="/direct/inbox/">Inbox</a></div><main id="content"><p>Message</p></main></body>',{url:'https://www.instagram.com/direct/inbox/',runScripts:'dangerously',pretendToBeVisual:true});plain.window.eval(core);ok(!visible(plain.window,'footer'),'div global footer hidden');ok(visible(plain.window,'content'),'main never hidden');plain.window.close();
 // Keyboard hides the icon row, then restores it without covering input.
 let keyboard=new JSDOM('<body style="background:#101114;color:#eee"><textarea></textarea></body>',{url:'https://www.instagram.com/direct/t/a/',runScripts:'dangerously',pretendToBeVisual:true});let resize;keyboard.window.visualViewport={height:300,addEventListener:(name,fn)=>{resize=fn;}};keyboard.window.eval(core);keyboard.window.document.querySelector('textarea').focus();ok(keyboard.window.document.querySelector('#bestie-tabs').classList.contains('bestie-keyboard'),'keyboard row hides');keyboard.window.document.querySelector('textarea').blur();await wait(10);keyboard.window.visualViewport.height=keyboard.window.innerHeight;resize();ok(!keyboard.window.document.querySelector('#bestie-tabs').classList.contains('bestie-keyboard'),'keyboard row restores');ok(keyboard.window.document.querySelector('#bestie-tabs').style.getPropertyValue('--bestie-bg')==='rgb(16, 17, 20)','theme matches page pixels');keyboard.window.close();
 // No footer over login, and it reappears after SPA login.
 let auth=new JSDOM('<body></body>',{url:'https://www.instagram.com/accounts/login/',runScripts:'dangerously',pretendToBeVisual:true});auth.window.eval(core);ok(auth.window.document.querySelector('#bestie-tabs').hidden,'footer hidden on login');auth.window.history.pushState({},'', '/direct/inbox/');await wait(400);ok(!auth.window.document.querySelector('#bestie-tabs').hidden,'footer restored after login');auth.window.close();
 // Never take another person's profile link in a DM or body.
 let d=new JSDOM('<body><main><a href="/other/"><img alt="Other profile picture"></a></main></body>',{url:'https://www.instagram.com/direct/t/a/',runScripts:'dangerously',pretendToBeVisual:true});d.window.eval(core);ok(d.window.__bestie.openProfile()===false,'unidentified own profile fails safely');ok(d.window.__bestie.openActivity()===false,'missing notifications returns false');d.window.close();
 d=new JSDOM('<body><nav><a href="/">Home</a><a id="own" href="/me/"><img alt="Me profile picture"></a></nav></body>',{url:'https://www.instagram.com/direct/inbox/',runScripts:'dangerously',pretendToBeVisual:true});d.window.eval(core);let clicked=false;d.window.document.querySelector('#own').addEventListener('click',e=>{e.preventDefault();clicked=true});ok(d.window.__bestie.openProfile()&&clicked,'own avatar within global navigation works');d.window.close();
 const base='app/src/main/java/com/sanidhya/bestie/';const constants=fs.readFileSync(base+'Constants.kt','utf8'),client=fs.readFileSync(base+'BestieWebViewClient.kt','utf8'),native=fs.readFileSync(base+'MainActivity.kt','utf8'),builder=fs.readFileSync(base+'ScriptBuilder.kt','utf8'),layout=fs.readFileSync('app/src/main/res/layout/activity_main.xml','utf8');
 ok(constants.includes('if (hasSession()) INBOX_URL else LOGIN_URL'),'session opens inbox; logged out login');ok(client.includes('view.loadUrl(Constants.startUrl())'),'root/login return goes inbox');
 ok(!builder.includes('rules.script'),'remote scripts disabled');ok(!native.includes('repo.fetchRemote()'),'no startup remote rule network request');
 ok(!layout.includes('@+id/bottomTabs'),'native footer removed');ok(!layout.includes('layout_marginBottom="64dp"'),'native reserved gap removed');
 ok(core.includes('bestie-tabs'),'page-owned footer');ok(core.includes('safe-area-inset-bottom'),'safe area included');ok(core.includes('bestie-keyboard'),'keyboard aware');
 for(const feature of ['applyHome','applyExplore','attributeFilter','touchmove'])ok(!core.includes(feature),'no filter '+feature);
 const policy=fs.readFileSync(base+'UrlPolicy.kt','utf8');ok(policy.includes('path == "/"'),'home routes away');ok(policy.includes('path.startsWith("/explore/")'),'Explore routes away');
 console.log('PASS '+checks+' checks (new three-tab behavior; legacy filter tests intentionally retired)');
})().catch(e=>{console.error(e);process.exit(1)});
