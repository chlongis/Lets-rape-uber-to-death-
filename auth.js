// Zilch accounts (Supabase email-link sign-in).
// Pages that talk to the database call zilchAuth.attach(sb, secret) once.
// When a signed-in person opens Zilch, everything this browser's key owns, and
// anything made before sign-in with their email, moves onto the account.
(function(){
  "use strict";
  var api = {
    session: null,
    attach: async function(sb, secret){
      var res = await sb.auth.getSession();
      api.session = res.data ? res.data.session : null;
      paintNav();
      // Cheap and idempotent: claims this browser's things and anything that was
      // made elsewhere with this account's email.
      if (api.session) await sb.rpc("link_browser", {p_secret: secret || ""});
      sb.auth.onAuthStateChange(function(_evt, s){ api.session = s; paintNav(); });
      return api.session;
    },
    signInUrl: function(next){
      return "account.html?next=" + encodeURIComponent(next || location.pathname.split("/").pop() + location.search);
    }
  };
  function paintNav(){
    Array.prototype.forEach.call(document.querySelectorAll('.sitenav a[href="account.html"]'), function(a){
      if (!a.hasAttribute("aria-current")) a.textContent = api.session ? "Account" : "Sign in";
    });
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
