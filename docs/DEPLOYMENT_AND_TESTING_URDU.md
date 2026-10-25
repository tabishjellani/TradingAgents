# سلطان ٹریڈنگ ایجنٹس (Sultan TradingAgents) — ڈپلائمنٹ، ٹیسٹنگ اور آپریشنز گائیڈ
**مقام:** `D:\TradingAgents-main`  
**زبان:** اردو (مع انگریزی تکنیکی اصطلاحات اور کوڈ کمانڈز)  
**سیکیورٹی لیول:** پروڈکشن گریڈ (Production-Ready)

---

## فہرست مضامین
1. [تعارف اور مجموعی فن تعمیر (Architecture Overview)](#1-تعارف-اور-مجموعی-فن-تعمیر)
2. [گٹ ہب اور سی آئی/سی ڈی پائپ لائن (GitHub & CI/CD)](#2-گٹ-ہب-اور-سی-آئیسی-ڈی-پائپ-لائن)
3. [ہوسٹڈ سپابیس سیٹ اپ اور ڈیٹا بیس مائیگریشنز (Supabase Setup & Migrations)](#3-ہوسٹڈ-سپابیس-سیٹ-اپ-اور-ڈیٹا-بیس-مائیگریشنز)
4. [کلاؤڈ فلیئر پیجز اور زیرو-ٹرسٹ ٹنل (Cloudflare Pages & Tunnel)](#4-کلاؤڈ-فلیئر-پیجز-اور-زیرو-ٹرسٹ-ٹنل)
5. [ماحولیاتی متغیرات کی کنفیگریشن (Environment Variables Matrix)](#5-ماحولیاتی-متغیرات-کی-کنفیگریشن)
6. [ایڈمن سیٹنگز اور محفوظ اے آئی والٹ (Admin AI Key Vault)](#6-ایڈمن-سیٹنگز-اور-محفوظ-اے-آئی-والٹ)
7. [مقامی ٹیسٹنگ اور توثیق کی فہرست (Pre-Deployment Verification)](#7-مقامی-ٹیسٹنگ-اور-توثیق-کی-فہرست)
8. [عام غلطیاں اور حل (Troubleshooting)](#8-عام-غلطیاں-اور-حل)
9. [ہنگامی شٹ ڈاؤن اور رول بیک (Emergency Shutdown & Rollback)](#9-ہنگامی-شٹ-ڈاؤن-اور-رول-بیک)

---

## 1. تعارف اور مجموعی فن تعمیر

سلطان ٹریڈنگ ایجنٹس ایک جدید، ملٹی ایجنٹ کوانٹیٹیٹو ریسرچ اور پیپر ٹریڈنگ پلیٹ فارم ہے جو مکمل طور پر **زیرو ہوسٹنگ کاسٹ (Zero Hosting Cost)** ماڈل پر ڈیزائن کیا گیا ہے۔

```
[ کلائنٹ براؤزر / موبائل PWA ]
              │
              ▼ HTTPS (TLS 1.3)
[ Cloudflare Pages + Edge Gateway ]
  - ری ایکٹ 19 فرنٹ اینڈ PWA کی میزبانی
  - ریٹ لمٹنگ (60 درخواستیں فی منٹ)
  - ریورس پراکسی برائے /api/v1
              │
              ├──────────────────────────────┐
              ▼                              ▼
[ Supabase PostgreSQL + Auth ]   [ Cloudflare Tunnel (cloudflared) ]
  - صارف کا لاگ ان اور JWT تصدیق            │
  - 13 ڈیٹا بیس ٹیبلز اور RLS پالیسیاں        ▼ Encrypted Outbound Bridge
  - صارف کے پورٹ فولیو کا ریکارڈ         [ مقامی ونڈوز ورک اسٹیشن ]
                                   - FastAPI ازگر سرور (:8000)
                                   - TradingAgents ملٹی ایجنٹ انجن
                                   - سرور سائیڈ انکرپٹڈ والٹ
```

### بنیادی فوائد:
* **براؤزر کی حفاظت:** اے پی آئی کیز (API Keys) کبھی بھی فرنٹ اینڈ بنڈل یا براؤزر اسٹوریج میں نہیں رکھی جاتیں۔
* **مالی تحفظ:** لائیو ٹریڈنگ کو سرور کی حد پر ہارڈ کوڈڈ طریقے سے معطل (`ENABLE_LIVE_TRADING=False`) رکھا گیا ہے۔
* **زیرو کلاؤڈ بل:** ریسرچ کمپیوٹیشنز آپ کے اپنے ونڈوز ورک اسٹیشن پر چلتی ہیں، جبکہ فرنٹ اینڈ اور ڈیٹا بیس مفت ہوسٹڈ سروسز پر کام کرتے ہیں۔

---

## 2. گٹ ہب اور سی آئی/سی ڈی پائپ لائن

### مرحلہ 1: ریپوزٹری کی جانچ اور اگنور رولز
کسی بھی کوڈ کو گٹ ہب پر بھیجنے سے پہلے تصدیق کریں کہ حساس فائلیں نظر انداز (Ignore) ہیں:
```powershell
# گٹ اسٹیٹس چیک کریں
git status

# تصدیق کریں کہ .env اور خفیہ فائلیں اگنور ہیں
git check-ignore -v .env .env.local backend/.env frontend/.env frontend/.env.local data/.vault_key data/secrets.enc
```

### مرحلہ 2: گٹ ہب سیکرٹس کی کنفیگریشن
اگر آپ گٹ ہب ایکشنز (GitHub Actions) کے ذریعے آٹو ڈپلائمنٹ استعمال کر رہے ہیں تو ریپوزٹری کی **Settings -> Secrets and variables -> Actions** میں یہ سیکرٹس درج کریں:
* `CLOUDFLARE_API_TOKEN`: کلاؤڈ فلیئر پیجز ڈپلائمنٹ کا ٹوکن۔
* `CLOUDFLARE_ACCOUNT_ID`: کلاؤڈ فلیئر اکاؤنٹ کا 32 ہندسی کوڈ۔
* `SUPABASE_JWT_SECRET`: سی آئی ٹیسٹ رن کے لیے ٹیسٹ سیکرٹ۔

---

## 3. ہوسٹڈ سپابیس سیٹ اپ اور ڈیٹا بیس مائیگریشنز

### مرحلہ 1: نیا سپابیس پروجیکٹ بنائیں
1. [supabase.com](https://supabase.com) پر جائیں اور لاگ ان کریں۔
2. **New Project** پر کلک کریں۔ پروجیکٹ کا نام منتخب کریں (مثلاً: `tradingagents-prod`)۔
3. ایک مضبوط ڈیٹا بیس پاس ورڈ منتخب کریں اور محفوظ رکھیں۔
4. خطہ (Region) منتخب کریں اور پروجیکٹ کی تیاری (Provisioning) کا 2 منٹ انتظار کریں۔

### مرحلہ 2: کریڈینشلز حاصل کریں
* **Project Settings -> API** پر جائیں:
  * `Project URL` کاپی کریں (یہ `VITE_SUPABASE_URL` اور `SUPABASE_URL` بنے گا)۔
  * `anon public key` کاپی کریں (یہ `VITE_SUPABASE_ANON_KEY` اور `SUPABASE_ANON_KEY` بنے گا)۔
* **Project Settings -> API -> JWT Settings** پر جائیں:
  * اگر الगोरिتم `HS256` ہے تو `JWT Secret` کاپی کریں۔
  * اگر الगोरिتم `RS256` یا `ES256` ہے تو سیکرٹ کی ضرورت نہیں، بیک اینڈ خود بخود سپابیس کے `/.well-known/jwks.json` اینڈ پوائنٹ سے پبلک کیز کی تصدیق کر لے گا۔

### مرحلہ 3: آتھنٹیکیشن یو آر ایل کی ترتیبات
* **Authentication -> URL Configuration** پر جائیں:
  * **Site URL**: `http://localhost:5173` (یا آپ کا کلاؤڈ فلیئر پیجز یو آر ایل `https://tradingagents-pwa.pages.dev`)
  * **Redirect URLs** میں درج کریں:
    * `http://localhost:5173/**`
    * `https://*.pages.dev/**`

### مرحلہ 4: مائیگریشنز کا نفاذ (Sequential Migrations Execution)
سپابیس ڈیش بورڈ میں **SQL Editor** کھولیں اور باری باری تینوں مائیگریشنز چلائیں:

1. **پہلی مائیگریشن: `supabase/migrations/20261021000001_initial_schema.sql`**
   * یہ فائل 13 بنیادی ٹیبلز (پروفائلز، واچ لسٹ، پیپر پورٹ فولیو، آرڈرز، ریسرچ رپورٹس، الرٹس، آڈٹ ایونٹس) بناتی ہے۔
2. **دوسری مائیگریشن: `supabase/migrations/20261021000002_rls_policies.sql`**
   * تمام ٹیبلز پر رو لیول سیکیورٹی (Row Level Security - RLS) نافذ کرتی ہے تاکہ کوئی صارف دوسرے کا ڈیٹا نہ دیکھ سکے۔
3. **تیسری مائیگریشن: `supabase/migrations/20261021000003_auth_triggers.sql`**
   * جب نیا صارف سائن اپ کرے تو خود بخود ڈیفالٹ پروفائل، واچ لسٹ اور $100,000 کا پیپر پورٹ فولیو جاری کرتی ہے۔

### مرحلہ 5: مائیگریشن کی تصدیقی کمانڈ
ایس کیو ایل ایڈیٹر میں یہ استفسار چلا کر تصدیق کریں:
```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```
تمام ٹیبلز کے آگے `rowsecurity = true` ہونا چاہیے۔

---

## 4. کلاؤڈ فلیئر پیجز اور زیرو-ٹرسٹ ٹنل

### فرنٹ اینڈ ڈپلائمنٹ (Cloudflare Pages):
1. کلاؤڈ فلیئر ڈیش بورڈ میں جائیں: **Workers & Pages -> Create -> Pages -> Connect to Git**۔
2. ریپوزٹری منتخب کریں:
   * **Framework preset**: `Vite`
   * **Root directory**: `frontend`
   * **Build command**: `npm run build`
   * **Build output directory**: `dist`
3. انوائرنمنٹ متغیرات درج کریں:
   * `VITE_SUPABASE_URL`: `https://<آپ-کا-پروجیکٹ>.supabase.co`
   * `VITE_SUPABASE_ANON_KEY`: `<آپ-کی-انون-کی>`
   * `VITE_API_BASE_URL`: خالی چھوڑ دیں اگر گیٹ وے ورکر استعمال کر رہے ہیں، ورنہ ٹنل کا یو آر ایل درج کریں۔

### ونڈوز ورک اسٹیشن ٹنل سیٹ اپ (Cloudflare Tunnel):
چونکہ ملٹی ایجنٹ ریسرچ انجن آپ کے مقامی ونڈوز کمپیوٹر پر چلتا ہے، اس لیے پبلک آئی پی کی ضرورت نہیں:
```powershell
# کلاؤڈ فلیئرڈ ڈاؤن لوڈ اور لاگ ان کریں
winget install Cloudflare.cloudflared
cloudflared tunnel login

# نیا محفوظ ٹنل بنائیں
cloudflared tunnel create tradingagents-bridge

# ٹنل کو لوکل بیک اینڈ سرور پر روٹ کریں
cloudflared tunnel run --url http://127.0.0.1:8000 tradingagents-bridge
```

---

## 5. ماحولیاتی متغیرات اور کلاؤڈ آرکیٹیکچر کنفیگریشن

| متغیر کا نام | فائل کا مقام | حساسیت | تفصیل |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | `frontend/.env.local` | پبلک | سپابیس کلائنٹ پروجیکٹ یو آر ایل |
| `VITE_SUPABASE_ANON_KEY` | `frontend/.env.local` | پبلک | سپابیس پبلش ایبل انون کی |
| `VITE_API_BASE_URL` | `frontend/.env.local` | پبلک | اے پی آئی پراکسی بیس یو آر ایل (کلاؤڈ فلیئر گیٹ وے) |
| `SUPABASE_URL` | `.env` یا `backend/.env` | سرور آنلی | بیک اینڈ پوسٹ گریس کنکشن یو آر ایل |
| `SUPABASE_ANON_KEY` | `.env` یا `backend/.env` | سرور آنلی | پوسٹ گرین ریسٹ کلائنٹ کی |
| `SUPABASE_JWT_SECRET` | `.env` یا `backend/.env` | **انتہائی خفیہ** | ایچ ایس 256 ٹوکن تصدیق سیکرٹ |
| `VAULT_MASTER_KEY` | پلیٹ فارم سیکرٹس / `.env` | **انتہائی خفیہ** | فرنیٹ ماسٹر کی (کنٹینر اور ملٹی انسٹینس بحالی کے لیے لازمی) |
| `ENABLE_LIVE_TRADING` | `backend/app/config.py` | حفاظتی تالا | ہمیشہ `false` رکھیں (لائیو ٹریڈنگ غیر فعال) |

### کلاؤڈ ہوسٹنگ اور بیک اینڈ موافقت (Backend Hosting Architecture):
* **فرنٹ اینڈ:** Cloudflare Pages (جامد سنگل پیج ایپ، گلوبل ایج CDN)۔
* **بیک اینڈ ہوسٹ کے اختیارات:**
  1. *مقامی ورک اسٹیشن یا لینکس وی پی ایس (VPS):* `Cloudflare Tunnel (cloudflared)` کے ذریعے بغیر کسی پبلک پورٹ کھولے `127.0.0.1:8000` سے محفوظ رابطہ۔
  2. *کنٹینر / سرور لیس (Docker, Render, Fly.io, Cloud Run):* ان ماحول میں والٹ کی مستقل بحالی کے لیے `VAULT_MASTER_KEY` کو پلیٹ فارم سیکرٹس میں درج کریں تاکہ کنٹینر ری اسٹارٹ ہونے پر پچھلی انکرپٹڈ کیز ضائع نہ ہوں۔

---

## 6. ایڈمن سیٹنگز، تصدیق شدہ ماڈلز اور والٹ ماسٹر کی ریکوری

### الف) تصدیق شدہ بمقابلہ غیر تصدیق شدہ ماڈلز (Verified vs Unverified Models):
پرووائیڈرز کے سرکاری دستاویزات اور لائبریریوں کی بنیاد پر ماڈلز کی تفصیل:
1. **Google Gemini:**
   * **سرکاری تصدیق شدہ (Verified):** `gemini-2.0-flash` (تجویز کردہ تیز ترین)، `gemini-1.5-flash`، `gemini-1.5-pro`۔
   * **غیر تصدیق شدہ کلاسک کیٹلاگ (Unverified Speculative):** `gemini-3.8-flash`، `gemini-3.5-flash-lite` (ایڈمن UI میں واضح نشان زد ہیں)۔
2. **OpenAI:**
   * **سرکاری تصدیق شدہ (Verified):** `gpt-4o`، `gpt-4o-mini`، `o1`، `o1-mini`۔
   * **غیر تصدیق شدہ کلاسک کیٹلاگ (Unverified Speculative):** `gpt-6-luna`، `gpt-6-sol`۔
3. **Groq Cloud:**
   * **سرکاری تصدیق شدہ (Verified):** `llama-3.3-70b-versatile`، `llama-3.1-8b-instant`، `mixtral-8x7b-32768`۔
4. **Anthropic Claude:**
   * **سرکاری تصدیق شدہ (Verified):** `claude-3-5-sonnet-latest`، `claude-3-5-haiku-latest`، `claude-3-opus-latest`۔
   * **غیر تصدیق شدہ کلاسک کیٹلاگ (Unverified Speculative):** `claude-sonnet-5`، `claude-haiku-4-5`۔

### ب) ماسٹر کی کا طریقہ کار اور ریکوری (Master Key Recovery & Rotation):
* **ڈویلپمنٹ موڈ:** سسٹم خود بخود `data/.vault_key` فائل بناتا ہے۔
* **پروڈکشن سیفٹی گارڈ:** اگر پروڈکشن میں `secrets.enc` موجود ہو مگر ماسٹر کی غائب ہو تو بیک اینڈ خاموشی سے نئی کی نہیں بناتا (تاکہ ڈیٹا ضائع نہ ہو) بلکہ فوری طور پر `RuntimeError` دیتا ہے تاکہ آپ اصل `VAULT_MASTER_KEY` فراہم کریں۔
* **ماسٹر کی جنریٹ کرنے کا طریقہ:**
  ```powershell
  .\.venv\Scripts\python.exe -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```
* **کی روٹیشن کا طریقہ کار:**
  1. پرانی ماسٹر کی کے ذریعے بیک اینڈ شروع کریں اور ایڈمن پینل سے ٹیسٹ کریں۔
  2. نئے پلیٹ فارم سیکرٹس میں نئی کیز اور نیا `VAULT_MASTER_KEY` اپ ڈیٹ کریں۔

---

## 7. مقامی ٹیسٹنگ اور توثیق کی فہرست

ڈپلائمنٹ سے قبل مقامی مشین پر ان کمانڈز کی کامیابی ضروری ہے:

```powershell
# 1. ازگر کوڈ کی کوالٹی اور لنٹنگ کی تصدیق
.\.venv\Scripts\ruff.exe check .

# 2. بیک اینڈ کے تمام 50 خودکار سیکیورٹی و انٹیگریشن ٹیسٹ چلائیں
.\.venv\Scripts\pytest.exe backend/tests/ -v

# 3. فرنٹ اینڈ پروڈکشن بنڈل کی تصدیق
cd frontend
npm run build
cd ..
```
**حتمی مصدقہ نتائج:**
* **Ruff Linter:** `All checks passed!` (0 غلطیاں)
* **Pytest Suite:** `50 passed in 23.77s` (تمام 50 ٹیسٹ پاس: والٹ انکرپشن، RBAC، JWT، لائیو ٹریڈنگ بلاک)
* **Vite Build:** `dist/index.html` اور ایسٹس 1.33 سیکنڈ میں بغیر کسی خرابی کے تیار۔

---

## 8. عام غلطیاں اور حل (Troubleshooting)

### 1. سی او آر ایس کی خرابی (CORS Error):
* **وجہ:** براؤزر مختلف پورٹ سے درخواست مسترد کرتا ہے۔
* **حل:** `backend/app/config.py` میں `cors_origins` کی فہرست میں اپنا فرنٹ اینڈ یو آر ایل شامل کریں۔

### 2. جے ڈبلیو ٹی ٹوکن مسترد ہونا (401 Invalid Token):
* **وجہ:** ٹوکن کا دستخط یا `aud` کلیم غلط ہے۔
* **حل:** تصدیق کریں کہ ٹوکن کا `aud` کلیم `"authenticated"` ہے۔ اگر `RS256` استعمال ہو رہا ہے تو بیک اینڈ کو سپابیس کا درست `SUPABASE_URL` فراہم کریں۔

### 3. یاہو فائنانس کنکشن ٹائم آؤٹ (DNS Timeout):
* **وجہ:** مقامی انٹرنیٹ سے یاہو سرور بلاک ہے۔
* **حل:** بیک اینڈ میں اب خودکار فال بیک موجود ہے جو سسٹم کو کریش ہونے سے بچاتا ہے اور ڈٹرمینسٹک تخمینہ فراہم کرتا ہے۔

---

## 9. ہنگامی شٹ ڈاؤن اور رول بیک

### ہنگامی کل سوئچ (Emergency Kill Switch):
اگر مارکیٹ میں اتار چڑھاؤ کے دوران آپ فوری طور پر تمام آپریشنز منجمد کرنا چاہتے ہیں:
1. ایڈمن ڈیش بورڈ پر جائیں اور سرخ بٹن **Trigger Emergency Kill Switch** دبائیں۔
2. یا ٹرمینل میں کمانڈ چلائیں:
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/trading/kill-switch" -Method POST -Headers @{ Authorization = "Bearer <ADMIN_TOKEN>" } -Body '{"action":"activate"}' -ContentType "application/json"
```

### ڈیٹا بیس مائیگریشن رول بیک:
اگر کوئی مائیگریشن واپس لینی ہو تو سپابیس ایس کیو ایل ایڈیٹر میں:
```sql
-- آر ایل ایس پالیسیاں منسوخ کرنے کے لیے
DROP POLICY IF EXISTS "Users can manage own watchlists" ON public.watchlists;

-- ٹریگر ڈیلیٹ کرنے کے لیے
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
```

---
**محفوظ رہیں: ہمیشہ اس بات کو یقینی بنائیں کہ ریل ٹریڈنگ معطل ہے اور کوئی اصلی سرمایا مارکیٹ میں شامل نہیں ہے۔**
