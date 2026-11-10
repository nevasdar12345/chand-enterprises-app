/* Chand Enterprises - Hero Motion engine.
   Builds the effect layers for each of the 12 presets. Used by BOTH the live homepage hero
   and the Developer > Hero Motion Studio preview, so what you preview is what customers see.
   No dependencies. Respects prefers-reduced-motion (handled in hero-motion.css). */
(function () {
  'use strict';

  var PALETTE_DEFAULT = 'glacier-awakening';

  /* L = layers, P = particles [kind, base count], hit = when (fraction of the loop) the bottle "lands" */
  var SPEC = {
    'ice-rise':          { L: ['glow', 'ring', 'cubes', 'splash', 'crown'],                         P: [['bubble', 10]], hit: 0.34 },
    'ice-orbit':         { L: ['glow', 'ring', 'orbit'],                                            P: [['ice', 6]] },
    'bottle-pop':        { L: ['glow', 'ring', 'splash'],                                           P: [['bubble', 14]], hit: 0.26 },
    'wave-reveal':       { L: ['glow', 'wave', 'sweep'],                                            P: [['bubble', 9]] },
    'neon-showcase':     { L: ['glow', 'ped', 'beam'],                                              P: [['neon', 12]] },
    'cinematic-combo':   { L: ['glow', 'ring', 'cubes', 'splash', 'crown', 'flare'],                P: [['bubble', 8], ['ice', 4]], hit: 0.2 },
    'glacier-awakening': { L: ['glow', 'ring', 'shards'],                                           P: [['dust', 16]] },
    'floating-luxury':   { L: ['glow', 'shadow'],                                                   P: [['dust', 14]] },
    'liquid-infinity':   { L: ['glow', 'ribbon'],                                                   P: [['drop', 9]] },
    'neon-prestige':     { L: ['glow', 'plane', 'beam'],                                            P: [['neon', 10]] },
    'royal-gold':        { L: ['glow', 'spot', 'ped'],                                              P: [['spark', 22]] },
    'grand-cinematic':   { L: ['glow', 'spot', 'ring', 'ped', 'cubes', 'splash', 'crown', 'flare'], P: [['spark', 10], ['bubble', 7], ['ice', 4]], hit: 0.22 }
  };

  /* which layers sit in front of the product cards */
  var FRONT = { cubes: 1, splash: 1, crown: 1, flare: 1, sweep: 1, orbit: 1, shards: 1, ribbon: 1 };

  var PK = {
    bubble: { pa: 'ceBubble', s: [5, 13], y: [0, 40],   dx: [-34, 34], k: [0.7, 1.15] },
    ice:    { pa: 'ceIceP',   s: [6, 12], y: [0, 40],   dx: [-40, 40], k: [0.8, 1.2] },
    spark:  { pa: 'ceSpark',  s: [3, 7],  y: [0, 60],   dx: [-40, 40], k: [0.7, 1.2] },
    dust:   { pa: 'ceDust',   s: [2, 4],  y: [30, 270], dx: [-26, 26], k: [0.6, 1.1] },
    neon:   { pa: 'ceBubble', s: [3, 6],  y: [0, 60],   dx: [-30, 30], k: [0.8, 1.3] },
    drop:   { pa: 'ceDrop',   s: [5, 9],  y: [0, 50],   dx: [-50, 50], k: [0.8, 1.2] }
  };

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function px(n) { return Math.round(n * 10) / 10 + 'px'; }

  function particles(kind, count) {
    var c = PK[kind], out = '';
    for (var i = 0; i < count; i++) {
      out += '<i class="fx-p k-' + kind + '" style="--x:' + px(rnd(6, 300)) + ';--y:' + px(rnd(c.y[0], c.y[1])) +
        ';--s:' + px(rnd(c.s[0], c.s[1])) + ';--dx:' + px(rnd(c.dx[0], c.dx[1])) +
        ';--k:' + rnd(c.k[0], c.k[1]).toFixed(2) + ';--ds:' + rnd(0, 0.9).toFixed(2) + ';--pa:' + c.pa + '"></i>';
    }
    return out;
  }

  var BUILD = {
    glow:   function () { return '<i class="fx-glow"></i>'; },
    ring:   function () { return '<i class="fx-ring r1"></i><i class="fx-ring r2"></i>'; },
    plane:  function () { return '<div class="fx-plane"><i class="fx-ring n1"></i><i class="fx-ring n2"></i><i class="fx-ring n3"></i></div>'; },
    ped:    function () { return '<i class="fx-ped"></i>'; },
    beam:   function () { return '<i class="fx-beam"></i>'; },
    spot:   function () { return '<i class="fx-spot"></i>'; },
    shadow: function () { return '<i class="fx-shadow"></i>'; },
    wave:   function () { return '<i class="fx-wave w1"></i><i class="fx-wave w2"></i>'; },
    sweep:  function () { return '<i class="fx-sweep"></i>'; },
    flare:  function () { return '<i class="fx-flare"></i>'; },
    splash: function () { return '<i class="fx-rip a"></i><i class="fx-rip b"></i>'; },
    crown:  function () {
      var out = '';
      for (var i = 0; i < 9; i++) {
        var ang = (-165 + i * 18.75) * Math.PI / 180, r = rnd(70, 118);
        out += '<i class="fx-cd" style="--dx:' + px(Math.cos(ang) * r * 1.1) + ';--dy:' + px(Math.sin(ang) * r) + ';--s:' + px(rnd(5, 9)) + '"></i>';
      }
      return out;
    },
    cubes:  function () {
      var xs = [14, 62, 118, 196, 246, 280], out = '';
      for (var i = 0; i < xs.length; i++) {
        out += '<i class="fx-cube" style="--x:' + px(xs[i] + rnd(-8, 8)) + ';--y:' + px(rnd(8, 70)) + ';--s:' + px(rnd(16, 30)) +
          ';--r:' + Math.round(rnd(-35, 45)) + 'deg;--dl:' + (i * 0.012).toFixed(3) + '"></i>';
      }
      return out;
    },
    orbit:  function () {
      var out = '<div class="fx-orbit">';
      for (var i = 0; i < 5; i++) {
        out += '<div class="fx-ob" style="--ph:' + (i * 0.4).toFixed(2) + '"><div class="fx-ob2"><i class="fx-ocube" style="--s:' + px(rnd(15, 26)) + '"></i></div></div>';
      }
      return out + '</div>';
    },
    shards: function () {
      var S = [[18, 40, 30, 70, -18], [8, 150, 26, 58, 14], [30, 235, 34, 56, -30], [238, 28, 34, 72, 24],
               [262, 128, 28, 64, -12], [236, 222, 36, 60, 32], [120, -6, 40, 52, 6], [150, 262, 30, 44, -8]], out = '';
      for (var i = 0; i < S.length; i++) {
        var s = S[i];
        out += '<i class="fx-shard" style="--x:' + s[0] + 'px;--y:' + s[1] + 'px;--w:' + s[2] + 'px;--h:' + s[3] + 'px;--r:' + s[4] + 'deg;' +
          '--sx:' + px((s[0] - 155) * 1.7) + ';--sy:' + px((s[1] - 150) * 1.7) + ';--sr:' + Math.round(rnd(-150, 150)) + 'deg;--dl:' + (i * 0.015).toFixed(3) + '"></i>';
      }
      return out;
    },
    ribbon: function () {
      var d = 'M155 150C120 80 40 70 40 140C40 215 120 220 155 150C190 80 270 70 270 140C270 215 190 220 155 150Z';
      return '<svg class="fx-ribbon" viewBox="0 0 310 300" aria-hidden="true">' +
        '<path class="rb0" pathLength="100" d="' + d + '"/><path class="rb1" pathLength="100" d="' + d + '"/><path class="rb2" pathLength="100" d="' + d + '"/></svg>';
    }
  };


  /* ------------------------------------------------------------------
     Reduced-motion override (hero only).
     Several global CSS rules (style.css, the inline <style> in base.html, cex-styles) say
     "if the visitor's OS has Animation effects OFF, cancel every animation with !important".
     That also kills the hero. When IGNORE_REDUCED_MOTION is true, this removes/relaxes
     those rules for the hero only; every other element on the site still respects the setting.
     Set it to false to honour the visitor's setting everywhere, hero included.
     ------------------------------------------------------------------ */
  var IGNORE_REDUCED_MOTION = true;
  var motionRulesFixed = false;

  function allowReducedMotion() {
    if (motionRulesFixed || !IGNORE_REDUCED_MOTION) return;
    if (!window.matchMedia || !matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    motionRulesFixed = true;
    var EXCLUDE = ':not(.ce-hero-motion):not(.ce-hero-motion *)';
    var HERO_RULE = /ce-hero-motion|hm-studio|\.ce-fx/;
    /* Only "universal" selectors (*, :not(.track), ::before ...) need the hero carved out.
       Browsers print "*:not(x)" as ":not(x)", so test for a selector that starts with * or : */
    function excludeHero(selector) {
      return selector.split(',').map(function (part) {
        var t = part.trim();
        if (!/^(\*|:)/.test(t)) return t;
        if (/::?(before|after)/.test(t)) return t.replace(/::?(before|after)/, EXCLUDE + '$&');
        return t + EXCLUDE;
      }).join(', ');
    }

    Array.prototype.forEach.call(document.styleSheets, function (sheet) {
      var rules;
      try { rules = sheet.cssRules; } catch (e) { return; }          /* cross-origin sheet (fonts) */
      if (!rules) return;
      Array.prototype.forEach.call(rules, function (rule) {
        if (rule.type !== 4 || !/prefers-reduced-motion\s*:\s*reduce/.test(rule.media.mediaText)) return;
        for (var i = rule.cssRules.length - 1; i >= 0; i--) {         /* backwards: deleting shifts indexes */
          var r = rule.cssRules[i];
          if (!r.selectorText) continue;
          if (HERO_RULE.test(r.selectorText)) { rule.deleteRule(i); continue; }   /* this file's own off-switch */
          if (/animation|transition/.test(r.cssText)) {
            try { r.selectorText = excludeHero(r.selectorText); } catch (e) {}
          }
        }
      });
    });
  }

  function unmount(el) {
    if (!el) return;
    if (el._ceObs) { try { el._ceObs.disconnect(); } catch (e) {} el._ceObs = null; }
    el.querySelectorAll(':scope > .ce-fx').forEach(function (n) { n.remove(); });
    ['ce-hero-motion', 'motion-subtle', 'motion-dynamic', 'motion-once', 'motion-paused'].forEach(function (c) { el.classList.remove(c); });
    el.removeAttribute('data-motion');
    el.style.removeProperty('--ce-motion-duration');
    el.style.removeProperty('--hit');
  }

  function mount(el, opts) {
    if (!el) return;
    opts = opts || {};
    allowReducedMotion();
    unmount(el);

    var preset = SPEC[opts.preset] ? opts.preset : PALETTE_DEFAULT;
    var spec = SPEC[preset];
    var duration = Math.min(12, Math.max(3, Number(opts.duration) || 6));
    var density = opts.particles === undefined || opts.particles === null || opts.particles === '' ? 65 : Math.min(100, Math.max(0, Number(opts.particles)));
    var playback = opts.playback || 'continuous';

    el.dataset.motion = preset;
    el.style.setProperty('--ce-motion-duration', duration + 's');
    el.style.setProperty('--hit', String(spec.hit || 0.3));
    el.classList.add('ce-hero-motion');
    if (opts.intensity === 'subtle') el.classList.add('motion-subtle');
    if (opts.intensity === 'dynamic') el.classList.add('motion-dynamic');
    if (playback === 'once') el.classList.add('motion-once');

    var back = '', front = '';
    spec.L.forEach(function (name) { if (FRONT[name]) front += BUILD[name](); else back += BUILD[name](); });
    spec.P.forEach(function (p) {
      var n = Math.round(p[1] * density / 100);
      if (n > 0) front += particles(p[0], n);
    });

    var b = document.createElement('div'); b.className = 'ce-fx ce-fx-back'; b.setAttribute('aria-hidden', 'true'); b.innerHTML = back;
    var f = document.createElement('div'); f.className = 'ce-fx ce-fx-front'; f.setAttribute('aria-hidden', 'true'); f.innerHTML = front;
    el.insertBefore(b, el.firstChild);
    el.appendChild(f);

    /* Save battery/CPU: animate only while the hero is on screen. "On scroll" also replays on each entry. */
    if ('IntersectionObserver' in window) {
      var seen = false;
      el._ceObs = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          el.classList.toggle('motion-paused', !e.isIntersecting);
          if (e.isIntersecting && playback === 'scroll' && seen) replay(el);
          if (e.isIntersecting) seen = true;
        });
      }, { threshold: playback === 'scroll' ? 0.3 : 0.05 });
      el._ceObs.observe(el);
    }
  }

  function replay(el) {
    if (!el || !el.classList.contains('ce-hero-motion')) return;
    el.classList.remove('ce-hero-motion');
    void el.offsetWidth;                       /* force reflow so every animation restarts */
    el.classList.add('ce-hero-motion');
  }

  window.CEHeroMotion = { allowReducedMotion: allowReducedMotion, mount: mount, unmount: unmount, replay: replay, presets: Object.keys(SPEC) };

  /* ---- Live homepage ---- */
  (async function () {
    var hero = document.querySelector('.premium-hero .hero-visual, .hero .hero-visual');
    if (!hero) return;
    try {
      var response = await fetch('/api/hero-motion', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!response.ok) return;
      var data = await response.json();
      var s = data.settings || {};
      var device = s.device || 'both';
      if (['both', 'desktop', 'mobile'].indexOf(device) < 0) return;
      var mobile = matchMedia('(max-width:700px)').matches;
      if ((device === 'desktop' && mobile) || (device === 'mobile' && !mobile)) return;
      mount(hero, { preset: s.preset, duration: s.duration, particles: s.particles, intensity: s.intensity, playback: s.playback });
    } catch (e) { /* keep the static hero if settings cannot load */ }
  })();
})();
