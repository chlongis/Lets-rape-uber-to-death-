// Registers the service worker and offers an "Install Zilch" button.
(function(){
  "use strict";
  if ("serviceWorker" in navigator){
    window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); });
  }

  // Phone layout: one swipeable row of nav links instead of three stacked rows,
  // and room for the iPhone status bar when opened from the home screen.
  var base = document.createElement("style");
  base.textContent =
    "@media (max-width:640px){.sitenav{flex-wrap:nowrap!important;overflow-x:auto;-webkit-overflow-scrolling:touch;" +
    "scrollbar-width:none;width:100%;margin-left:0!important}.sitenav::-webkit-scrollbar{display:none}" +
    ".sitenav a{white-space:nowrap;flex:0 0 auto}" +
    ".top-in,.masthead-in,.brand{flex-wrap:wrap;min-width:0;max-width:100%}.brand{flex:1 1 100%}}" +
    "@media (display-mode:standalone){body{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}}";
  document.head.appendChild(base);

  // Slide the nav so the current page's link is visible.
  window.addEventListener("DOMContentLoaded", function(){
    var cur = document.querySelector('.sitenav a[aria-current="page"]');
    if (cur && cur.parentNode.scrollWidth > cur.parentNode.clientWidth){
      cur.parentNode.scrollLeft = cur.offsetLeft - cur.parentNode.offsetLeft - 12;
    }
  });

  var standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) return;

  var KEY = "zilch.installHint.v1";
  var dismissed = false;
  try { dismissed = localStorage.getItem(KEY) === "1"; } catch(e){}
  if (dismissed) return;

  var css = document.createElement("style");
  css.textContent =
    ".zinstall{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;display:flex;align-items:center;gap:10px;" +
    "max-width:520px;margin:0 auto;padding:12px 12px 12px 14px;background:#0E1620;color:#E8EEF3;border:1px solid #2A3946;" +
    "border-radius:6px;box-shadow:0 10px 30px -10px rgba(0,0,0,.6);font:500 14px/1.4 'IBM Plex Sans',Helvetica,Arial,sans-serif}" +
    ".zinstall img{width:34px;height:34px;border-radius:7px;flex:0 0 auto}" +
    ".zinstall p{margin:0;flex:1}.zinstall b{color:#FFB020}" +
    ".zinstall button{font:inherit;font-weight:600;cursor:pointer;border-radius:4px;padding:9px 12px;border:1px solid #FFB020}" +
    ".zinstall .zgo{background:#FFB020;color:#0E1620}.zinstall .zx{background:transparent;color:#A3B4C1;border-color:#2A3946}" +
    "@media print{.zinstall{display:none}}";

  function bar(html, onGo){
    document.head.appendChild(css);
    var el = document.createElement("div");
    el.className = "zinstall";
    el.setAttribute("role", "dialog");
    el.innerHTML = '<img src="icons/icon-192.png" alt=""><p>' + html + '</p>' +
      (onGo ? '<button class="zgo">Install</button>' : '') + '<button class="zx" aria-label="Dismiss">Not now</button>';
    document.body.appendChild(el);
    if (onGo) el.querySelector(".zgo").addEventListener("click", function(){ onGo(); el.remove(); });
    el.querySelector(".zx").addEventListener("click", function(){
      try { localStorage.setItem(KEY, "1"); } catch(e){}
      el.remove();
    });
  }

  // Android / desktop Chrome: real install prompt.
  window.addEventListener("beforeinstallprompt", function(ev){
    ev.preventDefault();
    bar("<b>Install Zilch</b> on your home screen. Opens like an app, and the offer check works with no signal.", function(){
      ev.prompt();
    });
  });

  // iPhone: Safari has no prompt, so explain the two taps.
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (ios){
    window.addEventListener("load", function(){
      setTimeout(function(){
        bar("<b>Install Zilch:</b> tap the Share button, then <b>Add to Home Screen</b>.", null);
      }, 1500);
    });
  }
})();
