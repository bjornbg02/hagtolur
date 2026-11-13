/* Keyrt daglega af GitHub. Sækir allar hagtölurnar og tekur saman kaupskrá HMS eftir póstnúmerum,
   og skrifar docs/hagtolur.json sem hagtölusíðan á bjornberg.is les.
   Ef einhver uppspretta svarar ekki eru tölurnar frá deginum áður látnar standa. */
const fs = require("fs");
const HT = require("./hagtolur_lib.js");
const OUT = "docs/hagtolur.json";

(async () => {
  let old = {};
  try { old = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch (e) {}
  const D = await HT.load();
  const err = D.err || {};
  delete D.err;
  try { D.postnr = await HT.loadKaupskra(); } catch (e) { err.postnr = String(e.message || e); }
  const out = Object.assign({}, old, D);
  out.err = err;
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  const n = Object.keys(err).length;
  console.log("Uppfært " + D.asOf + (n ? ". Náðist ekki: " + JSON.stringify(err) : ". Allt náðist."));
  if (n >= 5) process.exit(1); /* margar uppsprettur bilaðar: láta GitHub merkja keyrsluna sem misheppnaða */
})();
