# QA animasi 3D — daftar uji di perangkat nyata

Semua pemeriksaan yang bisa dilakukan tanpa browser sudah otomatis (`npm run audit:scene`). Yang tersisa
hanya bisa dinilai di perangkat nyata: **kelancaran GPU, tampilan, dan rasa gerak**. Dokumen ini
memandu itu.

## 0. Persiapan

1. `npm run build && npm run preview`, buka di perangkat yang diuji (HP: pakai IP laptop di jaringan yang sama).
2. Tambahkan `?scene=debug` di URL. Panel kecil muncul di kiri bawah:
   - `fps` (halus), `worst` (frame terlambat), `slow a/b` (jumlah frame > 1,5× target dari total),
   - `GPU` (nama GPU), `draw/pts/lines` (beban render), `scroll`, dan nilai tiap act.
3. Setelah selesai scroll dari atas ke bawah, tekan **Salin laporan** dan kirim hasilnya apa adanya.

Parameter lain: `?scene=off` (paksa SVG, untuk pembanding), `?scene=lite|mobile|full` (paksa tier).

## 1. Kriteria lulus

| Perangkat | fps | slow/frames | Catatan |
|---|---|---|---|
| Laptop/desktop | ≥ 55 | < 2% | tier `full`, dpr hingga 2 |
| Android kelas menengah | ≥ 45 | < 5% | seharusnya tier `mobile` atau `lite` |
| iPhone | ≥ 50 | < 3% | cek juga tidak ada "context lost" |
| Semua | — | — | tidak ada error di console; halaman tetap bisa dipakai saat 3D mati |

Jika fps turun, panel akan menunjukkan `dpr` turun ke 1 lebih dulu, lalu 3D otomatis mati (SVG kembali).
Itu perilaku yang diharapkan di perangkat yang terlalu lemah. Kalau terjadi di perangkat yang seharusnya kuat,
itu temuan penting: kirim laporannya.

## 2. Skenario (centang satu per satu)

**Hero**
- [ ] Garis menggambar diri, node muncul bertahap, tidak ada kedipan saat SVG memudar ke 3D.
- [ ] Gelombang cahaya merambat dari terminal ke seluruh jaringan (tiap baris `✓` dan sekali per putaran ketikan).
- [ ] Parallax mengikuti pointer (desktop). Di HP tidak ada parallax.
- [ ] Teks hero tetap terbaca di atas jaringan (sisi kiri sengaja redup).

**Layanan**
- [ ] Node terbang ke lima klaster saat section mendekat; klaster menempel di sudut kanan-atas kartu dan ikut bergerak saat scroll.
- [ ] Hover kartu menyalakan klasternya dan meredupkan yang lain (HP: kartu yang melewati tengah layar).
- [ ] Teks di kartu kaca tetap terbaca.

**Cara Kerja**
- [ ] Klaster berubah jadi pipeline; gerbang melingkari nomor 01–04; paket cahaya mengikuti scroll, gerbang menyala satu per satu, ada kilatan di ujung.
- [ ] Mobile: pipeline vertikal di sisi kiri, tidak menutupi teks.

**Portfolio & Testimoni**
- [ ] Jaring tipis di margin, tidak mengganggu kartu.
- [ ] Buka video testimoni: panel debug menampilkan `⏸ paused`, video tidak patah. Tutup: 3D lanjut.
- [ ] Di zona testimoni panel menampilkan `○ idle` (render berhenti) dan scroll tetap mulus.

**CTA**
- [ ] Node berkumpul jadi globe + orbit + inti; orbit tidak menabrak eyebrow/headline.
- [ ] Hover tombol "Hubungi Kami": inti membesar, komet melaju. HP: tap memberi satu denyut.
- [ ] Tanpa 3D (`?scene=off`): placeholder menampilkan logo K, tidak ada ruang kosong yang janggal.

**Ketahanan**
- [ ] Scroll sangat cepat ke bawah lalu ke atas: tidak ada lompatan/patah, state kembali benar.
- [ ] Refresh di tengah halaman: scene langsung di state yang benar (tanpa memutar ulang transisi).
- [ ] Ganti tab lalu kembali: render berhenti saat tab tersembunyi, lanjut saat kembali.
- [ ] Putar layar HP / ubah ukuran jendela: layout, klaster, dan pipeline menyesuaikan.
- [ ] `prefers-reduced-motion` aktif: hanya SVG, tidak ada 3D.
- [ ] Mode hemat data: hanya SVG.

## 3. Lighthouse (mobile preset)

Jalankan dua kali, dibandingkan: `?scene=off` (pembanding) dan tanpa parameter.

| Metrik | Harapan |
|---|---|
| Performance | selisih ≤ 5 poin |
| LCP | tidak berubah (3D dimuat setelah load dan idle) |
| CLS | 0 (canvas fixed, placeholder logo punya tinggi tetap) |
| TBT | tidak naik berarti |

Muatan awal sudah diukur: **+2,9 KB gzip** (59,7 → 62,6 KB). Engine 3D (~138 KB gzip) dimuat lazy.

## 4. Yang diperiksa otomatis (`npm run audit:scene`)

1. TypeScript strict pada `src/lib/scene`.
2. Setiap atribut dan uniform yang dipakai shader tersedia; semua nilai tetap terhingga; data graph sehat untuk 30–200 node.
3. Timeline scroll pada geometri desktop dan HP yang realistis: urutan act, tidak ada transisi tumpang-tindih, finale selalu tercapai di dasar halaman.
4. Engine dengan renderer palsu: loop berhenti/bangun, zona diam, resize, jeda modal, tab tersembunyi, fallback perangkat lambat, `destroy()`.
5. Kompilasi 24 tahap shader dengan `glslangValidator` (dilewati jika tidak terpasang).

Yang **tidak** bisa diperiksa tanpa GPU: tampilan akhir pixel per pixel dan fps nyata. Itu tugas daftar di atas.
