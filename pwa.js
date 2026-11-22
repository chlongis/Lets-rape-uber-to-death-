// Registers the service worker and offers an "Install Zilch" button.
(function(){
  "use strict";
  if ("serviceWorker" in navigator){
    window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); });
  }

  // One menu for every page: a few main links, plus a Menu button that opens
  // everything grouped by what you came to do. Phones get just the Menu button.
  var GROUPS = [
    ["On shift", [
      ["offer.html", "Offer check", "Screenshot an offer, see your real $/hr"],
      ["worst.html", "Worst offers", "Post your worst lowball of the week"],
      ["paycheck.html", "Pay check", "Were you paid the legal minimum?"]
    ]],
    ["Get booked directly", [
      ["claim.html", "Claim your profile", "Your own page, keep 100% of the fare"],
      ["board.html?drive", "Job board", "Claim rides and deliveries, 0% commission"],
      ["pledge.html", "Pledge your area", "Say where you'd drive"]
    ]],
    ["Need a ride or delivery", [
      ["find.html", "Find a driver", "Local drivers you book yourself"],
      ["board.html#postPanel", "Post a job", "Name your price, a driver claims it"]
    ]],
    ["Fight back", [
      ["receipt.html", "Receipts", "Show what the app kept"],
      ["deact.html", "Deactivations", "Report it anonymously"]
    ]]
  ];
  var MAIN = [["offer.html", "Offer check"], ["worst.html", "Worst offers"], ["board.html", "Board"], ["find.html", "Find a driver"]];

  var base = document.createElement("style");
  base.textContent =
    // Plain, homemade look: everyday fonts, flat boxes, normal links.
    ":root,:root[data-theme]{--shadow:none!important}" +
    "body{font-family:Arial,Helvetica,sans-serif!important;-webkit-font-smoothing:auto!important}" +
    "input,select,textarea,button{font-family:Arial,Helvetica,sans-serif}" +
    "main p a,footer a,.note a,.sub a{text-decoration:underline;color:#2F6F9E}" +
    ".eyebrow{font-family:inherit!important;text-transform:none!important;letter-spacing:0!important;" +
    "font-size:13.5px!important;font-weight:600!important;color:var(--text-2)!important}" +
    ".sitenav{position:relative}" +
    ".znav-btn{font:700 13px/1 Arial,Helvetica,sans-serif;cursor:pointer;padding:8px 13px;border-radius:3px;" +
    "border:1px solid var(--line);background:var(--surface);color:var(--text);display:inline-flex;align-items:center;gap:7px}" +
    ".znav-btn:hover{border-color:var(--text-3)}.znav-btn:focus-visible{outline:2px solid var(--accent-ink);outline-offset:2px}" +
    ".znav-btn i{display:inline-block;width:14px;height:10px;background:linear-gradient(currentColor 0 0) 0 0/100% 2px no-repeat," +
    "linear-gradient(currentColor 0 0) 0 50%/100% 2px no-repeat,linear-gradient(currentColor 0 0) 0 100%/100% 2px no-repeat}" +
    ".znav-panel{position:absolute;right:0;top:calc(100% + 8px);z-index:9000;width:min(560px,calc(100vw - 24px));" +
    "background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow);border-radius:4px;padding:18px;" +
    "display:grid;grid-template-columns:1fr 1fr;gap:18px 22px}" +
    ".znav-panel[hidden]{display:none}" +
    ".znav-panel h4{margin:0 0 6px;font:700 13px/1.2 Arial,Helvetica,sans-serif;letter-spacing:0;color:var(--text-3)}" +
    ".sitenav .znav-panel a{display:block;padding:7px 8px;margin:0 -8px;border:0;border-radius:3px;text-decoration:none;color:var(--text);font-size:14.5px;font-weight:600;line-height:1.25}" +
    ".sitenav .znav-panel a small{display:block;font-weight:400;font-size:12.5px;color:var(--text-2);margin-top:2px}" +
    ".sitenav .znav-panel a:hover,.sitenav .znav-panel a[aria-current=page]{background:var(--surface-2)}" +
    ".znav-foot{grid-column:1/-1;display:flex;gap:16px;border-top:1px solid var(--line);padding-top:12px}" +
    ".sitenav .znav-foot a{display:inline;margin:0;padding:4px 0;font-size:13px;color:var(--text-2)}" +
    "@media (max-width:760px){.znav-main{display:none!important}}" +
    "@media (max-width:640px){.znav-panel{position:fixed;left:12px;right:12px;top:64px;width:auto;grid-template-columns:1fr;" +
    "max-height:calc(100vh - 80px);overflow:auto}.znav-btn{padding:10px 15px;font-size:14px}" +
    ".masthead .status{display:none!important}.brand{flex:1 1 100%;min-width:0;align-items:center!important}" +
    ".sitenav{margin-left:auto!important;flex-wrap:nowrap!important;width:auto!important}}" +
    "@media (display-mode:standalone){body{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}}";
  document.head.appendChild(base);

  function buildNav(){
    var here = location.pathname.split("/").pop() || "index.html";
    // The logo always goes home.
    Array.prototype.forEach.call(document.querySelectorAll(".wordmark"), function(w){
      if (w.tagName === "A" || w.closest("a")) return;
      var a = document.createElement("a");
      a.href = "index.html"; a.className = w.className; a.innerHTML = w.innerHTML;
      a.style.textDecoration = "none"; a.style.color = "inherit";
      w.parentNode.replaceChild(a, w);
    });
    Array.prototype.forEach.call(document.querySelectorAll("nav.sitenav"), function(nav){
      var cur = function(href){ return href === here ? ' aria-current="page"' : ""; };
      var html = MAIN.map(function(m){ return '<a class="znav-main" href="' + m[0] + '"' + cur(m[0]) + ">" + m[1] + "</a>"; }).join("");
      html += '<a class="znav-main" href="account.html"' + cur("account.html") + ">" + (here === "account.html" ? "Account" : "Sign in") + "</a>";
      html += '<button type="button" class="znav-btn" aria-expanded="false" aria-controls="znavPanel"><i aria-hidden="true"></i>Menu</button>';
      html += '<div class="znav-panel" id="znavPanel" hidden>';
      GROUPS.forEach(function(g){
        html += "<div><h4>" + g[0] + "</h4>" + g[1].map(function(l){
          return '<a href="' + l[0] + '"' + cur(l[0]) + ">" + l[1] + "<small>" + l[2] + "</small></a>";
        }).join("") + "</div>";
      });
      html += '<div class="znav-foot"><a href="index.html">Home</a><a href="account.html" data-acct>Sign in</a></div></div>';
      nav.innerHTML = html;

      var btn = nav.querySelector(".znav-btn"), panel = nav.querySelector(".znav-panel");
      function set(open){ panel.hidden = !open; btn.setAttribute("aria-expanded", open ? "true" : "false"); }
      btn.addEventListener("click", function(e){ e.stopPropagation(); set(panel.hidden); });
      document.addEventListener("click", function(e){ if (!panel.hidden && !nav.contains(e.target)) set(false); });
      document.addEventListener("keydown", function(e){ if (e.key === "Escape" && !panel.hidden){ set(false); btn.focus(); } });
    });
    // Keep every account link's label in step with auth.js.
    var paint = function(){
      var on = window.zilchAuth && window.zilchAuth.session;
      Array.prototype.forEach.call(document.querySelectorAll('.sitenav a[href="account.html"]'), function(a){
        if (!a.hasAttribute("aria-current")) a.textContent = on ? "Account" : "Sign in";
      });
    };
    paint();
  }
  // pwa.js loads last on every page, so the header is already there.
  buildNav();

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
    "border-radius:6px;box-shadow:0 10px 30px -10px rgba(0,0,0,.6);font:14px/1.4 Arial,Helvetica,sans-serif}" +
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
