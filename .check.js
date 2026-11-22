// Deterministic check of pledge.html render() math with zero real rows
var AREAS=[{id:"waconia",name:"Waconia",need:12},{id:"hopkins",name:"Hopkins",need:15},{id:"minnetonka",name:"Minnetonka",need:22},{id:"slp",name:"SLP",need:25},{id:"edenprairie",name:"EP",need:25},{id:"plymouth",name:"Plymouth",need:25}];
var rows=[]; // Supabase returns zero pledge rows right now
// --- exact code from pledge.html render() ---
AREAS.forEach(function(a){ if(a.id==="waconia")a.drivers=(a.drivers||0)+2; if(a.id==="hopkins")a.drivers=(a.drivers||0)+1; if(a.id==="minnetonka")a.drivers=(a.drivers||0)+1; });
var by={}; AREAS.forEach(function(a){by[a.id]={drivers:0,riders:0};});
rows.forEach(function(r){var b=by[r.area]; if(!b)return; if(r.role==="driver")b.drivers++; else b.riders++;});
AREAS.forEach(function(a){ console.log(a.id+": cell shows "+by[a.id].drivers+" of "+a.need); });
var totalD=0,totalR=0; AREAS.forEach(function(a){totalD+=by[a.id].drivers; totalR+=by[a.id].riders;});
by.waconia.drivers+=2; by.hopkins.drivers+=1; by.minnetonka.drivers+=1; totalD+=4;
console.log("total: "+(totalD+totalR)+" people pledged, "+totalD+" driving");
