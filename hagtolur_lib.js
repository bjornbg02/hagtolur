/* Gagnasafnari hagtölusíðunnar. Keyrir bæði í vafra (síðan sjálf) og í Node 18+ (daglega GitHub-ferlið).
   HT.load() sækir allar tölur beint frá upprunanum. HT.kaupskra(texti) tekur saman kaupskrá HMS eftir póstnúmerum. */
var HT=(function(){
  "use strict";
  var PX="https://px.hagstofa.is/pxis/api/v1/is/";

  function getText(url,opt){
    var ac=new AbortController(), tm=setTimeout(function(){ ac.abort(); },20000);
    opt=opt||{}; opt.signal=ac.signal;
    return fetch(url,opt).then(function(r){ if(!r.ok){ clearTimeout(tm); throw new Error(url+" "+r.status); } return r.text().then(function(t){ clearTimeout(tm); return t; }); });
  }
  function getJ(url,opt){ return getText(url,opt).then(JSON.parse); }
  function sel(code,vals,filter){ return { code:code, selection:{ filter:filter||"item", values:vals } }; }
  /* PX-vefþjónusta Hagstofunnar. Sent sem text/plain svo vafrinn þurfi ekki CORS-forspurn. */
  function px(path,q){
    return getJ(PX+path,{ method:"POST", body:JSON.stringify({ query:q, response:{ format:"json" } }) }).then(function(j){
      return j.data.map(function(d){ return { k:d.key, v:parseFloat(d.values[0]) }; });
    });
  }
  function ym(s){ return s.replace(/^(\d{4})M(\d\d)$/,"$1-$2").replace(/^(\d{4})Q(\d)$/,"$1-Q$2"); }
  function csv(t){
    var rows=[], row=[], f="", q=false;
    for(var i=0;i<t.length;i++){
      var c=t[i];
      if(q){ if(c==='"'){ if(t[i+1]==='"'){ f+='"'; i++; } else q=false; } else f+=c; }
      else if(c==='"') q=true;
      else if(c===','){ row.push(f); f=""; }
      else if(c==='\n'){ row.push(f.replace(/\r$/,"")); rows.push(row); row=[]; f=""; }
      else f+=c;
    }
    if(f||row.length){ row.push(f); rows.push(row); }
    return rows;
  }
  function byKey(rows,ki){ var o={}; rows.forEach(function(r){ var k=r.k[ki]; (o[k]=o[k]||[]).push(r); }); return o; }
  function r1(v){ return Math.round(v*10)/10; }
  function r2(v){ return Math.round(v*100)/100; }

  var P={};

  /* Stýrivextir: BIS, daglegar tölur seðlabankanna. XM = Seðlabanki Evrópu (gildir fyrir Finnland). */
  P.policy=function(){
    var sd=new Date(Date.now()-760*864e5).toISOString().slice(0,10);
    return getText("https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.IS+US+GB+NO+SE+DK+XM?startPeriod="+sd+"&format=csv&detail=dataonly").then(function(t){
      var rows=csv(t), h=rows.shift(), iA=h.indexOf("REF_AREA"), iT=h.indexOf("TIME_PERIOD"), iV=h.indexOf("OBS_VALUE"), s={};
      rows.forEach(function(r){ var v=parseFloat(r[iV]); if(r[iA] && !isNaN(v)) (s[r[iA]]=s[r[iA]]||[]).push([r[iT],v]); });
      var out={};
      Object.keys(s).forEach(function(a){
        var x=s[a].sort(function(p,q){ return p[0]<q[0]?-1:1; }), L=x[x.length-1], j=x.length-1;
        while(j>0 && x[j-1][1]===L[1]) j--;
        out[a]={ v:L[1], d:L[0], since:x[j][0], pv:j>0?x[j-1][1]:null };
      });
      if(!out.IS) throw new Error("BIS án Íslands");
      return out;
    });
  };
  /* Verðbólga með og án húsnæðis, 12 mánaða breyting, 6 ár */
  P.cpi=function(){
    return px("Efnahagur/visitolur/1_vnv/1_vnv/VIS01000.px",[sel("Vísitala",["CPI","CPILH"]),sel("Liður",["change_A"]),sel("Mánuður",["73"],"top")]).then(function(d){
      var g=byKey(d,1), m=g.CPI.map(function(r){ return ym(r.k[0]); });
      return { m:m, all:g.CPI.map(function(r){ return r.v; }), ex:g.CPILH.map(function(r){ return r.v; }) };
    });
  };
  /* Samanburður á verðbólgu: vísitala neysluverðs hvers lands, 12 mánaða breyting, frá hagstofu landsins */
  function pxLast(url,q){
    return getJ(url,{ method:"POST", body:JSON.stringify({ query:q, response:{ format:"json" } }) }).then(function(j){
      return j.data.map(function(d){ return { m:ym(d.key[0]), v:parseFloat(d.values[0]) }; }).filter(function(x){ return !isNaN(x.v); });
    });
  }
  P.cmp=function(){
    var C={};
    C.IS=px("Efnahagur/visitolur/1_vnv/1_vnv/VIS01000.px",[sel("Vísitala",["CPI"]),sel("Liður",["change_A"]),sel("Mánuður",["1"],"top")]).then(function(d){ return { v:d[0].v, m:ym(d[0].k[0]) }; });
    C.NO=pxLast("https://data.ssb.no/api/v0/no/table/14710/",[sel("ContentsCode",["KpiIndMnd"]),sel("Tid",["13"],"top")]).then(function(d){ var a=d[0], b=d[d.length-1]; if(d.length<13) throw new Error("SSB"); return { v:r1((b.v/a.v-1)*100), m:b.m }; });
    C.SE=pxLast("https://api.scb.se/OV0104/v1/doris/sv/ssd/PR/PR0101/PR0101A/KPI2020M",[sel("ContentsCode",["00000804"]),sel("Tid",["1"],"top")]).then(function(d){ return d[d.length-1]; });
    C.FI=pxLast("https://pxdata.stat.fi/PXWeb/api/v1/en/StatFin/khi/122p.px",[sel("contentscode",["Vuosimuutos"]),sel("timeperiod_m",["1"],"top")]).then(function(d){ return d[d.length-1]; });
    C.DK=getText("https://api.statbank.dk/v1/data/PRIS01/CSV?VAREGR=000000&ENHED=300&Tid=*&lang=da").then(function(t){
      var L=t.trim().split(/\r?\n/), c=L[L.length-1].split(";"), m=/^(\d{4})M(\d\d)$/.exec(c[2]);
      return { v:parseFloat(c[3].replace(",",".")), m:m[1]+"-"+m[2] };
    });
    C.UK=getJ("https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/d7g7/mm23/data").then(function(j){
      var x=j.months[j.months.length-1], mo={JAN:"01",FEB:"02",MAR:"03",APR:"04",MAY:"05",JUN:"06",JUL:"07",AUG:"08",SEP:"09",OCT:"10",NOV:"11",DEC:"12"}, p=x.date.split(" ");
      return { v:parseFloat(x.value), m:p[0]+"-"+mo[p[1]] };
    });
    C.US=getJ("https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0").then(function(j){
      var o={}; j.Results.series[0].data.forEach(function(d){ var v=parseFloat(d.value); if(/^M(0[1-9]|1[0-2])$/.test(d.period) && !isNaN(v)) o[d.year+"-"+d.period.slice(1)]=v; });
      var ks=Object.keys(o).sort();
      for(var i=ks.length-1;i>=0;i--){ var y=+ks[i].slice(0,4)-1, prev=y+ks[i].slice(4); if(o[prev]) return { v:r1((o[ks[i]]/o[prev]-1)*100), m:ks[i] }; }
      throw new Error("BLS");
    });
    var ks=Object.keys(C);
    return Promise.allSettled(ks.map(function(k){ return C[k]; })).then(function(r){
      var o={};
      r.forEach(function(x,i){ if(x.status==="fulfilled" && x.value && !isNaN(x.value.v)) o[ks[i]]=x.value; });
      if(!Object.keys(o).length) throw new Error("enginn samanburður");
      return o;
    });
  };
  /* Undirflokkar vísitölu neysluverðs (3 stafa flokkar), verðbreyting síðustu 12 mánaða */
  P.sub=function(){
    var path="Efnahagur/visitolur/1_vnv/2_undirvisitolur/VIS01300.px";
    return getJ(PX+path).then(function(meta){
      var u=meta.variables[2], codes=[], names={};
      u.values.forEach(function(c,i){ if(/^CP\d{3}$/.test(c)){ codes.push(c); names[c]=u.valueTexts[i].replace(/^\d{3}\s*/,""); } });
      return px(path,[sel("Mánuður",["13"],"top"),sel("Liður",["index","breakdown"]),sel("Undirvísitala",codes)]).then(function(d){
        var g={}, months={};
        d.forEach(function(r){ var c=r.k[2], m=r.k[0]; months[m]=1; g[c]=g[c]||{ idx:{}, w:0 }; if(r.k[1]==="index") g[c].idx[m]=r.v; else g[c].w=r.v; });
        var ms=Object.keys(months).sort(), m1=ms[ms.length-1], m0=ms[0], items=[];
        codes.forEach(function(c){ var x=g[c]; if(x && x.idx[m1]>0 && x.idx[m0]>0) items.push([c, names[c], r1((x.idx[m1]/x.idx[m0]-1)*100), r2(x.w)]); });
        return { m:ym(m1), from:ym(m0), items:items };
      });
    });
  };
  /* Atvinnuleysi, árstíðaleiðrétt, 16-74 ára */
  P.unemp=function(){
    return px("Samfelag/vinnumarkadur/vinnumarkadsrannsokn/1_manadartolur/VIN00002.px",[sel("Mánuður",["25"],"top"),sel("Kyn/aldur",["0"]),sel("Eining",["7"])]).then(function(d){
      return { m:d.map(function(r){ return ym(r.k[0]); }), v:d.map(function(r){ return r.v; }) };
    });
  };
  /* Vísitala markaðsverðs íbúðarhúsnæðis eftir svæðum, frá 2000 */
  P.house=function(){
    return px("Efnahagur/visitolur/1_vnv/3_greiningarvisitolur/VIS01106.px",[sel("Vísitala",["RI_total","RI_cap_mult","RI_cap_single","RI_outside_cap"])]).then(function(d){
      var g=byKey(d,1), m=g.RI_total.map(function(r){ return ym(r.k[0]); });
      function s(k){ return g[k].map(function(r){ return r.v; }); }
      return { m:m, tot:s("RI_total"), capM:s("RI_cap_mult"), capS:s("RI_cap_single"), out:s("RI_outside_cap") };
    });
  };
  /* Launavísitala, 12 mánaða breyting, og kaupmáttur launa (launavísitala á móti vísitölu neysluverðs) */
  P.wages=function(){
    return Promise.all([
      px("Samfelag/launogtekjur/2_lvt/1_manadartolur/LAU04000.px",[sel("Mánuður",["13"],"top"),sel("Eining",["index"])]),
      px("Efnahagur/visitolur/1_vnv/1_vnv/VIS01000.px",[sel("Vísitala",["CPI"]),sel("Liður",["index"]),sel("Mánuður",["30"],"top")])
    ]).then(function(r){
      var w=r[0], c={}; r[1].forEach(function(x){ c[x.k[0]]=x.v; });
      var a=w[0], b=w[w.length-1];
      var wy=b.v/a.v-1, cy=c[b.k[0]]/c[a.k[0]]-1;
      return { m:ym(b.k[0]), w:r1(wy*100), cpi:r1(cy*100), k:r1(((1+wy)/(1+cy)-1)*100) };
    });
  };
  /* Gengi: viðmiðunargengi Seðlabanka Evrópu */
  P.fx=function(){
    function ecb(c){ return getText("https://data-api.ecb.europa.eu/service/data/EXR/D."+c+".EUR.SP00.A?lastNObservations=1&format=csvdata").then(function(t){ var rows=csv(t), h=rows[0], r=rows[1]; return { d:r[h.indexOf("TIME_PERIOD")], v:parseFloat(r[h.indexOf("OBS_VALUE")]) }; }); }
    return Promise.all([ecb("ISK"),ecb("USD")]).then(function(r){ return { d:r[0].d, eur:r2(r[0].v), usd:r2(r[0].v/r[1].v) }; });
  };
  /* Mannfjöldi í lok ársfjórðungs */
  P.pop=function(){
    return px("Ibuar/mannfjoldi/1_yfirlit/arsfjordungstolur/MAN10001.px",[sel("Ársfjórðungur",["5"],"top"),sel("Sveitarfélag",["IS"]),sel("Kyn og ríkisfang",["0"])]).then(function(d){
      return { q:d.map(function(r){ return ym(r.k[0]); }), v:d.map(function(r){ return r.v; }) };
    });
  };
  /* Hagvöxtur: breyting vergrar landsframleiðslu frá sama ársfjórðungi árið áður */
  P.gdp=function(){
    return px("Efnahagur/thjodhagsreikningar/landsframl/2_landsframleidsla_arsfj/THJ01601.px",[sel("Mælikvarði",["2"]),sel("Skipting",["14"]),sel("Ársfjórðungur",["12"],"top")]).then(function(d){
      return { q:d.map(function(r){ return ym(r.k[2]); }), v:d.map(function(r){ return r.v; }) };
    });
  };

  function load(){
    var keys=Object.keys(P);
    return Promise.allSettled(keys.map(function(k){ return P[k](); })).then(function(res){
      var D={ asOf:new Date().toISOString() }, err={};
      res.forEach(function(r,i){ if(r.status==="fulfilled") D[keys[i]]=r.value; else err[keys[i]]=String(r.reason&&r.reason.message||r.reason); });
      D.err=err;
      return D;
    });
  }

  /* ---- Kaupskrá HMS eftir póstnúmerum ----
     Notaðir eru nothæfir, fullbúnir samningar um eina íbúð (fjölbýli, sérbýli, einbýli).
     Borin eru saman síðustu 12 mánuðir og 12 mánuðirnir þar á undan, eftir útgáfudegi samnings. */
  var HBS={101:1,102:1,103:1,104:1,105:1,107:1,108:1,109:1,110:1,111:1,112:1,113:1,116:1,162:1,170:1,200:1,201:1,203:1,206:1,210:1,212:1,220:1,221:1,225:1,270:1,271:1,276:1};
  function med(a){ if(!a.length) return null; a.sort(function(x,y){ return x-y; }); var h=a.length>>1; return a.length%2?a[h]:(a[h-1]+a[h])/2; }
  function kaupskra(text){
    var lines=text.split(/\r?\n/), h=lines[0].split(";"), I={};
    h.forEach(function(c,i){ I[c.trim()]=i; });
    var rows=[], cnt={}, maxD="", today=new Date().toISOString().slice(0,10), sv={};
    for(var i=1;i<lines.length;i++){
      var c=lines[i].split(";"); if(c.length<h.length) continue;
      var d=c[I.UTGDAG].slice(0,10); if(d>maxD && d<=today) maxD=d;
      rows.push(c); cnt[c[I.SKJALANUMER]]=(cnt[c[I.SKJALANUMER]]||0)+1;
      var pn=c[I.POSTNR], s=c[I.SVEITARFELAG].trim(); sv[pn]=sv[pn]||{}; sv[pn][s]=(sv[pn][s]||0)+1;
    }
    /* Samningar berast kaupskrá með nokkurra vikna töf, svo síðasti mánuðurinn er ekki talinn með */
    var end=new Date(Date.parse(maxD+"T00:00:00Z")-30*864e5); maxD=end.toISOString().slice(0,10);
    var a=new Date(end), b=new Date(end);
    a.setUTCFullYear(a.getUTCFullYear()-1); b.setUTCFullYear(b.getUTCFullYear()-2);
    var A=a.toISOString().slice(0,10), B=b.toISOString().slice(0,10), G={};
    function grp(k){ return G[k]=G[k]||{ ppm:[], price:[], ppm0:[] }; }
    rows.forEach(function(c){
      var d=c[I.UTGDAG].slice(0,10); if(d<=B || d>maxD) return;
      var t=c[I.TEGUND]; if(t!=="Fjölbýli" && t!=="Sérbýli" && t!=="Einbýli") return;
      if(c[I.FULLBUID]!=="1" || c[I.ONOTHAEFUR_SAMNINGUR]!=="0" || cnt[c[I.SKJALANUMER]]!==1) return;
      var price=parseFloat(c[I.KAUPVERD])*1000, m2=parseFloat(String(c[I.EINFLM]).replace(",",".")), pn=c[I.POSTNR];
      if(!(price>0 && m2>=20 && m2<=600)) return;
      var ppm=price/m2; if(ppm<50000 || ppm>4000000) return;
      [pn, HBS[pn]?"hbs":"land_ut", "allt"].forEach(function(k){ var g=grp(k); if(d>A){ g.ppm.push(ppm); g.price.push(price); } else g.ppm0.push(ppm); });
    });
    var out={ to:maxD, from:A, rows:{} };
    Object.keys(G).forEach(function(k){
      var g=G[k], n=g.ppm.length, m1=med(g.ppm), m0=med(g.ppm0);
      var row={ n:n, n0:g.ppm0.length, ppm:Math.round(m1||0), price:Math.round(med(g.price)||0), ch:(n>=20 && g.ppm0.length>=20)?r1((m1/m0-1)*100):null };
      if(sv[k]){ row.sv=Object.keys(sv[k]).sort(function(x,y){ return sv[k][y]-sv[k][x]; })[0]; }
      out.rows[k]=row;
    });
    return out;
  }

  /* Kaupskráin er á latin1 (windows-1252) sniði, ekki UTF-8 */
  function loadKaupskra(url){
    return fetch(url||KS).then(function(r){ if(!r.ok) throw new Error("kaupskrá "+r.status); return r.arrayBuffer(); })
      .then(function(b){ return kaupskra(new TextDecoder("windows-1252").decode(b)); });
  }
  /* Sækir aðeins enda skrárinnar (um 25 mánuði) með Range-fyrirspurn, til vara ef daglega samantektin næst ekki */
  function loadKaupskraTail(bytes){
    function part(range){ return fetch(KS,{ headers:{ Range:range } }).then(function(r){ if(!r.ok) throw new Error("kaupskrá "+r.status); return r.arrayBuffer(); }).then(function(b){ return new TextDecoder("windows-1252").decode(b); }); }
    return Promise.all([part("bytes=0-1023"), part("bytes=-"+(bytes||7500000))]).then(function(r){
      var head=r[0].split(/\r?\n/)[0], tail=r[1].slice(r[1].indexOf("\n")+1);
      return kaupskra(head+"\n"+tail);
    });
  }
  var KS="https://frs3o1zldvgn.objectstorage.eu-frankfurt-1.oci.customer-oci.com/n/frs3o1zldvgn/b/public_data_for_download/o/kaupskra.csv";

  return { load:load, parts:P, kaupskra:kaupskra, loadKaupskra:loadKaupskra, loadKaupskraTail:loadKaupskraTail, KAUPSKRA:"https://frs3o1zldvgn.objectstorage.eu-frankfurt-1.oci.customer-oci.com/n/frs3o1zldvgn/b/public_data_for_download/o/kaupskra.csv" };
})();
if(typeof module!=="undefined") module.exports=HT;
