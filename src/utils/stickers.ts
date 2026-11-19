// src/utils/stickers.ts
// Static manifest of stickers bundled in public/stickers/ for Cloudflare Static Assets.

export interface StickerItem {
  id: string;
  label: string;
  url: string;
}

export const BUNDLED_STICKERS: readonly StickerItem[] = [
  { id: 'cooked', label: 'Cooked', url: '/stickers/cooked.png' },
  { id: 'dahsyat', label: 'Dahsyat', url: '/stickers/dahsyat.png' },
  { id: 'ea', label: 'Ea', url: '/stickers/ea.png' },
  { id: 'geram', label: 'Geram', url: '/stickers/geram.png' },
  { id: 'gokil', label: 'Gokil', url: '/stickers/gokil.png' },
  { id: 'kalo-gw-malu', label: 'Malu', url: '/stickers/kalo-gw-malu-tuh-masa.png' },
  { id: 'kelasking', label: 'Kelas King', url: '/stickers/kelasking.png' },
  { id: 'laugh', label: 'Laugh', url: '/stickers/laugh.png' },
  { id: 'lelah', label: 'Lelah', url: '/stickers/lelah.png' },
  { id: 'logika', label: 'Logika', url: '/stickers/logika.png' },
  { id: 'pendidikan', label: 'Pendidikan', url: '/stickers/pendidikan.png' },
  { id: 'yatuhan', label: 'Ya Tuhan', url: '/stickers/yatuhan.png' },
  { id: 'anim-gif', label: 'Animated', url: '/stickers/z814a0zkw4jh1.gif' },
  { id: 'meme-1', label: 'Reaction 1', url: '/stickers/5fefec72fa64331ea4484cf6e52de55b.jpg' },
  { id: 'meme-2', label: 'Reaction 2', url: '/stickers/9868edc6e3bb7d3c5ce94dcbf4d2fbbc.jpg' },
  { id: 'meme-3', label: 'Reaction 3', url: '/stickers/af2d7ac5a49679074f3f4610b4de1a0d.jpg' },
  { id: 'meme-4', label: 'Reaction 4', url: '/stickers/gkzzv7ma4aatflx-67128078ed641530cb373742.jpg' },
  { id: 'wa-1', label: 'Photo 1', url: '/stickers/WhatsApp%20Image%202026-08-05%20at%204.59.37%20PM.jpeg' },
  { id: 'wa-2', label: 'Photo 2', url: '/stickers/WhatsApp%20Image%202026-08-05%20at%204.59.40%20PM.jpeg' },
];
