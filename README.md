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
