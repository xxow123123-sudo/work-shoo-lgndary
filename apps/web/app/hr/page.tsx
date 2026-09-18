import { requireRole } from '../../lib/access';
import { adminDb } from '../../lib/database';
import HRControls from './HRControls';
import StaffShell from '../components/StaffShell';
export const dynamic='force-dynamic';

export default async function HR(){
  const a=await requireRole('hr');
  if(a.locked) return <StaffShell role={a.role} name={a.employee?.game_name||a.employee?.discord_username} section="HR"><div className="locked-state"><span>LOCKED</span><h1>الحساب موقوف</h1></div></StaffShell>;
  const db=adminDb();
  const today=new Date().toISOString().slice(0,10);
  const [{data:open},{data:employees},{data:incomplete},{data:leaves},{data:apps},{data:onLeave}]=await Promise.all([
    db.from('attendance').select('id,clock_in,employees(discord_user_id,discord_username,game_name)').is('clock_out',null).order('clock_in'),
    db.from('employees').select('*').eq('is_active',true).order('discord_username'),
    db.from('employees').select('*').eq('is_active',true).eq('profile_complete',false),
    db.from('leave_requests').select('*,employees(discord_user_id,discord_username,game_name)').eq('status','pending').order('created_at'),
    db.from('applications').select('id,discord_user_id,status,profile_game_name,applicant_name,created_at').in('status',['pending','preaccepted','profile_submitted','interview']).order('created_at',{ascending:false}).limit(50),
    db.from('leave_requests').select('*,employees(discord_user_id,discord_username,game_name)').eq('status','approved').lte('starts_on',today).gte('ends_on',today).order('ends_on'),
  ]);
  const name=a.employee?.game_name||a.employee?.discord_username||'HR';
  return <StaffShell role={a.role} name={name} section="HUMAN RESOURCES">
    <section className="staff-hero compact-hero"><div><span className="work-status online">HR CENTER</span><h1>لوحة الموارد البشرية</h1><p>متابعة الموظفين والتقديمات والإجازات والإجراءات من شاشة واحدة.</p></div><div className="profile-chip"><span>الموظفون النشطون</span><strong>{employees?.length||0}</strong><small>ملف وظيفي فعال</small></div></section>

    <section className="metric-grid metric-grid-4">
      <article className="metric-card featured"><span>داخل الدوام</span><strong>{open?.length||0}</strong><small>موظف الآن</small></article>
      <article className="metric-card"><span>في إجازة</span><strong>{onLeave?.length||0}</strong><small>إجازة فعالة</small></article>
      <article className="metric-card"><span>طلبات جارية</span><strong>{apps?.length||0}</strong><small>مسار توظيف</small></article>
      <article className="metric-card"><span>بيانات ناقصة</span><strong>{incomplete?.length||0}</strong><small>تحتاج استكمال</small></article>
    </section>

    <section className="dashboard-grid equal">
      <article className="panel-card">
        <div className="panel-head"><div><span>LIVE ATTENDANCE</span><h2>الموظفون داخل الدوام</h2></div><b>{open?.length||0}</b></div>
        <div className="people-list">{open?.length?open.map((x:any)=><div key={x.id}><span className="avatar-letter">{String(x.employees?.game_name||x.employees?.discord_username||'?').slice(0,1).toUpperCase()}</span><div><strong>{x.employees?.game_name||x.employees?.discord_username||x.employees?.discord_user_id}</strong><small>دخول: {new Date(x.clock_in).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}</small></div><span className="mini-status online">متصل</span></div>):<div className="empty-state">لا يوجد أحد داخل الدوام.</div>}</div>
      </article>
      <article className="panel-card">
        <div className="panel-head"><div><span>ON LEAVE</span><h2>الموظفون في إجازة</h2></div><b>{onLeave?.length||0}</b></div>
        <div className="people-list">{onLeave?.length?onLeave.map((x:any)=><div key={x.id}><span className="avatar-letter muted-avatar">{String(x.employees?.game_name||x.employees?.discord_username||'?').slice(0,1).toUpperCase()}</span><div><strong>{x.employees?.game_name||x.employees?.discord_username||x.employees?.discord_user_id}</strong><small>تنتهي: {x.ends_on}</small></div><span className="mini-status leave">إجازة</span></div>):<div className="empty-state">لا توجد إجازات فعالة.</div>}</div>
      </article>
    </section>

    <section className="panel-card">
      <div className="panel-head"><div><span>APPLICATIONS</span><h2>التقديمات الجارية</h2></div><b>{apps?.length||0}</b></div>
      <div className="application-table">
        <div className="application-row header"><span>المتقدم</span><span>Discord ID</span><span>الحالة</span><span>التاريخ</span></div>
        {apps?.length?apps.slice(0,10).map((x:any)=><div className="application-row" key={x.id}><strong>{x.applicant_name||x.profile_game_name||'متقدم'}</strong><span>{x.discord_user_id}</span><span className={`status-text ${x.status}`}>{x.status==='pending'?'مراجعة أولية':x.status==='preaccepted'?'مقبول مبدئيًا':x.status==='profile_submitted'?'بيانات HR مكتملة':'مقابلة'}</span><span>{new Date(x.created_at).toLocaleDateString('ar-SA')}</span></div>):<div className="empty-state">لا توجد تقديمات جارية.</div>}
      </div>
    </section>

    <HRControls employees={employees||[]} leaves={leaves||[]}/>
  </StaffShell>;
}
