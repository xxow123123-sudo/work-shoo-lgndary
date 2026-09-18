# Legendary Workshop V9

نظام ورشة GTA متكامل: Discord Bot + Next.js Website + PostgreSQL على Railway.

## Railway
- خدمة PostgreSQL.
- خدمة Bot: `npm run start:bot`
- خدمة Web: `npm run start:web`
- Pre-deploy للخدمتين: `npm run db:setup`

## أوامر الإعداد في Discord
- `/setup-logs`
- `/setup-panels`
- `/set-admin-log` لاختيار روم اللوق الإداري الكامل.
- `/set-online-panel` لاختيار روم لوحة المسجلين دخول الآن والموظفين في إجازة.

## الصلاحيات
الموقع يقرأ رتبة العضو مباشرة من Discord بالترتيب:
Owner User ID > Boss Role > HR Role > Employee Role.
قاعدة البيانات تحدد الحالة الوظيفية active / suspended / terminated والإجازات.

## الإجازات
الموظف يحدد عدد الأيام فقط والسبب اختياري. عند قبول HR يبدأ اليوم الأول تلقائيًا، ويتم حساب تاريخ النهاية وإرجاع الرتبة تلقائيًا بعد انتهاء المدة.

## الحضور
كل دخول وخروج محفوظ. رسالة الخروج تعرض مدة الشفت وإجمالي ساعات الأسبوع. الخروج الإجباري يفعل الشيء نفسه ويسجل المنفذ والسبب.

## اللوق الإداري
كل عملية مهمة من Discord أو الموقع أو النظام تحفظ في `audit_logs` وترسل إلى روم `admin_logs_channel_id` المحدد بواسطة `/set-admin-log`.
