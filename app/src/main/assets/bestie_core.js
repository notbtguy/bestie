/* Bestie core script. Injected at document start (or on page finish on old WebViews).
   Reads window.__BESTIE_CONFIG (built by ScriptBuilder). Safe to run more than once:
   a second run just updates the config. */
(function () {
  'use strict';
  if (window.__bestie && window.__bestie.installed) {
    window.__bestie.update(window.__BESTIE_CONFIG);
    return;
  }

  var cfg = window.__BESTIE_CONFIG || {};
  var B = { installed: true };
  window.__bestie = B;
  var timer = null;
  var styleEl = null;
  var matched = {};
  var overlay = null;
  var panel = null;
  var lastPath = '';
  var lastHideSig = '';
  var lastLockAt = 0;
  var hiddenEls = (typeof WeakSet !== 'undefined') ? new WeakSet() : null;
  var LOCK_THROTTLE_MS = 700;

  function bridge(name, arg) {
    try {
      if (window.BestieBridge && window.BestieBridge[name]) window.BestieBridge[name](arg);
    } catch (e) {}
  }

  function norm(p) {
    p = p || '/';
    return p.charAt(p.length - 1) === '/' ? p : p + '/';
  }

  function isHome(p) {
    return p === '/' || p === '';
  }

  function isAllowedPath(p) {
    var pats = cfg.allowedPathPatterns || [];
    for (var i = 0; i < pats.length; i++) {
      try { if (new RegExp(pats[i]).test(norm(p))) return true; } catch (e) {}
    }
    return false;
  }

  function isBlockedPath(p) {
    if (!cfg.blockReels) return false;
    if (isAllowedPath(p)) return false;
    var b = cfg.blockedExactPaths || [];
    for (var i = 0; i < b.length; i++) if (norm(b[i]) === norm(p)) return true;
    return false;
  }

  // Single reel route: /reel/<id>/ or /reels/<id>/ (NOT the bare /reels/ feed).
  function isSingleReel(p) {
    return /^\/reels?\/[^\/]+\/?$/.test(p) && isAllowedPath(p);
  }

  function allSelectors() {
    var s = (cfg.hideSelectors || []).slice();
    if (cfg.hideStories) s = s.concat(cfg.storySelectors || []).concat(DEFAULT_STORY_SELECTORS);
    return s;
  }
  // Best-effort defaults; override with "storySelectors" in rules.json.
  var DEFAULT_STORY_SELECTORS = ['div[aria-label^="Stories"]', 'div[role="menu"][aria-label*="tories"]'];

  // ---- Layer 2: CSS (hides instantly, before JS finds anything) ----
  function applyCss() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'bestie-style';
      (document.head || document.documentElement).appendChild(styleEl);
    }
    var sels = allSelectors();
    var css = '';
    for (var i = 0; i < sels.length; i++) css += sels[i] + '{display:none !important;}\n';
    if (cfg.blockReels) {
      // Hide the whole list item that wraps the Reels link, when the browser supports :has().
      css += 'li:has(> a[href="/reels/"]), div[role="listitem"]:has(> a[href="/reels/"]){display:none !important;}\n';
    }
    if (cfg.storiesOnlyHome) {
      // Home feed posts (regular + suggested) live in <article>; the stories tray does not.
      // Scoped to the home route by the bestie-home class, toggled in apply().
      var hf = cfg.homeFeedSelectors || ['article'];
      for (var h = 0; h < hf.length; h++) {
        css += 'html.bestie-home ' + hf[h] + '{display:none !important;}\n';
      }
    }
    styleEl.textContent = css;
  }

  // ---- Layer 3: JS ----
  function hideParents() {
    matched = {};
    var sels = allSelectors();
    var sig = [];
    var found, i, j;
    for (i = 0; i < sels.length; i++) {
      try { found = document.querySelectorAll(sels[i]); } catch (e) { matched[sels[i]] = 'invalid'; continue; }
      matched[sels[i]] = found.length;
      sig.push(found.length);
    }
    // Same page state as last run: skip the style writes (they force style recalc).
    var sigStr = sig.join(',');
    if (sigStr === lastHideSig) return;
    lastHideSig = sigStr;
    for (i = 0; i < sels.length; i++) {
      try { found = document.querySelectorAll(sels[i]); } catch (e) { continue; }
      for (j = 0; j < found.length; j++) {
        var el = found[j];
        if (hiddenEls && hiddenEls.has(el)) continue;
        el.style.setProperty('display', 'none', 'important');
        var parent = el.closest && el.closest('li, [role="listitem"]');
        if (parent && parent !== document.body) parent.style.setProperty('display', 'none', 'important');
        if (hiddenEls) { hiddenEls.add(el); if (parent) hiddenEls.add(parent); }
      }
    }
  }

  // Stories-only home: hide feed posts on the home route, keep the stories tray.
  function applyHome() {
    var on = !!cfg.storiesOnlyHome && isHome(location.pathname);
    var de = document.documentElement;
    if (on) {
      if (!de.classList.contains('bestie-home')) de.classList.add('bestie-home');
      var arts = document.querySelectorAll('article');
      matched['[home feed posts hidden]'] = arts.length;
    } else if (de.classList.contains('bestie-home')) {
      de.classList.remove('bestie-home');
    }
  }

  function findScrollers() {
    var res = [];
    var nodes = document.querySelectorAll('main, main *, [role="main"], [role="main"] *');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var cs = window.getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 10) res.push(el);
      else if (cs.scrollSnapType && cs.scrollSnapType !== 'none') res.push(el);
    }
    return res;
  }

  function mostVisibleVideo() {
    var vids = document.querySelectorAll('video');
    var best = null, bestArea = 0;
    for (var i = 0; i < vids.length; i++) {
      var r = vids[i].getBoundingClientRect();
      var w = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
      var h = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      if (w * h > bestArea) { bestArea = w * h; best = vids[i]; }
    }
    return best;
  }

  function lockSingleReel() {
    // This walks big parts of the DOM; throttle so it cannot run on every mutation batch.
    var now = Date.now();
    if (now - lastLockAt < LOCK_THROTTLE_MS) return;
    lastLockAt = now;
    var scrollers = findScrollers();
    matched['[scroll containers locked]'] = scrollers.length;
    for (var i = 0; i < scrollers.length; i++) {
      scrollers[i].style.setProperty('overflow', 'hidden', 'important');
      scrollers[i].style.setProperty('scroll-snap-type', 'none', 'important');
    }
    var keep = mostVisibleVideo();
    var vids = document.querySelectorAll('video');
    var removed = 0;
    for (var v = 0; v < vids.length; v++) {
      var video = vids[v];
      if (video === keep) {
        video.loop = false; // stop auto-looping / chaining
        if (!video.__bestieEnd) {
          video.__bestieEnd = true;
          video.addEventListener('ended', showEndCard);
        }
        continue;
      }
      // Hide the preloaded "next reel": walk up to a block that does not contain the kept video.
      var node = video;
      while (node.parentElement && !node.parentElement.contains(keep) && node.parentElement !== document.body) {
        node = node.parentElement;
      }
      node.style.setProperty('display', 'none', 'important');
      try { video.pause(); } catch (e) {}
      removed++;
    }
    matched['[next reels hidden]'] = removed;
  }

  function unlockReel() {
    hideEndCard();
  }

  function showEndCard() {
    if (!isSingleReel(location.pathname) || !cfg.disableSwipe) return;
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;' +
      'background:rgba(20,20,20,0.94);color:#fff;padding:20px 22px;border-radius:16px;text-align:center;' +
      'font:15px sans-serif;max-width:80%;box-shadow:0 4px 24px rgba(0,0,0,0.5);';
    var t = document.createElement('div');
    t.textContent = "That's the end of this reel. Back to what matters.";
    t.style.marginBottom = '14px';
    var b = document.createElement('button');
    b.textContent = 'Go back';
    b.style.cssText = 'background:#7C3AED;color:#fff;border:0;border-radius:10px;padding:10px 20px;font-size:15px;';
    b.addEventListener('click', function () { hideEndCard(); history.back(); });
    overlay.appendChild(t);
    overlay.appendChild(b);
    document.body.appendChild(overlay);
  }

  function hideEndCard() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
  }

  // Block vertical swipe / wheel on single reel routes (capture, non-passive).
  function blockMove(e) {
    if (!cfg.disableSwipe || !isSingleReel(location.pathname)) return;
    var t = e.target;
    // Let comments / dialogs / text inputs scroll normally.
    if (t && t.closest && t.closest('[role="dialog"], textarea, input, [contenteditable="true"]')) return;
    if (e.cancelable) e.preventDefault();
  }
  document.addEventListener('touchmove', blockMove, { capture: true, passive: false });
  document.addEventListener('wheel', blockMove, { capture: true, passive: false });
  document.addEventListener('keydown', function (e) {
    if (cfg.disableSwipe && isSingleReel(location.pathname) &&
        (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'PageDown' || e.key === 'PageUp')) {
      var t = e.target;
      if (t && t.closest && t.closest('textarea, input, [contenteditable="true"]')) return;
      e.preventDefault();
    }
  }, true);

  function renderDebug() {
    if (!cfg.debug) {
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      panel = null;
      return;
    }
    if (!document.body) return;
    if (!panel) {
      panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:35%;overflow:auto;z-index:2147483646;' +
        'background:rgba(0,0,0,0.82);color:#9f9;font:10px monospace;padding:6px;pointer-events:none;white-space:pre-wrap;';
      document.body.appendChild(panel);
    }
    var lines = ['Bestie debug | rules: ' + (cfg.rulesStatus || '?') + ' | v' + cfg.version,
      'path: ' + location.pathname + ' | home: ' + isHome(location.pathname) +
      ' | singleReel: ' + isSingleReel(location.pathname) +
      ' | blocked: ' + isBlockedPath(location.pathname)];
    for (var k in matched) lines.push(k + ' => ' + matched[k]);
    panel.textContent = lines.join('\n');
    bridge('onDebug', JSON.stringify(matched));
  }

  function apply() {
    applyCss();
    matched = {};
    if (cfg.blockReels || cfg.hideStories) hideParents();
    applyHome();
    var p = location.pathname;
    if (isBlockedPath(p)) {
      location.replace('/');
      return;
    }
    if (cfg.disableSwipe && isSingleReel(p)) lockSingleReel(); else unlockReel();
    renderDebug();
  }

  function scheduleApply() {
    if (document.hidden) return; // no DOM work while the page is in the background
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; apply(); }, 100); // debounce 100 ms
  }

  function onRoute() {
    var p = location.pathname;
    if (p !== lastPath) {
      lastPath = p;
      lastHideSig = '';
      hideEndCard();
      bridge('onRouteChange', location.href);
      if (isBlockedPath(p)) { location.replace('/'); return; }
    }
    scheduleApply();
  }

  // Instagram is a single-page app: hook history changes.
  ['pushState', 'replaceState'].forEach(function (name) {
    var orig = history[name];
    history[name] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(onRoute, 0);
      return r;
    };
  });
  window.addEventListener('popstate', onRoute);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) scheduleApply();
  });

  function startObserver() {
    var mo = new MutationObserver(function (mutations) {
      // Most Instagram mutations are attribute-free DOM churn; skip runs while hidden.
      if (document.hidden) return;
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].addedNodes.length > 0) { scheduleApply(); return; }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    onRoute();
  }
  if (document.documentElement) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver);

  // Kept for compatibility: used to be wired to the removed bottom bar "Profile" button.
  B.openProfile = function () {
    var imgs = document.querySelectorAll('a[href^="/"] img[alt*="profile picture"], a[href^="/"] img[alt*="rofile"]');
    for (var i = imgs.length - 1; i >= 0; i--) {
      var a = imgs[i].closest('a');
      if (a) { a.click(); return true; }
    }
    var links = document.querySelectorAll('nav a[href], [role="navigation"] a[href]');
    if (links.length) { links[links.length - 1].click(); return true; }
    return false;
  };

  B.update = function (newCfg) {
    cfg = newCfg || cfg;
    window.__BESTIE_CONFIG = cfg;
    lastHideSig = '';
    if (hiddenEls) hiddenEls = new WeakSet();
    scheduleApply();
  };
})();
