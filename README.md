# Web Kelompok GOLANG (GitHub Pages)

Situs statis, tanpa server. Halaman `sertifikat.html` mengirim foto langsung ke repo lewat GitHub API
(foto → `assets/sertifikat/`, daftar → `data/sertifikat.json`).

## Setup upload (sekali saja)
1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.
   Repository access: *Only select repositories* → pilih repo web ini. Permissions: **Contents → Read and write**.
2. Buka `setup-token.html` (di situs / lokal), isi owner, nama repo, branch, token, dan password (`webgolang123`).
3. Download `sertifikat-config.js` hasilnya, timpa file lama, commit & push.
