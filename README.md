# 🃏 Jester Game Bot

Discord oyun botu: ekonomi, banka, market, evlilik, RPG, zindanlar, pet/antika/relik, madencilik, odunculuk, kumar oyunları ve daha fazlası.
Arkadaşının "Deathwish" botunun çalışan, **tek parça** hale getirilmiş ve **Jester Game** adına uyarlanmış kopyasıdır.

> **Önemli:** Veritabanı artık ayrı bir sunucu istemez. Tüm veriler `data/jester.db` dosyasında durur.

---

## 1) Gerekenler

1. **Node.js 22.13 veya üstü** → https://nodejs.org adresinden "LTS" sürümünü indirip kur. (Eski sürüm çalışmaz.)
2. Bu klasörü bilgisayarına çıkar (ZIP'i "Tümünü ayıkla").

Kurulumu kontrol et: bir terminal (Windows'ta klasörde adres çubuğuna `cmd` yazıp Enter) aç ve şunu yaz:
```
node --version
```
`v22...` veya daha büyük bir sayı görmelisin.

## 2) Botu Discord'da oluştur

1. https://discord.com/developers/applications → **New Application** → adı: `Jester Game`
2. Sol menü **Bot** → **Reset Token** → çıkan tokeni kopyala (⚠️ bu bir şifredir, kimseyle paylaşma).
3. Aynı sayfada aşağı in, **Privileged Gateway Intents** bölümünde **MESSAGE CONTENT INTENT**'i **aç** ve kaydet.
4. Sol menü **General Information** → **Application ID**'yi kopyala (CLIENT_ID budur).
5. Sol menü **OAuth2 → URL Generator**: **bot** ve **applications.commands** kutularını işaretle.
   Bot izinleri: *Send Messages, Embed Links, Manage Messages, Manage Roles, Read Message History, Use Slash Commands*.
   Çıkan linki tarayıcıda aç, botu **Jester Game** sunucuna ekle.
6. Discord'da **Ayarlar → Gelişmiş → Geliştirici Modu**'nu aç. Sunucu adına sağ tıkla → **Sunucu ID'sini Kopyala** (GUILD_ID budur).

## 3) Ayarlar

`.env.example` dosyasının adını `.env` yap ve içini doldur:

```
DISCORD_TOKEN=2. adımdaki token
DISCORD_CLIENT_ID=4. adımdaki Application ID
DISCORD_GUILD_ID=6. adımdaki sunucu ID'si
```

## 4) Çalıştır

Terminalde bu klasörde sırayla:

```
npm install
npm run deploy-commands
npm start
```

- `npm install` → sadece bir kere (discord.js'i indirir).
- `npm run deploy-commands` → komutları sunucuna kaydeder. Komut değişirse tekrar çalıştır.
- `npm start` → botu başlatır. Terminalde `✅ ... olarak giriş yapıldı` yazmalı. Terminali kapatırsan bot durur.

## 5) Yönetim paneli: `/setup`

Botun **bütün ayarları** tek bir merkezi panelde toplanmıştır. `/setup` yaz (sadece yöneticiler görür), menüden bir sistem seç:

| Bölüm | Neler ayarlanır |
|---|---|
| 💰 Ekonomi & Günlük | günlük ödül, seri artışı, seri tavanı |
| 🛒 Market | XP boost, kalkan, renk rolü fiyatı, pazar vergisi |
| 📋 Günlük Görevler | her görevin ödülü, hepsini bitirme bonusu |
| 🥷 Çalma | çalınan miktar, kademe (kaç çalmada artar), tavan, bekleme |
| ⛏️ Madencilik / 🪓 Odunculuk | bekleme (varsayılan 60 sn), enerji, işçi/kapasite/yemek fiyatları, satış-XP çarpanı, oyuncu verisi sıfırlama |
| 🎣 Balıkçılık | bekleme, yem fiyatı, satış/XP çarpanı |
| ⚔️ Kapışma | bekleme, ganimet oranı ve tavanı, şans sınırları |
| 🗡️ Zindan & RPG | XP/coin/bekleme çarpanları, stat fiyatı |
| 🏇 At Yarışı | 4 atın adı, ödeme çarpanı, bahis sınırları |
| 🎰 Slot & Blackjack, 🎲 Zar/Yazı-Tura/Tahmin | bahis sınırları, günlük haklar, kazanç/kayıp |
| 💍 Evlilik, 🎙️ Ses, 🛡️ Moderasyon | yüzük fiyatı, ses ödülü, spam ve yasaklı kelimeler |
| 📈 Seviye Sistemi | XP miktarı, seviye gereksinimi, bildirim kanalı ve mesajı, **seviye rolleri** |

- **✏️ Düzenle** düğmesi bir form açar; sayıları yazıp gönderirsin. Hatalı bir değer varsa **hiçbir şey kaydedilmez** ve hangisinin yanlış olduğu söylenir.
- **🟢/🔴 düğmeleri** sistemi anında açar/kapatır. **♻️ Varsayılana Dön** o bölümü sıfırlar.
- Değişiklikler **anında** geçerli olur, botu yeniden başlatmak gerekmez.

### Seviye rolleri
`/setup` → **Seviye Sistemi** → **➕ Rol Ödülü Ekle / Düzenle**: seviye ve rol ID'sini yaz. 5, 10, 20, 30, 45, 60, 70. seviyeler önerilir ama **herhangi bir seviye** (1-1000) eklenebilir. Üye o seviyeye ulaşınca rol otomatik verilir; rol ödülünü sonradan eklersen üyeler bir sonraki mesajlarında alır.
Rol ID'si için: Discord'da Geliştirici Modu açıkken Sunucu Ayarları → Roller → role sağ tık → ID'yi Kopyala. **Botun rolü, verilecek rollerin üstünde olmalı.**
Bildirim mesajında şunlar yazılabilir: `{mention}` `{user}` `{level}` `{coins}` `{server}` `{role}`.

## 6) Sunucuda ilk kurulum (yönetici olarak)

- `/setup` → yönetim paneli (yukarıda).
- **Bot rolü**, markette satacağın rollerin **üstünde** olmalı (Sunucu Ayarları → Roller; botun rolünü yukarı sürükle).
- `/market-yonet ekle rol:@Rol fiyat:5000` → rol marketine rol ekler.
- `/renkrolekle rol:@Kırmızı fiyat:4000` → renk rolü ekler.
- Yasaklı kelime listesi (isteğe bağlı): `server_settings` tablosunda `banned_words` anahtarı, virgülle ayrılmış kelimeler.

## 7) Komutlar

`/yardim` botun içinde tam listeyi gösterir. Kısaca:

| Alan | Komutlar |
|---|---|
| Ekonomi | `/bakiye /banka /transfer /ekonomi /siralama /market /renk /pazar /mulk /xpboost` |
| Günlük | `/gunluk` (seri bonusu) `/gorevler` (her gün 3 görev) `/profil` (zengin kart) |
| Oyunlar | `/yazitura /zar /tahmin /slot /blackjack /atyarisi /oyunlar /yazioyunu /çal /kalkan` (slot, zar, at yarışı animasyonlu; blackjack düğmeli) |
| Evlilik | `/evlilik /evlen /esim` |
| Üretim | `/madenci /oduncu /balik` (madenden çıkan malzemeler silah/zırh üretiminde kullanılır) |
| Pet/Antika/Relik | `/petmarket /pet /antika /relik /relic-set /gelistir` |
| RPG | `/sinif /stat /rpg /zindan /fight /yumurta /sandik /craft /envanter /yukselt /parcala /rpg-pet` |
| Profil | `/hakkimda /sohbet /xp` |
| Yönetici | `/setup /market-yonet /renkrolekle /xp /sifirla /statsifirla /ses /verikaydet /backuplist /backupsil` |

Bonus sistemi: **Kedi** (+XP), **Köpek** (+coin), antikalar, relikler ve `/xpboost` mesaj XP'sini, zindan ve madencilik kazançlarını artırır.

## 8) Yedekleme ve veriyi sıfırlama

- Bot her 6 saatte bir `data/backups/` klasörüne otomatik yedek alır (son 20 tanesi saklanır). `/verikaydet` ile elle de alınır.
- **Geri yükleme:** botu durdur → `data/backups` içinden bir yedeği kopyala → `data/jester.db` adıyla yapıştır → botu başlat.
- **Her şeyi sıfırlamak:** botu durdur, `data/jester.db` dosyasını sil, tekrar başlat.

## 9) Bot 7/24 açık kalsın istiyorsan

Bot, terminal açık olduğu sürece çalışır. Sürekli açık kalması için bir sunucuya (VPS) koymak gerekir.
⚠️ Render/Heroku gibi ücretsiz servislerde dosyalar silinebildiği için `data/` klasörü **kalıcı disk** üzerinde olmalıdır, yoksa tüm oyuncu verisi kaybolur.

## 10) Bu sürümde ne değişti? (dürüst not)

Orijinal repo 7 ayrı servise bölünmüştü, dosya adları karışmıştı ve bazı modüllerin kodu eksikti ("ZIP içinde eksikti" yer tutucuları). Bu sürümde:

- **Tek süreç + SQLite**: 7 servis, Render ve PostgreSQL gereksinimi kalktı. Orijinal tablo şeması aynen korundu.
- **Orijinalden aynen alındı:** yumurta/sandık/pet/silah/zırh/geliştirme sayıları, klasik pet-antika-relik sabitleri, seviye formülleri, tüm komut dosyaları.
- **Eksik olduğu için yeniden yazıldı:** `/madenci`, `/oduncu`, `/gelistir`, zindanlar ve düello, hırsızlık, evlilik, rol/oyuncu pazarı, kraliyet unvanları, bonus hesapları, spam koruması, slot makinesi, ses takibi. **Bu parçaların denge sayıları (ödüller, fiyatlar, şanslar) benim tasarımımdır**, orijinal bot ile birebir aynı olmayabilir; `services/` klasöründeki dosyalarda kolayca değiştirebilirsin.
- **Düzeltilen hatalar:** `/xpboost` para alıp bonus vermiyordu (artık veriyor), rol zaten sahipken tekrar satın alınabiliyordu, oyuncu pazarında eşya alıcıya teslim edilmiyordu (artık ediliyor), yedekleme GitHub token'ı gerektiriyordu (artık yerel).
- **Eklenenler (orijinalde yoktu):** `/balik`, `/gunluk` (seri sistemi), `/gorevler`, `/profil`, düğmeli blackjack, canlı savaş anlatımlı zindanlar, animasyonlu yumurta/sandık/slot/zar/at yarışı, kategori menülü `/yardim`. Botun bütün cevapları otomatik olarak renkli, kullanıcı avatarlı embed biçiminde görünür (`lib/ui.js`).

## 11) Test

`npm test` → sahte bir Discord ile tüm komutları, butonları ve olayları baştan sona dener (Discord'a bağlanmaz, internet gerekmez).
