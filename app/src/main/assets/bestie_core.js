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
  var lastCss = '';
  var matched = {};
  var overlay = null;
  var panel = null;
  var lastPath = '';
  var lastHideSig = '';
  var lastLockAt = 0;
  var hiddenEls = (typeof WeakSet !== 'undefined') ? new WeakSet() : null;
  var LOCK_THROTTLE_MS = 700;
  var scoped = [];
  var scopeRoute = '';
  var trayCount = 0;
  var inlineTotal = 0;
  var DEFAULT_TRAYS = ['[aria-label="Stories"]', '[aria-label="Stories tray"]',
    '[role="menu"][aria-label*="tories"]', 'ul:has(a[href^="/stories/"])',
    '[role="list"]:has(a[href^="/stories/"])'];
  var DEFAULT_EXPLORE = ['main [role="grid"]', '[role="main"] [role="grid"]',
    'main a[href^="/p/"]', 'main a[href^="/reel/"]', 'main a[href^="/reels/"]',
    '[role="main"] a[href^="/p/"]', '[role="main"] a[href^="/reel/"]', 'main video'];
  function query(sels, root) {
    var result = [];
    (sels || []).forEach(function (sel) {
      try { (root || document).querySelectorAll(sel).forEach(function (el) {
        if (result.indexOf(el) < 0) result.push(el);
      }); } catch (e) {}
    });
    return result;
  }
  function restoreScoped() {
    scoped.forEach(function (item) {
      if (item.value) item.el.style.setProperty('display', item.value, item.priority);
      else item.el.style.removeProperty('display');
      item.el.removeAttribute('data-bestie-scoped');
    });
    scoped = [];
  }
  function scopeHide(el, layer) {
    if (!el || el === document.body || el === document.documentElement) return;
    if (!scoped.some(function (item) { return item.el === el; })) {
      scoped.push({el: el, value: el.style.getPropertyValue('display'),
        priority: el.style.getPropertyPriority('display')});
      el.setAttribute('data-bestie-scoped', layer);
      inlineTotal++;
    }
    if (!el.hasAttribute('data-bestie-scoped')) el.setAttribute('data-bestie-scoped', layer);
    if (el.style.getPropertyValue('display') !== 'none' || el.style.getPropertyPriority('display') !== 'important')
      el.style.setProperty('display', 'none', 'important');
  }
  function releaseProtected(anchors) {
    scoped = scoped.filter(function (item) {
      if (!intersects(item.el, anchors)) return true;
      if (item.value) item.el.style.setProperty('display', item.value, item.priority);
      else item.el.style.removeProperty('display');
      item.el.removeAttribute('data-bestie-scoped');
      return false;
    });
  }
  function intersects(el, anchors) {
    return anchors.some(function (a) { return el === a || el.contains(a) || a.contains(el); });
  }
  // Prune siblings only along proven keep-paths. Never move or clone the story UI.
  function prune(main, anchors, layer) {
    var keep = anchors.concat(query(['header','nav','[role="navigation"]','[role="banner"]',
      '[role="dialog"]','[role="listbox"]'], main));
    anchors.forEach(function (anchor) {
      var node = anchor;
      while (node && node !== main && main.contains(node)) {
        var parent = node.parentElement;
        if (!parent) break;
        Array.prototype.forEach.call(parent.children, function (sibling) {
          if (!intersects(sibling, keep) && !/^(SCRIPT|STYLE|LINK)$/.test(sibling.tagName))
            scopeHide(sibling, layer);
        });
        node = parent;
      }
    });
  }
  function applyExplore() {
    var on = /^\/explore(?:\/|$)/.test(location.pathname);
    document.documentElement.classList.toggle('bestie-explore', on);
    if (!on) return;
    var search = query(['input[placeholder*="earch"]','input[aria-label*="earch"]',
      'input[type="search"]', '[role="search"]', 'button[aria-label="Search"]',
      '[role="button"][aria-label="Search"]', 'a[href="/explore/search/"]']);
    query(['button', '[role="button"]']).forEach(function (el) {
      if ((el.textContent || '').trim().toLowerCase() === 'search') search.push(el);
    });
    releaseProtected(search);
    // While typing, preserve unknown result layouts. Hide media tiles, not profile results.
    var searching = /\/explore\/search/.test(location.pathname) || search.some(function (el) {
      return (el.value || '').trim().length > 0;
    });
    var mains = query(['main','[role="main"]']);
    mains.forEach(function (main) {
      var anchors = search.filter(function (el) { return main.contains(el); });
      if (!searching) {
        anchors = anchors.concat(query(['[role="listbox"]', '[role="dialog"]'], main));
        if (anchors.length) prune(main, anchors, 'explore');
        else if (!search.some(function (el) { return main.contains(el); })) scopeHide(main, 'explore');
      }
    });
    var tiles = query(cfg.exploreFeedSelectors || DEFAULT_EXPLORE);
    tiles.forEach(function (el) {
      if (!intersects(el, search) && !el.closest('[role="listbox"], [role="dialog"]')) scopeHide(el, 'explore');
    });
    matched['[explore media matches]'] = tiles.length;
    matched['[search active]'] = searching;
  }

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

  // Suggestion rows on home are plain divs (not articles); we find them by their header text.
  // Override with "homeFeedTextHeaders" in rules.json. Compared lowercase.
  var DEFAULT_HOME_HEADERS = [
    'suggestions for you', 'suggested for you', 'suggested posts',
    'people you may know', 'who to follow', 'you might like'
  ];

  // Hide an element for good: inline style (survives class wipes and CSP), a marker
  // attribute (lets the MutationObserver ignore churn inside hidden subtrees) and the WeakSet.
  function markHidden(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.style.getPropertyValue('display') !== 'none') inlineTotal++;
    el.style.setProperty('display', 'none', 'important');
    try { el.setAttribute('data-bestie-hidden', '1'); } catch (e) {}
    if (hiddenEls) hiddenEls.add(el);
  }

  // ---- Layer 2: CSS (hides instantly, before JS finds anything) ----
  function applyCss() {
    var sels = allSelectors();
    var css = '';
    for (var i = 0; i < sels.length; i++) css += sels[i] + '{display:none !important;}\n';
    if (cfg.blockReels) {
      // Hide the whole list item that wraps the Reels link, when the browser supports :has().
      css += 'li:has(> a[href="/reels/"]), div[role="listitem"]:has(> a[href="/reels/"]){display:none !important;}\n';
    }
    css += '[data-bestie-hidden], [data-bestie-scoped]{display:none !important;}\n';
    // Rewriting the sheet forces a full-document style recalc - only write on change.
    if (css === lastCss && styleEl && styleEl.parentNode) return;
    lastCss = css;
    if (!styleEl || !styleEl.parentNode) {
      // Recreate if Instagram's SPA removed our <style> from <head>.
      styleEl = document.createElement('style');
      styleEl.id = 'bestie-style';
      (document.head || document.documentElement).appendChild(styleEl);
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
    // Do not assume an equal count means the same nodes after hydration.
    var sigStr = sig.join(',');
    // Equal counts do not mean equal nodes after React replaces a subtree.
    lastHideSig = sigStr;
    for (i = 0; i < sels.length; i++) {
      try { found = document.querySelectorAll(sels[i]); } catch (e) { continue; }
      for (j = 0; j < found.length; j++) {
        var el = found[j];
        if (hiddenEls && hiddenEls.has(el) && el.style.getPropertyValue('display') === 'none') continue;
        markHidden(el);
        var parent = el.closest && el.closest('li, [role="listitem"]');
        if (parent && parent !== document.body && !(hiddenEls && hiddenEls.has(parent))) markHidden(parent);
      }
    }
  }

  // Anything that belongs to the stories tray or the app chrome. A suggestion unit must never
  // contain one of these: if it did, hiding it would hide stories (the v1.2.0 regression).
  var PROTECT_SEL = 'a[href^="/stories/"], [role="menu"], [role="menuitem"], [role="banner"], ' +
    '[role="navigation"], [aria-label*="tories"], [aria-label*="tory"], header, nav, main, [role="main"]';
  var MAX_CLIMB = 10;

  function isProtected(node) {
    try {
      if (node.matches && node.matches('[role="menu"], [role="menuitem"], [aria-label*="tories"], main, [role="main"], header, nav, [role="banner"], [role="navigation"]')) return true;
      return !!node.querySelector(PROTECT_SEL);
    } catch (e) { return true; }
  }

  // Largest ancestor of el (bounded climb) that contains no protected element:
  // the whole suggestion unit, never the tray, never the page. Under-hide when unsure.
  function unitRoot(el) {
    var node = el;
    var p = el.parentElement;
    var depth = 0;
    while (p && p !== document.body && p !== document.documentElement && depth < MAX_CLIMB) {
      if (isProtected(p)) break;
      node = p;
      if (p.querySelector('button, a, [role="button"]')) break;
      p = p.parentElement;
      depth++;
    }
    return node;
  }

  // "Suggestions for you" / follow-suggestion rows: leaf spans whose text matches a known header.
  function hideSuggestionUnits() {
    var headers = (cfg.homeFeedTextHeaders && cfg.homeFeedTextHeaders.length)
      ? cfg.homeFeedTextHeaders : DEFAULT_HOME_HEADERS;
    var lowered = [];
    for (var h = 0; h < headers.length; h++) lowered.push(String(headers[h]).toLowerCase());
    var spans;
    try { spans = document.querySelectorAll('main span, [role="main"] span'); } catch (e) { return 0; }
    var n = 0;
    for (var i = 0; i < spans.length; i++) {
      var el = spans[i];
      if (el.children.length > 0) continue; // headers are leaf spans
      var t = (el.textContent || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '').toLowerCase();
      if (!t || t.length > 40) continue;
      for (var k = 0; k < lowered.length; k++) {
        if (t === lowered[k]) {
          var unit = unitRoot(el);
          if (unit && unit !== el && !isProtected(unit) && !(hiddenEls && hiddenEls.has(unit))) { scopeHide(unit, 'home-suggestions'); n++; }
          break;
        }
      }
    }
    return n;
  }

  // Stories-only home: hide feed posts, suggestion rows and ads on the home route,
  // keep the stories tray. JS layer (inline styles) backs the CSS layer, which alone
  // could be defeated when Instagram rewrites the <html> class during hydration.
  function applyHome() {
    var on = !!cfg.storiesOnlyHome && isHome(location.pathname);
    var de = document.documentElement;
    if (on) {
      if (!de.classList.contains('bestie-home')) de.classList.add('bestie-home');
      var trays = query(cfg.homeTraySelectors || DEFAULT_TRAYS);
      trayCount = trays.length;
      releaseProtected(trays);
      query(['main', '[role="main"]']).forEach(function (main) {
        var anchors = trays.filter(function (el) { return main.contains(el); });
        if (anchors.length) prune(main, anchors, 'home-structure');
      });
      var posts = 0;
      var hf = cfg.homeFeedSelectors || ['article'];
      for (var i = 0; i < hf.length; i++) {
        var found;
        try { found = document.querySelectorAll(hf[i]); } catch (e) { continue; }
        for (var j = 0; j < found.length; j++) {
          if (isProtected(found[j]) || intersects(found[j], trays)) continue;
          scopeHide(found[j], 'home-post');
          posts++;
        }
      }
      matched['[home feed posts hidden]'] = posts;
      matched['[home suggestion rows hidden]'] = hideSuggestionUnits();
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
    return best || (vids.length ? vids[0] : null); // zero-size layout must not hide the only reel
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
      scopeHide(node, 'next-reel');
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
    var lines = ['Bestie ' + (cfg.appVersion || '?') + ' (' + (cfg.appVersionCode || '?') + ') | rules: ' + (cfg.rulesStatus || '?') + ' | v' + cfg.version,
      'path: ' + location.pathname + ' | home: ' + isHome(location.pathname) +
      ' | singleReel: ' + isSingleReel(location.pathname) +
      ' | blocked: ' + isBlockedPath(location.pathname)];
    lines.push('CSS: ' + (!!(styleEl && styleEl.isConnected && styleEl.sheet)) +
      ' | inline writes total: ' + inlineTotal);
    lines.push('hidden now: ' + document.querySelectorAll('[data-bestie-hidden], [data-bestie-scoped]').length +
      ' | scoped: ' + scoped.length + ' | trays: ' + trayCount);
    lines.push('storiesOnlyHome: ' + !!cfg.storiesOnlyHome + ' | hideStories: ' + !!cfg.hideStories);
    var layers = {};
    scoped.forEach(function (item) { var key = item.el.getAttribute('data-bestie-scoped'); layers[key] = (layers[key] || 0) + 1; });
    lines.push('layers: ' + JSON.stringify(layers));
    for (var k in matched) lines.push(k + ' => ' + matched[k]);
    panel.textContent = lines.join('\n');
    bridge('onDebug', JSON.stringify(matched));
  }

  function apply() {
    if (scopeRoute !== location.pathname) {
      restoreScoped();
      scopeRoute = location.pathname;
      trayCount = 0;
    }
    applyCss();
    matched = {};
    if (cfg.blockReels || cfg.hideStories) hideParents();
    applyHome();
    applyExplore();
    var p = location.pathname;
    if (isBlockedPath(p)) {
      location.replace('/');
      return;
    }
    if (cfg.disableSwipe && isSingleReel(p)) lockSingleReel(); else unlockReel();
    renderDebug();
  }

  function scheduleApply() {
    if (!document || document.hidden) return; // no DOM work while the page is in the background
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
      if (!document || document.hidden) return;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (styleEl && !styleEl.isConnected) { scheduleApply(); return; }
        if (m.addedNodes.length === 0) continue;
        // Churn inside a subtree we already hid (the hidden feed keeps rendering in the
        // background) must not re-trigger passes - otherwise apply() runs forever on home.
        var t = m.target;
        if (t === panel || t === styleEl) continue;
        if (t && t.nodeType === 1 && t.closest && t.closest('[data-bestie-hidden], [data-bestie-scoped]')) {
          // A loading feed wrapper may hydrate into a tray. Recheck that case, not feed churn.
          if (!query(cfg.homeTraySelectors || DEFAULT_TRAYS, t).length) continue;
        }
        scheduleApply();
        return;
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    // Instagram rewrites the <html> class during hydration, which used to strip our
    // bestie-home scope class without any childList mutation to wake us. Watch it directly.
    var rootMo = new MutationObserver(function () {
      if (cfg.storiesOnlyHome && isHome(location.pathname) &&
          !document.documentElement.classList.contains('bestie-home')) {
        scheduleApply();
      }
    });
    rootMo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    // Reassert only our own inline markers if hydration strips style/marker attributes.
    var scopedMo = new MutationObserver(function (mutations) {
      if (mutations.some(function (m) {
        return (m.target.hasAttribute('data-bestie-scoped') || (hiddenEls && hiddenEls.has(m.target)) || scoped.some(function (item) { return item.el === m.target; })) &&
          m.target.style.getPropertyValue('display') !== 'none';
      })) scheduleApply();
    });
    scopedMo.observe(document.documentElement, {attributes:true, subtree:true, attributeFilter:['style']});
    document.addEventListener('input', function (e) {
      if (/^\/explore(?:\/|$)/.test(location.pathname) && e.target.tagName === 'INPUT') {
        restoreScoped(); scheduleApply();
      }
    }, true);
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
    restoreScoped();
    cfg = newCfg || cfg;
    window.__BESTIE_CONFIG = cfg;
    lastHideSig = '';
    if (hiddenEls) hiddenEls = new WeakSet();
    scheduleApply();
  };
})();
