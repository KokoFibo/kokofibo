# Penyetelan animasi 3D — angka mana mengubah apa

Semua angka di bawah masih estimasi dari pratinjau, bukan hasil uji di perangkat. Ubah satu per satu,
lalu lihat dengan `?scene=debug`.

## Kecerahan dan keterbacaan

| Yang ingin diubah | Di mana | Catatan |
|---|---|---|
| Opasitas canvas per act | `journey.ts`, nilai `opacity` di `measure()` | hero 1, layanan 0,9, cara kerja 0,95, portfolio 0,22, testimoni 0,12, CTA 0,9 |
| Canvas di HP lebih redup | `global.css`, `html.scene-3d [data-scene-root] { opacity: .55 }` | hanya < 1024 px |
| Sisi kiri hero lebih/kurang redup | `global.css`, `mask-image` (0,12 → 1 di 42%) | desktop saja |
| Transparansi kartu layanan | akhir `global.css` (0,55 normal, 0,42 hover) | makin kecil = klaster makin terlihat, teks makin berisiko |
| Kecerahan garis tiap layout | `constellation.ts`, argumen alpha `edgeSet(...)` | jaring 0,36 · klaster 0,5 · pipeline 0,55 · rel 0,45 · globe 0,7 |
| Lantai kecerahan bagian yang belum menyala (pipeline) | `shaders.ts`, `mix(0.3, 1.0, vLit)` | |

## Ukuran dan bentuk

| Yang ingin diubah | Di mana |
|---|---|
| Jumlah node/pulsa per tier | `capability.ts`, `PRESETS` |
| Radius klaster di kartu | `journey.ts`, `clusterPx` (0,38 × lebar kartu, 90–150 px) |
| Posisi hub di kartu | `journey.ts`, offset `- 12` / `+ 12` (desktop) dan `- 64` / `+ 22` (HP) |
| Ketebalan gerbang pipeline | `journey.ts`, `gatePx` (0,14 × lebar kolom, 38–56 px) · pipih elips: `shaders.ts`, `r * 0.4` di `pipeWorld` |
| Ukuran globe finale | `shaders.ts`, `coreScale()` (0,8) **dan** `engine.ts`, `journey.logoPx * 0.8` (harus sama) · ukuran placeholder: `index.astro`, `h-56 sm:h-72` |
| Radius orbit | `shaders.ts`, `ringPoint()` (1,3 / 1,45 / 1,6 × radius globe) |
| Sebaran halo | `graph.ts`, `1.75 + rnd() * 0.6` · kepipihan: `shaders.ts`, `rr * 0.6` |
| Pembagian node di finale | `graph.ts` bagian 8 (globe 56%, orbit 10% × 3, sisanya halo) |

## Waktu dan gerak

| Yang ingin diubah | Di mana |
|---|---|
| Kapan tiap act mulai/selesai | `journey.ts`, `measure()`: `pipeStart`, `pipeDone`, `progDone`, dst. (satuan: tinggi layar `vh`) |
| Seberapa lama hero bertahan sebelum bubar | `journey.ts`, `0.12 * vh` |
| Kelembaman scroll (kehalusan) | `engine.ts`, `dt * 6` (act) dan `dt * 8` (paket) · makin besar = makin responsif |
| Kekuatan parallax | `engine.ts`, `0.55` dan `0.35` |
| Kecepatan putar globe / orbit / sweep | `shaders.ts`: `uTime * 0.12`, `ringSpeed()`, `uTime * 1.1` |
| Gelombang terminal: kecepatan, jangkauan, kekuatan | durasi `dt / 1.9` di `constellation.ts`; jangkauan `18.0` dan lebar `1.3` di `waveBoost()`; kekuatan `1.6` (node) dan `2.5` (garis) |
| Seberapa cepat kualitas diturunkan | `engine.ts`, `monitor()`: ambang `1.45×` target, jendela 90 frame |

## Aturan praktis

- Kalau terasa **terlalu ramai**: turunkan alpha garis dulu, baru jumlah node.
- Kalau terasa **terlalu sepi**: naikkan opasitas act yang bersangkutan, bukan kecerahan global.
- Kalau fps turun: kurangi `nodeCount` pada tier yang bersangkutan; biaya CPU di JavaScript hanya ~30 µs per frame,
  jadi beban ada di GPU (resolusi `dpr` dan ukuran sprite).
