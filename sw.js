// Zilch service worker. Makes the site installable and keeps the offer
// check and receipt card working with no signal. Database calls (Supabase)
// always go to the network and are never cached.
var VERSION = "zilch-v9";
var CORE = [
  "./", "./index.html", "./offer.html", "./worst.html", "./receipt.html", "./board.html", "./find.html",
  "./claim.html", "./d.html", "./deact.html", "./paycheck.html", "./pledge.html",
  "./pwa.js", "./auth.js", "./account.html", "./offer-parse.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){ return c.addAll(CORE); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== VERSION && k !== "zilch-share"; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener("fetch", function(e){
  var req = e.request;

  // Android share target: a screenshot shared to Zilch arrives as a POST to
  // offer.html. Park the image, then open the offer check to read it.
  if (req.method === "POST" && new URL(req.url).pathname.endsWith("/offer.html")){
    e.respondWith((async function(){
      try {
        var form = await req.formData();
        var file = form.get("shot");
        if (file){
          var c = await caches.open("zilch-share");
          await c.put("shared-shot", new Response(file, {headers: {"Content-Type": file.type || "image/png"}}));
        }
      } catch(err){}
      return Response.redirect("./offer.html?shared=1", 303);
    })());
    return;
  }
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (/supabase\.co$/.test(url.hostname)) return;          // live data: never cache

  // Pages: try the network first so updates show up, fall back to the cached copy offline.
  if (req.mode === "navigate"){
    e.respondWith(fetch(req).then(function(res){
      var copy = res.clone();
      caches.open(VERSION).then(function(c){ c.put(url.pathname.endsWith("/") ? "./" : req, copy); });
      return res;
    }).catch(function(){
      return caches.match(req, {ignoreSearch:true}).then(function(r){ return r || caches.match("./offer.html"); });
    }));
    return;
  }

  // Fonts, scripts, icons: serve from cache, refresh in the background.
  e.respondWith(caches.match(req).then(function(hit){
    var net = fetch(req).then(function(res){
      if (res && (res.ok || res.type === "opaque")){
        var copy = res.clone();
        caches.open(VERSION).then(function(c){ c.put(req, copy); });
      }
      return res;
    }).catch(function(){ return hit; });
    return hit || net;
  }));
});
