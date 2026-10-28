# RC Queue System

Website antrean bermain RC dengan durasi 3 menit per sesi. Frontend HTML/CSS/JavaScript di-host di Vercel; Firebase dipakai untuk database realtime, login admin, fungsi server, dan notifikasi push.

## Fitur

- Pendaftaran publik dengan nama dan nomor WhatsApp.
- Nomor antrean dibuat oleh server; nomor WhatsApp hanya ada di jalur privat untuk admin.
- Papan antrean publik realtime tanpa menampilkan nomor WhatsApp.
- Login admin melalui Firebase Authentication; beberapa akun admin didukung menggunakan custom claim `admin: true`.
- Admin dapat mulai sesi 180 detik, menyelesaikan sesi, atau melewati pemain.
- Database dikendalikan Cloud Functions; klien tidak dapat menulis status antrean langsung.
- FCM untuk pemberitahuan pendaftaran baru kepada admin, panggilan giliran kepada pemain, dan waktu habis.
- Timer di halaman menggunakan deadline sesi dan offset waktu server Firebase. UI mencapai `00:00` tepat di deadline berdasarkan waktu server yang tersinkronisasi; scheduler memfinalisasi status dan mengirim push pada pemeriksaan berikutnya (maksimum sekitar 1 menit setelah deadline).

## Struktur folder

```text
rc-queue-system/
├── public/
│   ├── index.html
│   ├── admin.html
│   ├── style.css
│   ├── app.js
│   ├── admin.js
│   ├── firebase-config.js
│   ├── firebase-messaging-sw.js
│   ├── manifest.json
│   └── icon.svg
├── functions/
│   ├── index.js
│   ├── package.json
│   └── set-admin.js
├── database.rules.json
├── firebase.json
├── .firebaserc.example
└── vercel.json
```

## A. Buat project Firebase

1. Buka https://console.firebase.google.com/ lalu buat project baru.
2. Di Project settings → General → Your apps, pilih ikon Web `</>` dan daftarkan aplikasi.
3. Salin konfigurasi aplikasi web ke `public/firebase-config.js` dan ganti semua nilai `GANTI_...` dengan nilai dari Firebase Console.
4. Buka **Build → Realtime Database** lalu buat database. Pilih lokasi dekat mayoritas pemain. Salin URL database yang benar ke `databaseURL` di `public/firebase-config.js`.
5. Buka **Build → Authentication → Sign-in method**, aktifkan **Email/Password**.
6. Di **Build → Realtime Database → Rules**, pasang isi file `database.rules.json` (bukan Test Mode), lalu klik Publish.
7. Di Project settings → Cloud Messaging, cari **Web Push certificates** lalu buat/generate key pair. Salin public key ke `vapidKey` di `public/firebase-config.js`.
8. Buka `public/firebase-messaging-sw.js` dan ganti semua placeholder dalam `firebaseConfig` agar SAMA PERSIS dengan `public/firebase-config.js`. File service worker ini harus ada di root website agar notifikasi background dapat diterima.

> `apiKey` konfigurasi web Firebase bukan kredensial admin. Jangan pernah memasukkan service-account JSON atau private VAPID key ke folder `public` atau Vercel. Hanya public VAPID key yang dipakai di frontend.

## B. Deploy fungsi server Firebase

Cloud Functions dan Scheduler diperlukan agar tindakan admin tervalidasi di server dan sesi dapat ditandai selesai otomatis. Untuk deployment fungsi dan scheduler, project Firebase mungkin perlu di-upgrade ke **Blaze (pay as you go)** dan menautkan akun billing. Aktifkan budget alerts sebelum penggunaan publik; biaya bergantung pada pemakaian.

1. Install Node.js 20 atau versi LTS yang kompatibel: https://nodejs.org/
2. Buka terminal pada folder project ini.
3. Install Firebase CLI:

   ```bash
   npm install -g firebase-tools
   firebase login
   ```

4. Ganti `GANTI_PROJECT_ID` dalam `.firebaserc.example`, lalu ubah nama file menjadi `.firebaserc`.
5. Deploy rules dan functions:

   ```bash
   firebase use --add
   firebase deploy --only database,functions
   ```

6. Jika CLI meminta mengaktifkan API atau membuat service account untuk Scheduler, ikuti prompt resminya. Pastikan deployment berhasil sebelum menguji website.

## C. Buat akun admin dan berikan hak akses

1. Di Firebase Console → Authentication → Users → Add user, buat akun email/password untuk setiap admin.
2. Berikan custom claim `admin: true` untuk setiap akun. Ini wajib; akun yang hanya terdaftar belum otomatis menjadi admin.
3. Cara memakai skrip Admin SDK dari lingkungan tepercaya yang sudah terautentikasi ke Google Cloud:

   ```bash
   cd functions
   npm install
   gcloud auth application-default login
   # Windows PowerShell:
   $env:GCLOUD_PROJECT="PROJECT_ID_KAMU"
   node set-admin.js admin@contoh.com
   ```

   Jika perintah `gcloud` belum tersedia, install Google Cloud CLI terlebih dahulu. Alternatifnya jalankan skrip yang sama dari Cloud Shell dengan project yang benar. Ulangi untuk setiap email admin.
