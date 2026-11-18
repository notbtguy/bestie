/* Bestie lightweight shell. No feed filters, video locks, body scans or attribute observers. */
(function () {
  'use strict';
  if (window.__bestie && window.__bestie.shell) return;
  var B = window.__bestie = {shell:true, installed:true};
  var profilePath = '';
  var style = null;
  var timer = null;
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
      // Hide global navigation, not inbox lists, profile tabs, comments or content.
      style.textContent='nav:has(a[href="/"]),[role="navigation"]:has(a[href="/"]),'+
        'nav:has(a[href="/explore/"]),[role="navigation"]:has(a[href="/explore/"]),'+
        'a[href="/"],a[href="/explore/"],a[href="/explore"],a[href="/reels/"],a[href="/reels"]{display:none!important}';
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
    if(ms.some(function(m){return m.target!==style && m.addedNodes.length>0;})) schedule();
  }).observe(document.documentElement,{childList:true,subtree:true});notify();}
  if(document.documentElement)start();else document.addEventListener('DOMContentLoaded',start);
})();
