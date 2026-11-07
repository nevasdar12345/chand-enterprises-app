/* Chand Enterprises — Single-file UI Enhancement Engine
 * Client-side enhancements only. Safe, additive and dependency-free.
 * Backend-dependent workflows (GPS tracking, loyalty accounting, audit logs,
 * reviews persistence, bulk editing, etc.) still require server-side APIs.
 */
(function (window, document) {
  "use strict";
  if (window.CEEnhancements) return;

  var CE = window.CEEnhancements = {
    version: "1.0.0",
    toast: function (message, type, timeout) {
      var region = document.querySelector(".cex-toast-region");
      if (!region) {
        region = document.createElement("div");
        region.className = "cex-toast-region";
        region.setAttribute("aria-live", "polite");
        document.body.appendChild(region);
      }
      var item = document.createElement("div");
      item.className = "cex-toast";
      item.dataset.type = /^(success|error|warning)$/.test(type) ? type : "info";
      var msg = document.createElement("span");
      msg.textContent = String(message == null ? "" : message);
      var close = document.createElement("button");
      close.type = "button"; close.className = "cex-toast-close";
      close.setAttribute("aria-label", "Dismiss"); close.textContent = "×";
      close.addEventListener("click", function () { item.remove(); });
      item.appendChild(msg); item.appendChild(close); region.appendChild(item);
      window.setTimeout(function () { if (item.parentNode) item.remove(); },
        Math.max(1500, Number(timeout) || 3500));
    }
  };

  var style = `
    .cex-progress{position:fixed;z-index:10050;left:0;top:0;height:3px;width:0;pointer-events:none;background:linear-gradient(90deg,var(--pri,#087cff),#00c2d1);box-shadow:0 1px 8px #087cff55}
    .cex-top{position:fixed;z-index:1400;right:18px;bottom:20px;width:46px;height:46px;border:1px solid var(--line,#ddd);border-radius:15px;background:var(--card,#fff);color:var(--ink,#123);box-shadow:0 8px 25px #10243a20;font-size:21px;opacity:0;visibility:hidden;transform:translateY(10px);transition:.22s;cursor:pointer}
    .cex-top.visible{opacity:1;visibility:visible;transform:none}
    .cex-toast-region{position:fixed;z-index:10060;right:16px;top:82px;width:min(360px,calc(100vw - 28px));display:grid;gap:9px;pointer-events:none}
    .cex-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;padding:13px 15px;border:1px solid var(--line,#ddd);border-left:4px solid var(--pri,#087cff);border-radius:14px;background:var(--card,#fff);color:var(--ink,#123);box-shadow:0 14px 35px #0002;animation:cex-toast-in .22s ease both}
    .cex-toast[data-type=success]{border-left-color:#16a34a}.cex-toast[data-type=error]{border-left-color:#dc2626}.cex-toast[data-type=warning]{border-left-color:#d97706}
    .cex-toast-close{margin-left:auto;padding:0 4px;min-height:24px;border:0;background:transparent;color:inherit}
    @keyframes cex-toast-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
    .cex-reveal{opacity:0;transform:translateY(15px);transition:opacity .48s cubic-bezier(.2,.75,.25,1),transform .48s cubic-bezier(.2,.75,.25,1)}
    .cex-reveal.cex-shown{opacity:1;transform:none}
    .cex-reveal[data-cex-delay="1"]{transition-delay:60ms}.cex-reveal[data-cex-delay="2"]{transition-delay:120ms}.cex-reveal[data-cex-delay="3"]{transition-delay:180ms}
    .product-card,.brochure-product-card{transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease}
    .product-card img,.brochure-product-card img{transition:transform .35s ease}
    @media(hover:hover){.product-card:hover,.brochure-product-card:hover{transform:translateY(-4px);box-shadow:0 16px 38px #10243a20;border-color:color-mix(in srgb,var(--pri,#087cff) 35%,var(--line,#ddd))}.product-card:hover img,.brochure-product-card:hover img{transform:scale(1.035)}}
    button,.primary,.add,.soft,.danger{transition:transform .16s ease,box-shadow .18s ease,filter .18s ease}
    button:active,.primary:active,.add:active{transform:scale(.985)}
    :where(button,a,input,select,textarea,[tabindex]):focus-visible{outline:3px solid color-mix(in srgb,var(--pri,#087cff) 45%,transparent);outline-offset:3px}
    img[loading=lazy]{background:linear-gradient(110deg,var(--bg,#f5f7fa) 8%,var(--card,#fff) 18%,var(--bg,#f5f7fa) 33%);background-size:200% 100%}
    .cex-skeleton{position:relative;overflow:hidden;background:color-mix(in srgb,var(--mut,#789) 12%,var(--card,#fff));border-radius:10px}
    .cex-skeleton:after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,#ffffff88,transparent);animation:cex-shimmer 1.35s infinite}
    @keyframes cex-shimmer{to{transform:translateX(100%)}}
    @media(max-width:640px){.cex-top{right:12px;bottom:calc(14px + env(safe-area-inset-bottom));width:43px;height:43px}.cex-toast-region{right:12px;top:74px;width:calc(100vw - 24px)}}
    @media(prefers-reduced-motion:reduce){.cex-reveal{opacity:1;transform:none;transition:none}*,*:before,*:after{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `;
  function addStyles() {
    if (document.getElementById("cex-styles")) return;
    var el = document.createElement("style"); el.id = "cex-styles"; el.textContent = style;
    (document.head || document.documentElement).appendChild(el);
  }
  function images() {
    var list = Array.prototype.slice.call(document.images || []);
    list.forEach(function (img, i) {
      if (img.hasAttribute("data-no-lazy") || img.loading === "eager") return;
      if (i > 1) img.loading = "lazy";
      if ("decoding" in img) img.decoding = "async";
    });
  }
  function reveal() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    var selectors = ".product-card,.brochure-product-card,.trust-card,.metric-card,.staff-metric,.about-card,.panel,.section > h2,.category-card";
    var nodes = document.querySelectorAll(selectors);
    var observer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("cex-shown"); obs.unobserve(entry.target); }
      });
    }, { rootMargin: "0px 0px -35px 0px", threshold: .05 });
    Array.prototype.forEach.call(nodes, function (node, i) {
      if (node.closest("[hidden]")) return;
      node.classList.add("cex-reveal");
      if (i % 4) node.dataset.cexDelay = String(i % 4);
      observer.observe(node);
    });
  }
  function scrollTools() {
    var bar = document.createElement("div"); bar.className = "cex-progress"; bar.setAttribute("aria-hidden","true");
    var top = document.createElement("button"); top.type = "button"; top.className = "cex-top"; top.textContent = "↑";
    top.setAttribute("aria-label","Back to top"); top.title = "Back to top";
    top.addEventListener("click", function () { window.scrollTo({top:0,behavior:"smooth"}); });
    document.body.appendChild(bar); document.body.appendChild(top);
    var busy = false;
    function update() {
      var doc = document.documentElement, max = doc.scrollHeight - window.innerHeight;
      bar.style.width = (max > 0 ? Math.min(100, window.scrollY / max * 100) : 0) + "%";
      top.classList.toggle("visible", window.scrollY > 420); busy = false;
    }
    window.addEventListener("scroll", function () { if (!busy) { busy = true; requestAnimationFrame(update); } }, {passive:true});
    window.addEventListener("resize", update, {passive:true}); update();
  }
  function shortcuts() {
    document.addEventListener("keydown", function (e) {
      if (!(e.ctrlKey || e.metaKey) || String(e.key).toLowerCase() !== "k") return;
      var t = e.target; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      var search = document.querySelector('input[type="search"],input[placeholder*="search" i],input[aria-label*="search" i]');
      if (search) { e.preventDefault(); search.focus(); if (search.select) search.select(); }
    });
  }
  function optInSkeletons() {
    document.querySelectorAll("[data-ce-skeleton]").forEach(function (el) {
      el.classList.add("cex-skeleton");
    });
  }
  function init() {
    addStyles(); images(); reveal(); scrollTools(); shortcuts(); optInSkeletons();
    // Public API for existing/future scripts; does not replace native alert or API handlers.
    window.ceToast = CE.toast;
    // Re-apply lazy loading to images added later by product filters or dynamic panels.
    if ("MutationObserver" in window) {
      var mo = new MutationObserver(function (records) {
        records.forEach(function (r) { r.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          if (n.tagName === "IMG") { if (!n.hasAttribute("data-no-lazy")) n.loading = "lazy"; n.decoding = "async"; }
          if (n.querySelectorAll) n.querySelectorAll("img").forEach(function (img) {
            if (!img.hasAttribute("data-no-lazy") && img.loading !== "eager") img.loading = "lazy";
            img.decoding = "async";
          });
        }); });
      });
      mo.observe(document.body, {childList:true,subtree:true});
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true});
  else init();
})(window, document);
