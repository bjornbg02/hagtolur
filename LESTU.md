# Hagtölur, dagleg gagnasöfnun

Þessi mappa er afrit af GitHub-geymslunni sem uppfærir hagtölusíðuna á bjornberg.is.

- `safna.cjs` sækir allar tölurnar og tekur saman kaupskrá HMS eftir póstnúmerum.
- `hagtolur_lib.js` er sami gagnasafnari og síðan notar. Hann er afritaður hingað þegar `build.ps1` er keyrt.
- `.github/workflows/uppfaera.yml` keyrir söfnunina á hverjum degi kl. 6:15 (UTC).
- Niðurstaðan er `docs/hagtolur.json`, sem GitHub Pages birtir. Slóðin á hana fer í `DATA_URL` í `src/sparnadur/hagtolur.html`.

Ef einhver uppspretta svarar ekki standa tölurnar frá deginum áður og skráð er í `err` hvað náðist ekki.
Ef fimm eða fleiri uppsprettur bregðast merkir GitHub keyrsluna sem misheppnaða og sendir tölvupóst.
