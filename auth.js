// Zilch accounts (Supabase email-link sign-in).
// Pages that talk to the database call zilchAuth.attach(sb, secret) once.
// The first time a signed-in person opens Zilch in a browser, everything that
// browser's key owns (profiles, jobs, chats, payouts) moves onto the account.
(function(){
  "use strict";
  var api = {
    session: null,
    attach: async function(sb, secret){
      var res = await sb.auth.getSession();
      api.session = res.data ? res.data.session : null;
      paintNav();
      if (api.session && secret){
        var key = "zilch.linked." + api.session.user.id;
        var done = null;
        try { done = localStorage.getItem(key); } catch(e){}
        if (!done){
          var r = await sb.rpc("link_browser", {p_secret: secret});
          if (!r.error){ try { localStorage.setItem(key, "1"); } catch(e){} }
        }
      }
      sb.auth.onAuthStateChange(function(_evt, s){ api.session = s; paintNav(); });
      return api.session;
    },
    signInUrl: function(next){
      return "account.html?next=" + encodeURIComponent(next || location.pathname.split("/").pop() + location.search);
    }
  };
  function paintNav(){
    var a = document.querySelector('.sitenav a[href="account.html"]');
    if (a && !a.hasAttribute("aria-current")) a.textContent = api.session ? "Account" : "Sign in";
  }
  window.zilchAuth = api;
  // Pages without a database client still show "Account" when signed in.
  document.addEventListener("DOMContentLoaded", function(){
    if (api.session) return;
    try {
      var raw = localStorage.getItem("sb-zlvvtaydmaphdnhvmppj-auth-token");
      var tok = raw && JSON.parse(raw);
      if (tok && tok.access_token && (!tok.expires_at || tok.expires_at * 1000 > Date.now())) api.session = {user: tok.user || {}};
    } catch(e){}
    paintNav();
  });
})();
