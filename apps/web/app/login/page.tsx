import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentSession } from '../../lib/auth';

export const dynamic='force-dynamic';

export default async function Login(){
  const session=await currentSession();
  if(session) redirect('/portal');

  return <main className="employee-login-page">
    <div className="login-nav">
      <Link className="login-brand" href="/">
        <img src="/legendary-logo.png" alt="Legendary"/>
        <div><strong>LEGENDARY</strong><span>WORKSHOP</span></div>
      </Link>
      <Link className="login-home-link" href="/">العودة للرئيسية</Link>
    </div>

    <section className="employee-login-card">
      <div className="login-emblem-wrap">
        <img className="login-emblem" src="/legendary-logo.png" alt="Legendary Workshop"/>
      </div>
      <p className="eyebrow login-eyebrow">STAFF ACCESS</p>
      <h1>دخول الموظفين</h1>
      <p className="login-copy">سجّل الدخول بحساب Discord المرتبط بالورشة مرة واحدة، وسيبقى تسجيل الدخول محفوظًا على هذا الجهاز حتى تسجل الخروج أو تنتهي الجلسة.</p>

      <a className="discord-login-btn" href="/auth/discord">
        <span className="discord-mark">D</span>
        <span>تسجيل الدخول عبر Discord</span>
      </a>

      <div className="login-features">
        <div><span>01</span><p>دخول آمن</p></div>
        <div><span>02</span><p>تعرف تلقائي على الرتبة</p></div>
        <div><span>03</span><p>جلسة محفوظة</p></div>
      </div>

      <p className="login-note">هذه البوابة مخصصة لموظفي Legendary والإدارة فقط.</p>
    </section>
  </main>;
}
