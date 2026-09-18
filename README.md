# Legendary Workshop — Railway Edition

نظام إدارة ورشة Legendary: موقع Next.js + Discord Bot + PostgreSQL.

## مهم
هذه النسخة **لا تستخدم Supabase نهائيًا**:
- لا يوجد Supabase Database.
- لا يوجد Supabase Auth.
- تسجيل الدخول يتم مباشرة عبر Discord OAuth2.
- الموقع والبوت يستخدمان نفس PostgreSQL عبر `DATABASE_URL`.

## المتغيرات المطلوبة
انسخ `.env.example` إلى `.env` محليًا، أو أضف القيم نفسها في Railway Variables.

```env
DATABASE_URL=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SESSION_SECRET=
DISCORD_CLIENT_SECRET=

DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_OWNER_USER_ID=
DISCORD_EMPLOYEE_ROLE_ID=
DISCORD_HR_ROLE_ID=
DISCORD_BOSS_ROLE_ID=
DISCORD_APPLICANT_ROLE_ID=
DISCORD_EMPLOYEES_ROLE_ID=
DISCORD_INVITE_URL=
```

`SESSION_SECRET` أنشئه بأمر:
```cmd
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## قاعدة البيانات
بعد وضع `DATABASE_URL`:
```cmd
npm install
npm run db:setup
```

السكربت `database/schema.sql` قابل لإعادة التشغيل ويجهز الجداول والـ views المطلوبة.

## تشغيل محلي
```cmd
npm run dev:web
```
وفي نافذة ثانية:
```cmd
npm run dev:bot
```

## Discord OAuth بدون Supabase
في Discord Developer Portal > OAuth2 > Redirects أضف:
```text
http://localhost:3000/auth/callback
```
ولما ترفع Railway استبدله/أضف:
```text
https://YOUR-RAILWAY-DOMAIN/auth/callback
```

وحط `DISCORD_CLIENT_SECRET` من صفحة OAuth2 الخاصة بتطبيق Discord.

## رفع Railway
استخدم مشروع Railway واحد يحتوي 3 Services:
1. PostgreSQL
2. Legendary Web
3. Legendary Bot

### Web Service
- Build Command: `npm run build:web`
- Start Command: `npm run start:web`
- Pre-deploy Command: `npm run db:setup`
- فعّل Public Networking وخذ الدومين.

### Bot Service
- Start Command: `npm run start:bot`
- لا يحتاج Public Domain.

### Variables المشتركة
في Web وBot اربط:
```text
DATABASE_URL=${{Postgres.DATABASE_URL}}
```
ثم أضف متغيرات Discord. في Web أضف كذلك:
```text
NEXT_PUBLIC_SITE_URL=https://YOUR-RAILWAY-DOMAIN
SESSION_SECRET=...
DISCORD_CLIENT_SECRET=...
```

بعد معرفة الدومين النهائي، حدّث Redirect URL في Discord Developer Portal ليطابقه بالضبط.

## اللوحات
بعد تشغيل البوت:
```text
/setup-logs
/setup-panels
```

## ملاحظة عن بيانات Supabase القديمة
هذه النسخة لا تقرأ Supabase. إذا عندك بيانات حقيقية مهمة هناك، صدّرها قبل حذف المشروع القديم ثم انقلها إلى PostgreSQL. إذا كانت مجرد بيانات اختبار، ابدأ بقاعدة Railway جديدة.

## تحديث V5
بعد تحديث الكود على Railway شغّل `/setup-logs` و`/setup-panels` من Discord مرة أخرى. سيتم إضافة روم تسليم الموارد ولوحة طلبات الموظفين وتحديث أزرار HR والإدارة بدون حذف سجلاتك القديمة.

قراءة الفاتورة تبحث عن `MONEY AMOUNT` في الصورة. إذا نجحت القراءة يطلب البوت من الموظف كتابة `تأكيد`، وإذا أخطأت يمكنه كتابة المبلغ الصحيح مباشرة.

## تحديث V7
إحصائيات إنجاز الأسبوع لم تعد تظهر للزوار أو المتقدمين. الموظفون يشاهدون نشاطهم ومتطلباتهم داخل لوحة الموظف بعد تسجيل الدخول عبر Discord.

## تحديث V8 — HR والإدارة
بعد رفع التحديث شغّل `/setup-panels` لتحديث لوحة HR ولوحة الإدارة العليا.

### HR
- **إنشاء تكت مع موظف**: يطلب Discord ID للموظف وسببًا اختياريًا، ثم ينشئ تكت خاصًا يحتوي زر إغلاق.

### الإدارة العليا
- **إرسال رسالة خاصة**: اختر العضو من القائمة، ثم اكتب العنوان والنص. العملية كاملة تظهر في `سجل-الادارة` وتُحفظ في `audit_logs`.

### المقابلات
- تكت المقابلة يحتوي: قبول / رفض / إغلاق المقابلة.
- القبول أو الرفض يغلق تكت المقابلة تلقائيًا بعد 5 ثوانٍ.