4. Minta admin logout lalu login kembali di `/admin.html` agar token akses diperbarui.

**Keamanan:** jangan pernah menaruh service-account key di `public/`, mengirimkannya lewat chat, atau commit ke GitHub.

## D. Deploy website ke Vercel

1. Push folder project ke repository GitHub. Jangan commit file service account, private key, atau password.
2. Masuk ke https://vercel.com/ → Add New → Project, import repository tersebut.
3. Karena frontend hanya file statis di folder `public`, set **Output Directory** menjadi `public`. Build command boleh dikosongkan / tidak digunakan.
4. Deploy. Pastikan website memakai HTTPS (Vercel menyediakannya secara default).
5. Uji URL publik `/` dan `/admin.html`.
6. Kalau domain khusus digunakan, tambahkan domain tersebut pada Firebase Authentication → Settings → Authorized domains bila diperlukan oleh setup Firebase yang dipakai.

> Jangan menjalankan `firebase deploy --only hosting` bila tujuan hosting frontend adalah Vercel; perintah itu menerbitkan frontend ke Firebase Hosting, bukan Vercel. `firebase deploy --only database,functions` hanya untuk rules dan backend.

## E. Cara menggunakan

### Pemain
1. Buka URL Vercel, isi nama dan nomor WhatsApp, tekan **Daftar bermain**.
2. Tekan **Aktifkan notifikasi** dan izinkan notifikasi browser. Sebaiknya lakukan setelah daftar supaya token push terikat ke tiket.
3. Biarkan browser menyimpan tiket di perangkat tersebut. Status antrean tampil di kartu tiket dan papan publik.
4. Saat admin menekan Mulai, pemain menerima push jika browser/perangkat mendukung FCM dan izin sudah diberikan. Saat sesi habis, backend mengirim notifikasi waktu habis setelah scheduler memproses deadline.

### Admin
1. Buka `/admin.html`, login menggunakan akun dengan custom claim `admin: true`.
2. Tekan **Aktifkan notifikasi admin** dan izinkan notifikasi browser.
3. Tekan **Mulai 3 menit** pada pemain yang menunggu. Backend menolak jika sesi lain masih aktif.
4. Tekan **Selesaikan sesi** bila selesai lebih awal, atau **Lewati** bila perlu.

## F. Aturan database dan privasi

- Semua penulisan antrean dilakukan melalui callable Cloud Functions dan Firebase Admin SDK.
- `privateQueue` hanya dapat dibaca akun yang memiliki custom claim admin. Nomor WhatsApp dan hash nomor disimpan di sini.
- `publicQueue` hanya menampilkan pemain yang menunggu atau sedang bermain; nomor WhatsApp tidak dipublikasikan.
- `publicTickets` berisi status yang aman untuk kartu tiket pemain.
- `pushTokens` tidak dapat dibaca/ditulis oleh klien secara langsung.
- Nomor WhatsApp adalah data pribadi. Beri tahu pemain tujuan penggunaannya, batasi akses admin, dan hapus data yang tidak lagi dibutuhkan.

## G. Catatan penting sebelum penggunaan publik

1. Uji terlebih dahulu dengan beberapa perangkat dan akun admin.
2. FCM web membutuhkan browser yang mendukung Push API, izin notifikasi, HTTPS, konfigurasi VAPID, dan service worker. Mode penyamaran atau pengaturan hemat baterai bisa menghambat notifikasi.
3. Notifikasi otomatis untuk browser yang ditutup bergantung pada dukungan browser/OS. Pada iPhone, dukungan web push bergantung pada versi iOS dan pemasangan web app ke Home Screen.
4. `expireSessions` berjalan setiap menit: angka timer di halaman mencapai nol berdasarkan deadline server, tetapi perubahan status di database dan push akhir dapat terlambat sampai pemeriksaan scheduler berikutnya. Untuk eksekusi push yang benar-benar dijadwalkan tepat pada deadline, gunakan Cloud Tasks/Cloud Scheduler dengan billing dan pengaturan tambahan.
5. Nomor WhatsApp dicatat untuk identifikasi saja. Kode ini **tidak mengirim pesan WhatsApp**; notifikasi memakai browser push FCM.
6. Pertimbangkan Firebase App Check, batas pendaftaran/rate-limit, logging, dan budget alerts sebelum dibuka untuk trafik besar.
7. File konfigurasi saat ini menggunakan placeholder. Aplikasi tidak akan tersambung sampai nilai Firebase milik project sendiri diisi.

## Troubleshooting singkat

- **Pendaftaran gagal / `GANTI_...`:** isi semua konfigurasi Firebase di `public/firebase-config.js`.
- **Admin ditolak:** pastikan custom claim `admin: true` diberikan pada UID yang benar, lalu logout/login kembali.
- **Notifikasi tidak masuk:** pastikan public VAPID key benar, konfigurasi di service worker sama, izin browser `Allow`, dan situs memakai HTTPS.
- **Antrean tidak tampil:** periksa URL Realtime Database, rules yang dipublikasikan, dan log Cloud Functions.
- **Deploy functions gagal:** pastikan billing/API Scheduler/Cloud Functions aktif, Node runtime kompatibel, dan `firebase use` menunjuk project yang benar.
#   A n t r e a n - R C  
 