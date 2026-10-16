# Kokofibo — Company Website

Website resmi Kokofibo, dibangun dengan **Astro**, **Tailwind CSS**, dan **GSAP**.

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:4321`.

## Build untuk production

```bash
npm run build
npm run preview
```

Hasil build ada di folder `dist/`, siap di-upload ke hosting static mana pun
(Vercel, Netlify, Cloudflare Pages, atau shared hosting biasa).

## Animasi 3D (Three.js) — M1 sampai M4

Halaman Home memakai konstelasi jaringan 3D ("living system"). Node yang sama berpindah bentuk
mengikuti scroll. Kode ada di `src/lib/scene/`, di-mount lewat `src/components/SceneCanvas.astro`.

**Alur scroll saat ini**

| Section | Bentuk scene | Canvas |
|---|---|---|
| Hero | Konstelasi bebas, garis menggambar diri, paket data, parallax pointer. Tiap baris `✓` di terminal (dan sekali per putaran ketikan) mengirim **gelombang cahaya** dari terminal ke seluruh jaringan | 100% |
| Layanan | 5 klaster menempel di sudut kanan-atas tiap kartu; hover menyalakan klasternya | 90% |
| Cara Kerja | Klaster berubah jadi **pipeline**: 4 gerbang (cincin) di nomor 01–04 + gerbang output "shipped". Paket cahaya mengikuti scroll, gerbang menyala satu per satu, ada kilatan saat paket tiba | 95% |
| Portfolio | Node mundur jadi jaring tipis di margin kiri dan kanan | 22% |
| Testimoni | Hampir diam. Render **berhenti** setelah nilai settle, dan dijeda saat modal video terbuka | 12% |
| CTA | Semua node berkumpul membentuk **inti reaktor** di atas headline: globe wireframe (lattice Fibonacci) yang berputar pelan, tiga orbit miring dengan manik dan komet, inti bercahaya, dan halo. Radar sweep menyapu globe tiap beberapa detik. Hover/fokus tombol "Hubungi Kami" membuat inti membesar dan komet melaju (di HP: sekali per tap) | 90% |

**Cara kerja singkat**

- `journey.ts` membaca posisi section dan elemen (`data-scene`, `data-hub`, `data-stage`) lalu membangun
  keyframe scroll. Engine mengambil sampel `scrollY` tiap frame dan menghaluskannya, tanpa scroll-jacking.
  Timing pipeline diikat ke posisi gerbang pertama dan terakhir, jadi pas di desktop (baris) maupun mobile (kolom).
- Semua node dan garis memakai satu rantai posisi di shader (`MORPH_CHUNK`):
  hero → klaster → pipeline → rel. Semua morph berjalan di GPU, dengan jadwal acak per node.
- Atribut yang harus ada di markup: `data-scene="hero|services|process|portfolio|testimonials"`,
  `data-hub="web|ai|trading|hr|support"` pada kartu layanan, dan `data-stage="0..3"` pada langkah Cara Kerja.
- Kartu layanan jadi semi-transparan (kaca) hanya saat 3D aktif (akhir `global.css`).
- Jeda video: `SceneCanvas.astro` mengamati class `hidden` pada `.testimonial-modal`.
- Finale CTA: bentuk dan pembagian node ada di `buildGraph` bagian 8 (globe 56%, tiga orbit 10% per orbit,
  sisanya halo). Garis orbit, komet, dan glow inti adalah geometri terpisah yang memakai fungsi `ringPoint()`
  yang sama di shader, jadi komet selalu tepat di jalur orbit. Penanda di markup: `data-logo-anchor`
  (placeholder di atas headline CTA; berisi SVG logo K sebagai fallback tanpa 3D) dan `data-scene="cta"`.
  Ukuran globe = 0.8 × ukuran placeholder.
- Gelombang terminal: terminal mengirim event `kf:pulse` (lihat skrip di `index.astro`); engine menangkapnya
  hanya saat hero terlihat.

**Keamanan performa dan fallback**

- SVG `NetworkField` tetap ada sebagai fallback (`data-scene-fallback`).
- Three.js (~138 kB gzip) dimuat lazy setelah halaman selesai load.
- Otomatis nonaktif untuk `prefers-reduced-motion`, hemat data, jaringan 2G, tanpa WebGL2,
  atau perangkat yang terlalu lambat (diukur saat runtime).
- Tier perangkat: `full` (140 node) / `mobile` (70) / `lite` (45, 30 fps).
- QA cepat: `?scene=off`, `?scene=lite`, `?scene=mobile`, `?scene=full`, `?scene=debug`.
- Render berhenti sendiri saat tab tidak aktif, saat tidak terlihat, saat modal video terbuka,
  dan di zona testimoni setelah scene diam. Di CTA, render tetap berjalan (shimmer logo) selama tab aktif.

## QA dan penyetelan 3D

- `npm run audit:scene` menjalankan semua pemeriksaan offline (type-check, audit shader, simulasi timeline scroll,
  smoke test engine, kompilasi GLSL) tanpa browser.
- Tambahkan `?scene=debug` di URL untuk panel fps/GPU/state dengan tombol **Salin laporan**.
- Daftar uji di perangkat nyata: [`docs/3D-QA.md`](docs/3D-QA.md). Tabel angka yang bisa disetel: [`docs/3D-TUNING.md`](docs/3D-TUNING.md).

## Struktur halaman

- `/` — Home
- `/about` — Tentang Kami (profil Anton Phan & studio)
- `/portfolio` — Portfolio dengan filter kategori
- `/pricing` — Harga (tab: Web, Trading, HR & Payroll, Support)
- `/contact` — Kontak (form via `mailto:`)

## Catatan penting

**Gambar & ilustrasi:** karena environment ini tidak punya akses ke tool
image-generation, semua visual di situs (grafik jaringan di hero, ilustrasi
kartu portfolio, foto founder) dibuat sebagai **SVG kustom bergaya brand**,
bukan foto/gambar AI raster. Ini membuat situs tetap ringan dan tajam di
semua ukuran layar. Kalau Anda ingin mengganti dengan foto asli atau gambar
AI (Midjourney, DALL·E, dsb.):

1. Simpan gambar di `public/images/`.
2. Ganti elemen `<svg>...</svg>` terkait di komponen (`NetworkField.astro`,
   `PortfolioCard.astro`, `about.astro`) dengan tag `<img src="/images/nama-file.jpg" />`.

**Form kontak:** saat ini `ContactForm.astro` membuka email client lewat
`mailto:`. Untuk kirim langsung ke server/inbox tanpa membuka email client,
sambungkan ke layanan seperti Formspree, atau buat Astro API route dan ganti
handler di bagian `<script>` pada file tersebut.

**Harga:** semua angka di `/pricing` adalah contoh/starting point — sesuaikan
di `src/pages/pricing.astro` (objek `plans`) dengan harga riil Anda.

**Domain & SEO:** `astro.config.mjs` sudah diset ke `https://kokofibo.com`
untuk keperluan sitemap & canonical URL — ganti kalau domainnya berbeda.
