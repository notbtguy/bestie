/* Bestie lightweight shell. No feed filters, video locks, body scans or attribute observers. */
(function () {
  'use strict';
  if (window.__bestie && window.__bestie.shell) return;
  var B = window.__bestie = {shell:true, installed:true};
  var profilePath = '';
  var modalRoot = null;
  var clickedReel = '';
  var clickedAt = 0;
  var reelScrollLocks = [];
  var style = null;
  var timer = null;
  var footer = null;
  var lastThemePath = '';
  var ICONS = {
    Messages: '<path d="M21 11.5a8.3 8.3 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.3 8.3 0 0 1-3.8-.9L3 21l1.9-5.7a8.3 8.3 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.3 8.3 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
    Activity: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    Profile: '<circle cx="12" cy="8" r="3.3"/><path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"/>'
  };
  function renderFooter() {
    if (!document.body) return;
    if (!footer || !footer.isConnected) {
      footer=document.createElement('nav');footer.id='bestie-tabs';
      footer.setAttribute('aria-label','Bestie navigation');
      Object.keys(ICONS).forEach(function(name){
        var button=document.createElement('button');button.type='button';
        button.setAttribute('aria-label',name);button.setAttribute('title',name);
        button.dataset.tab=name;
        button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+ICONS[name]+'</svg>';
        button.addEventListener('click',function(){
          if(name==='Messages') location.assign('/direct/inbox/');
          else if(name==='Activity') {if(!B.openActivity()) location.assign('/accounts/activity/');}
          else if(!B.openProfile()) {
            var status=document.getElementById('bestie-status');
            if(!status){status=document.createElement('div');status.id='bestie-status';status.setAttribute('role','status');footer.appendChild(status);}
            status.textContent='Set your Instagram username in Bestie Settings, then tap Profile again.';
            setTimeout(function(){if(status.isConnected)status.remove();},2500);
          }
        });
        footer.appendChild(button);
      });
      document.body.appendChild(footer);
    }
    var p=location.pathname;
    var auth=/^\/accounts\/(login|signup|password|onetap|emailsignup)|^\/(challenge|two_factor)/.test(p);
    footer.hidden=auth;
    document.documentElement.classList.toggle('bestie-has-tabs',!auth);
    footer.querySelectorAll('button').forEach(function(button){
      var active=button.dataset.tab==='Messages'?p.indexOf('/direct/')===0:
        button.dataset.tab==='Activity'?/\/(accounts\/activity|notifications)/.test(p):
        !!profilePath && p.replace(/\/$/,'')===profilePath.replace(/\/$/,'');
      button.setAttribute('aria-current',active?'page':'false');
    });
    if(lastThemePath!==p){lastThemePath=p;matchTheme();}
  }
  function matchTheme() {
    if(!footer || !document.body)return;
    var body=window.getComputedStyle(document.body),html=window.getComputedStyle(document.documentElement);
    var bg=body.backgroundColor;
    if(!bg || bg==='transparent' || bg==='rgba(0, 0, 0, 0)')bg=html.backgroundColor;
    if(!bg || bg==='transparent' || bg==='rgba(0, 0, 0, 0)')bg=window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches?'#0c0d10':'#fff';
    footer.style.setProperty('--bestie-bg',bg);footer.style.setProperty('--bestie-fg',body.color || '#111');
  }
  function keyboardState(){
    if(!footer)return;
    var target=document.activeElement;
    var editing=target && target.matches('input,textarea,[contenteditable="true"]');
    // Android adjustResize can shrink both viewports equally. Focus is the reliable signal.
    footer.classList.toggle('bestie-keyboard',!!editing);
  }
/* Route-scoped shared-reel guard. Installed once; inert everywhere except /reel/<id>. */
  var reelPath = '';
  var keptVideo = null;
  var reelHidden = [];
  function isReel(p){return /^\/reels?\/[^/]+\/?$/.test(p);}
  function viewerRoot(){
    if(isReel(location.pathname))return document;
    var dialogs=document.querySelectorAll('[role="dialog"], [aria-modal="true"]');
    for(var i=dialogs.length-1;i>=0;i--){
      if(dialogs[i].querySelector('video'))return dialogs[i];
    }
    return null;
  }
  function activeReel(){return isReel(location.pathname) || !!viewerRoot();}
  function clearReel(){
    reelScrollLocks.forEach(function(item){item.el.style.overflow=item.overflow;item.el.style.touchAction=item.touch;});
    reelScrollLocks=[];modalRoot=null;
    reelHidden.forEach(function(item){
      if(item.display)item.el.style.setProperty('display',item.display,item.priority);
      else item.el.style.removeProperty('display');
      item.el.removeAttribute('data-bestie-next-reel');
    });
    reelHidden=[];keptVideo=null;reelPath='';
    try{if(window.BestieBridge && window.BestieBridge.onReelGuard)window.BestieBridge.onReelGuard(false);}catch(e){}
    document.documentElement.classList.remove('bestie-single-reel');
  }
  function hideReelBranch(el){
    if(!el || el===document.body || el===document.documentElement ||
      el.id==='bestie-tabs' || el.contains(keptVideo) || el.closest('#bestie-tabs') ||
      (el.closest('[role="dialog"]') && el.closest('[role="dialog"]')!==modalRoot))return;
    if(!el.hasAttribute('data-bestie-next-reel')){
      reelHidden.push({el:el,display:el.style.getPropertyValue('display'),priority:el.style.getPropertyPriority('display')});
      el.setAttribute('data-bestie-next-reel','1');
    }
    if(el.style.getPropertyValue('display')!=='none')el.style.setProperty('display','none','important');
  }
  function guardReel(){
    var p=location.pathname;
    var root=viewerRoot();
    if(!root){if(reelPath)clearReel();return;}
    var key=isReel(p)?p:(clickedReel || p+'#modal');
    if(reelPath && (reelPath!==key || (!isReel(p) && modalRoot && modalRoot!==root)))clearReel();
    reelPath=key;
    modalRoot=root===document?null:root;
    document.documentElement.classList.add('bestie-single-reel');
    var videos=root.querySelectorAll('video');
    if(!keptVideo || !keptVideo.isConnected){
      keptVideo=null;
      // Prefer a video explicitly associated with this shortcode, otherwise first in DOM.
      var code=(isReel(p)?p:clickedReel).split('/')[2] || '';
      for(var i=0;i<videos.length;i++){
        var card=videos[i].closest('article,[role="listitem"]');
        if(card && card.querySelector('a[href*="/'+code+'/"]')){keptVideo=videos[i];break;}
      }
      keptVideo=keptVideo || videos[0] || null;
    }
    if(!keptVideo)return;
    modalRoot=keptVideo.closest('[role="dialog"],[aria-modal="true"]') || modalRoot;
    try{if(window.BestieBridge && window.BestieBridge.onReelGuard)window.BestieBridge.onReelGuard(true);}catch(e){}
    keptVideo.loop=false;
    // Lock only the kept player's ancestor scrollers, including a reel modal on /direct/.
    var ancestor=keptVideo.parentElement;
    while(ancestor && ancestor!==document.body){
      if(!reelScrollLocks.some(function(item){return item.el===ancestor;})){
        reelScrollLocks.push({el:ancestor,overflow:ancestor.style.overflow,touch:ancestor.style.touchAction});
        ancestor.style.overflow='hidden';ancestor.style.touchAction='none';
      }
      if(ancestor===modalRoot)break;
      ancestor=ancestor.parentElement;
    }
    videos.forEach(function(video){
      if(video===keptVideo)return;
      var node=video;
      while(node.parentElement && node.parentElement!==document.body &&
        !node.parentElement.contains(keptVideo) && !node.parentElement.matches('main,[role="main"]'))node=node.parentElement;
      hideReelBranch(node);
      try{video.pause();}catch(e){}
    });
    // The real device shows a Suggested heading plus a continuation card below the kept reel.
    root.querySelectorAll('span,h2,h3').forEach(function(label){
      if(label.children.length || !/^(suggested|suggested reels|more reels|more like this|recommended for you)$/i.test((label.textContent||'').trim()))return;
      var node=label;
      for(var n=0;n<6 && node.parentElement && node.parentElement!==document.body &&
        !node.parentElement.contains(keptVideo) && !node.parentElement.matches('main,[role="main"],[role="dialog"]');n++)node=node.parentElement;
      hideReelBranch(node);
    });
    root.querySelectorAll('a[href]').forEach(function(a){
      var path;try{path=new URL(a.href,location.href).pathname;}catch(e){return;}
      if(isReel(path) && path.replace(/\/$/,'')!==p.replace(/\/$/,''))hideReelBranch(a);
    });
  }
  function reelException(target){
    if(!target || !target.closest)return false;
    if(target.closest('#bestie-tabs,[role="listbox"],textarea,input,[contenteditable="true"],[aria-label*="Comments"],[aria-label*="comments"]'))return true;
    var dialog=target.closest('[role="dialog"],[aria-modal="true"]');
    return !!dialog && dialog!==modalRoot;
  }
  function stopReelScroll(e){
    if(activeReel() && !keptVideo)guardReel();
    if(activeReel() && !reelException(e.target)){if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();}
  }
  document.addEventListener('touchmove',stopReelScroll,{capture:true,passive:false});
  document.addEventListener('wheel',stopReelScroll,{capture:true,passive:false});
  document.addEventListener('keydown',function(e){
    if(/^(ArrowDown|ArrowUp|PageDown|PageUp|End|Home| )$/.test(e.key))stopReelScroll(e);
  },true);
  document.addEventListener('click',function(e){
    var a=e.target.closest && e.target.closest('a[href]');if(!a)return;
    var p;try{p=new URL(a.href,location.href).pathname;}catch(err){return;}
    if(!activeReel()){
      if(isReel(p)){clickedReel=p;clickedAt=Date.now();}
      return;
    }
    if(isReel(p) && p.replace(/\/$/,'')!==location.pathname.replace(/\/$/,'')){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  document.addEventListener('play',function(e){
    if(activeReel() && keptVideo && e.target.tagName==='VIDEO' && e.target!==keptVideo){try{e.target.pause();}catch(err){}}
  },true);

  function notify() {
    try { if (window.BestieBridge) window.BestieBridge.onRouteChange(location.href); } catch(e) {}
  }
  function ownProfileLink() {
    var markers = document.querySelectorAll('svg[aria-label="Profile"], img[alt="Profile"], a[aria-label="Profile"], [role="link"][aria-label="Profile"]');
    for (var i=0;i<markers.length;i++) {
      var a = markers[i].closest('a[href]');
      if (a && /^\/[A-Za-z0-9_.]+\/?$/.test(a.getAttribute('href') || '') && a.getAttribute('href') !== '/') return a;
    }
    var links = document.querySelectorAll('nav a[href], [role="navigation"] a[href]');
    for (var j=0;j<links.length;j++) {
      var link=links[j], path=link.getAttribute('href') || '';
      if (!/^\/[A-Za-z0-9_.]+\/?$/.test(path) || /^\/(explore|reels|direct|accounts)\/?$/.test(path)) continue;
      if ((link.textContent || '').trim().toLowerCase() === 'profile' || link.querySelector('img[alt*="profile picture"]')) return link;
    }
    return null;
  }
  function navOnly() {
    var a=ownProfileLink();
    if (a) profilePath=a.getAttribute('href');
    if (!style || !style.isConnected) {
      style=document.createElement('style');style.id='bestie-shell-style';
      // The icon footer lives in the same page and inherits its theme.
      // Hide global navigation, not inbox lists, profile tabs, comments or content.
      style.textContent='html.bestie-single-reel,html.bestie-single-reel body{overflow:hidden!important;overscroll-behavior:none!important}'+
        'html.bestie-single-reel [data-bestie-next-reel]{display:none!important}'+
        'nav:has(a[href="/"]),[role="navigation"]:has(a[href="/"]),'+
        'nav:has(a[href="/explore/"]),[role="navigation"]:has(a[href="/explore/"]),'+
        'a[href="/"],a[href="/explore/"],a[href="/explore"],a[href="/reels/"],a[href="/reels"]{display:none!important}'+
        'html.bestie-has-tabs{scroll-padding-bottom:calc(56px + env(safe-area-inset-bottom,0px))}'+
        'html.bestie-has-tabs body{padding-bottom:calc(56px + env(safe-area-inset-bottom,0px))!important;box-sizing:border-box}'+
        '#bestie-tabs{position:fixed!important;inset:auto 0 0 0!important;height:56px!important;padding:0 0 env(safe-area-inset-bottom,0px)!important;box-sizing:content-box!important;display:flex!important;align-items:center!important;justify-content:space-around!important;background:var(--bestie-bg,#fff)!important;color:var(--bestie-fg,#111)!important;border:0!important;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent)!important;z-index:2147483645!important;margin:0!important;box-shadow:none!important;}'+
        '#bestie-tabs[hidden],#bestie-tabs.bestie-keyboard{display:none!important}'+
        '#bestie-tabs button{all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:64px;height:44px;cursor:pointer;color:inherit;border-radius:8px;-webkit-tap-highlight-color:transparent}'+
        '#bestie-tabs button:focus-visible{outline:2px solid currentColor;outline-offset:-3px}'+
        '#bestie-tabs button[aria-current="page"] svg{stroke-width:2.4}'+
        '#bestie-tabs button svg{width:24px;height:24px;display:block;pointer-events:none}'+
        '#bestie-status{position:absolute;bottom:64px;left:16px;right:16px;padding:12px;border-radius:8px;background:var(--bestie-bg);color:var(--bestie-fg);font:13px sans-serif;border:1px solid currentColor}';
      (document.head || document.documentElement).appendChild(style);
    }
    // Some mobile builds use plain divs for global navigation.
    document.querySelectorAll('a[href="/"]').forEach(function (home) {
      var node=home.parentElement;
      for (var depth=0; node && depth<4; depth++,node=node.parentElement) {
        if (node===document.body || node===document.documentElement ||
            node.matches('main,article,[role="main"]') || node.querySelector('main,article,[role="main"]')) break;
        if (node.querySelector('a[href="/explore/"]') && node.querySelector('a[href^="/direct/"]')) {
          node.style.setProperty('display','none','important');break;
        }
      }
    });
    // Fallback for WebViews without :has(). This is a tiny navigation-only query.
    document.querySelectorAll('nav, [role="navigation"]').forEach(function (nav) {
      if (nav.querySelector('a[href="/"],a[href="/explore/"],a[href="/reels/"]')) nav.style.setProperty('display','none','important');
    });
    renderFooter();
    guardReel();
  }
  function schedule() {
    if (timer || !document || document.hidden) return;
    timer=setTimeout(function(){timer=null;navOnly();},350);
  }
  B.openProfile=function() {
    var configured=window.__BESTIE_PROFILE_USERNAME || '';
    if(/^[A-Za-z0-9_.]{1,30}$/.test(configured)) {location.assign('/'+configured+'/');return true;}
    var a=ownProfileLink();
    if (a) { a.click(); return true; }
    if (profilePath) { location.assign(profilePath); return true; }
    return false;
  };
  B.openActivity=function() {
    var markers=document.querySelectorAll('[aria-label="Notifications"], [aria-label="Activity"]');
    for(var i=0;i<markers.length;i++) {
      if(footer && footer.contains(markers[i]))continue;
      var target=markers[i].closest('a,button,[role="button"],[role="link"]');
      if(target) { target.click(); return true; }
    }
    var a=document.querySelector('a[href="/accounts/activity/"],a[href="/notifications/"]');
    if(a) {a.click();return true;}
    return false;
  };
  B.update=function() {}; // Old rules/settings no longer re-enable filtering.
  ['pushState','replaceState'].forEach(function(name){var orig=history[name];history[name]=function(){var next=arguments[2];if(next && activeReel()){try{var dest=new URL(next,location.href).pathname;if(isReel(dest)&&dest.replace(/\/$/,'')!==location.pathname.replace(/\/$/,''))return;}catch(e){}}var r=orig.apply(this,arguments);notify();schedule();return r;};});
  window.addEventListener('popstate',function(){notify();schedule();});
  function start(){navOnly();new MutationObserver(function(ms){
    if(ms.some(function(m){return m.target!==style && !(footer && footer.contains(m.target)) && (m.addedNodes.length>0 || m.removedNodes.length>0);})) schedule();
  }).observe(document.documentElement,{childList:true,subtree:true});notify();}
  document.addEventListener('focusin',keyboardState);
  document.addEventListener('focusout',function(){setTimeout(keyboardState,0);});
  if(window.visualViewport)window.visualViewport.addEventListener('resize',keyboardState);
  if(window.matchMedia)window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',matchTheme);
  if(document.documentElement)start();else document.addEventListener('DOMContentLoaded',start);
})();
