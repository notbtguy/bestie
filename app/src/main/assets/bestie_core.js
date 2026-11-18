/* Bestie lightweight shell. No feed filters, video locks, body scans or attribute observers. */
(function () {
  'use strict';
  if (window.__bestie && window.__bestie.shell) return;
  var B = window.__bestie = {shell:true, installed:true};
  var profilePath = '';
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
            status.textContent='Profile is still loading. Try again in a moment.';
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
      style.textContent='nav:has(a[href="/"]),[role="navigation"]:has(a[href="/"]),'+
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
  }
  function schedule() {
    if (timer || !document || document.hidden) return;
    timer=setTimeout(function(){timer=null;navOnly();},350);
  }
  B.openProfile=function() {
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
  ['pushState','replaceState'].forEach(function(name){var orig=history[name];history[name]=function(){var r=orig.apply(this,arguments);notify();schedule();return r;};});
  window.addEventListener('popstate',function(){notify();schedule();});
  function start(){navOnly();new MutationObserver(function(ms){
    if(ms.some(function(m){return m.target!==style && !(footer && footer.contains(m.target)) && m.addedNodes.length>0;})) schedule();
  }).observe(document.documentElement,{childList:true,subtree:true});notify();}
  document.addEventListener('focusin',keyboardState);
  document.addEventListener('focusout',function(){setTimeout(keyboardState,0);});
  if(window.visualViewport)window.visualViewport.addEventListener('resize',keyboardState);
  if(window.matchMedia)window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',matchTheme);
  if(document.documentElement)start();else document.addEventListener('DOMContentLoaded',start);
})();
