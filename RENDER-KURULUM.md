# Render'a Kurulum Rehberi

## Önce bilmen gereken (önemli)
Bot verilerini (coin, seviye, envanter...) tek bir dosyada (`jester.db`) saklar. Render'da:

- **Ücretsiz plan bu bot için uygun DEĞİL:** dosyalar her yeniden başlatmada/yeni sürümde silinir (tüm oyuncu verisi gider) ve 15 dk boşta kalınca servis uyur (bot çevrimdışı olur). Ücretsiz serviste disk de eklenemez.
- **Doğru kurulum:** *Background Worker* (Starter, yaklaşık 7 $/ay) + *Kalıcı Disk* (1 GB, yaklaşık 0,25 $/ay). Toplam ≈ **7,25 $/ay**. Güncel fiyatı render.com/pricing sayfasından doğrula.

Bu klasördeki `render.yaml` dosyası bu kurulumu otomatik yapar.

## Adımlar
1. **GitHub hesabı** aç (github.com) ve **GitHub Desktop** uygulamasını kur (desktop.github.com).
2. GitHub Desktop → **File → Add local repository** → `jester-game` klasörünü seç. "Not a Git repository" derse **create a repository** de.
3. **Commit to main** → sonra **Publish repository**. ⚠️ **"Keep this code private" kutusu işaretli olsun.**
   `.env` dosyan ve `data` klasörün `.gitignore` sayesinde **yüklenmez** (token'ın GitHub'a çıkmaz).
4. **render.com** → GitHub ile giriş yap → **New + → Blueprint** → az önceki repoyu seç.
5. Render senden 3 değer ister: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` (`.env` dosyandaki değerlerin aynısı). Gir ve **Apply**.
   Ödeme bilgisi isteyecek (Worker + disk ücretli).
6. Birkaç dakika sonra **Logs** sekmesinde `✅ ... olarak giriş yapıldı` yazmalı.
7. ⚠️ **Bilgisayarındaki botu kapat** (cmd penceresini kapat). Aynı token ile iki bot açık kalırsa her komuta iki cevap gelir.

## Notlar
- Komutlar her açılışta otomatik kaydedilir, `npm run deploy-commands` çalıştırmana gerek yok.
- Kodda değişiklik yapıp GitHub Desktop'tan **Push** edersen Render otomatik yeni sürümü kurar (veriler diskte kaldığı için silinmez).
- Veriler `/var/data/jester.db` dosyasındadır. Render diski her 24 saatte otomatik yedekler; ayrıca bot her 6 saatte `/var/data/backups` içine yedek alır.
- Bilgisayarındaki test verilerini taşımana gerek yok; Render'da sıfırdan başlar.

## Elle kurmak istersen (Blueprint yerine)
**New + → Background Worker** → repoyu seç → Runtime: Node → Build Command: `npm install` → Start Command: `npm run start:render` → Instance: **Starter**.
**Environment**'a şunları ekle: `NODE_VERSION=22.14.0`, `DATA_DIR=/var/data`, `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`.
**Disks → Add Disk**: Mount Path `/var/data`, Size `1 GB`.
