// Reads payout, miles and minutes out of the text of a delivery or ride offer
// screenshot (DoorDash, Uber Eats, Grubhub, Instacart, Uber, Lyft).
// Pure function so it can be tested; used by offer.html.
(function(root){
  "use strict";
  function num(s){ return parseFloat(String(s).replace(/,/g, "")); }

  function parseOffer(text, now){
    now = now || new Date();
    var t = String(text || "")
      .replace(/[–—]/g, "-")
      .replace(/(\d)\s*[,.]\s*(\d{2})\b/g, function(m, a, b){ return a + "." + b; }); // "$8 .50" -> "$8.50"
    var out = {pay: null, miles: null, minutes: null, notes: []};

    // Payout: dollar amounts that aren't a per-mile or per-hour rate.
    var pays = [];
    t.replace(/\$\s?(\d{1,3}(?:\.\d{1,2})?)(?!\d)(\s*\/\s*(?:mi|mile|hr|hour|h)\b)?/gi, function(m, v, rate){
      if (!rate) pays.push(num(v));
      return m;
    });
    pays = pays.filter(function(v){ return v >= 1 && v <= 300; });
    if (pays.length) out.pay = Math.max.apply(null, pays);

    // Miles: prefer one marked "total", else the largest.
    var miles = [], totalMi = null;
    t.replace(/(\d{1,3}(?:\.\d{1,2})?)\s*(?:mi|miles?)\b(\s*\)?\s*total)?/gi, function(m, v, tot){
      var n = num(v); if (n > 0 && n < 200){ miles.push(n); if (tot) totalMi = n; }
      return m;
    });
    if (totalMi != null) out.miles = totalMi;
    else if (miles.length) out.miles = Math.max.apply(null, miles);

    // Minutes: "18 min", "1 hr 5 min"; prefer "total".
    var mins = [], totalMin = null;
    t.replace(/(?:(\d{1,2})\s*(?:hr|hrs|hour|hours|h)\s*)?(\d{1,3})\s*(?:min|mins|minutes)\b([^\n]{0,14}total)?/gi, function(m, h, v, tot){
      var n = (h ? num(h) * 60 : 0) + num(v);
      if (n > 0 && n < 300){ mins.push(n); if (tot) totalMin = n; }
      return m;
    });
    if (totalMin != null) out.minutes = totalMin;
    else if (mins.length) out.minutes = Math.max.apply(null, mins);

    // DoorDash style: "Deliver by 7:45 PM" and no minutes -> minutes from now.
    if (out.minutes == null){
      var by = /deliver(?:y)?\s*by\s*(\d{1,2}):(\d{2})\s*([ap])\.?\s*m/i.exec(t);
      if (by){
        var h = num(by[1]) % 12 + (/p/i.test(by[3]) ? 12 : 0), d = new Date(now);
        d.setHours(h, num(by[2]), 0, 0);
        var diff = Math.round((d - now) / 60000);
        if (diff < -60) diff += 24 * 60;
        if (diff > 0 && diff < 300){ out.minutes = diff; out.notes.push("Minutes worked out from the deliver-by time."); }
      }
    }
    return out;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = parseOffer;
  else root.parseOffer = parseOffer;
})(this);
