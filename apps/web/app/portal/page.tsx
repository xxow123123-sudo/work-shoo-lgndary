import Link from 'next/link';
import { currentAccess, roleHome } from '../../lib/access';
import { adminDb } from '../../lib/database';
import { redirect } from 'next/navigation';

export const dynamic='force-dynamic';
export default async function Portal(){
  const a=await currentAccess();
  if(!a.user) redirect('/login');
  if(a.locked) return <main className="wrap"><div className="card"><h1>الحساب الوظيفي موقوف</h1><p>حسابك الوظيفي غير مفعل حاليًا. راجع الإدارة.</p>{a.employee?.status_reason&&<p className="muted">السبب: {a.employee.status_reason}</p>}</div></main>;
  if(a.role) redirect(roleHome(a.role));

  // المتقدم المقبول مبدئيًا يستطيع تسجيل الدخول للموقع، لكنه يبقى في بوابة حالة التقديم
  // حتى القبول النهائي وإعطائه رتبة الموظف.
  const db=adminDb();
  const {data:application}=await db.from('applications').select('status').eq('discord_user_id',a.discordId).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(application && ['pending','preaccepted','profile_submitted','interview','rejected'].includes(application.status)) redirect('/apply/status');

  return <main className="wrap"><div className="card"><h1>لا توجد صلاحية موظف</h1><p>هذا الحساب غير مربوط بموظف نشط في الورشة.</p><Link className="btn" href="/">العودة للرئيسية</Link></div></main>;
}
