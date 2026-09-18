import { requireRole } from '../../lib/access';
import { adminDb } from '../../lib/database';
import { discordProfiles } from '../../lib/discord';
import HRControls from './HRControls';
import StaffShell from '../components/StaffShell';
import DiscordPerson from '../components/DiscordPerson';
export const dynamic='force-dynamic';

function roleText(r:string){return r==='owner'?'Owner':r==='boss'?'Boss':r==='hr'?'HR':'Employee';}
export default async function HR(){
  const a=await requireRole('hr');
  const name=a.user?.user_metadata?.full_name||a.employee?.game_name||a.employee?.discord_username||'HR';
  if(a.locked) return <StaffShell role={a.role} name={name} username={a.username} avatarUrl={a.avatarUrl} section="HR"><div className="locked-state"><span>LOCKED</span><h1>الحساب موقوف</h1></div></StaffShell>;
  const db=adminDb(); const today=new Date().toISOString().slice(0,10);
  const [{data:open},{data:employees},{data:incomplete},{data:leaves},{data:apps},{data:onLeave}]=await Promise.all([
    db.from('attendance').select('id,clock_in,employees(discord_user_id,discord_username,game_name)').is('clock_out',null).order('clock_in'),
    db.from('employees').select('*').eq('is_active',true).order('discord_username'),
    db.from('employees').select('*').eq('is_active',true).eq('profile_complete',false),
    db.from('leave_requests').select('*,employees(discord_user_id,discord_username,game_name)').eq('status','pending').order('created_at'),
    db.from('applications').select('id,discord_user_id,status,profile_game_name,applicant_name,created_at').in('status',['pending','preaccepted','profile_submitted','interview']).order('created_at',{ascending:false}).limit(50),
    db.from('leave_requests').select('*,employees(discord_user_id,discord_username,game_name)').eq('status','approved').lte('starts_on',today).gte('ends_on',today).order('ends_on'),
  ]);
  const ids=[...(employees||[]).map((e:any)=>e.discord_user_id),...(apps||[]).map((x:any)=>x.discord_user_id)];
  const profiles=await discordProfiles(ids);
  const employeeUi=(employees||[]).map((e:any)=>{const p=profiles.get(e.discord_user_id);return {...e,role:(p?.role&&p.role!=='applicant'?p.role:e.role),discord_display_name:p?.displayName||e.game_name||e.discord_username,discord_live_username:p?.username||e.discord_username,avatar_url:p?.avatarUrl||null};});
  return <StaffShell role={a.role} name={name} username={a.username} avatarUrl={a.avatarUrl} section="HUMAN RESOURCES">
    <section id="overview" className="staff-hero compact-hero"><div><span className="work-status online">HR CENTER</span><h1>لوحة الموارد البشرية</h1><p>متابعة الموظفين والتقديمات والإجازات والإجراءات من شاشة واحدة.</p></div><div className="profile-chip"><span>الموظفون النشطون</span><strong>{employees?.length||0}</strong><small>ملف وظيفي فعال</small></div></section>
    <section className="metric-grid metric-grid-4"><article className="metric-card featured"><span>داخل الدوام</span><strong>{open?.length||0}</strong><small>موظف الآن</small></article><article className="metric-card"><span>في إجازة</span><strong>{onLeave?.length||0}</strong><small>إجازة فعالة</small></article><article className="metric-card"><span>طلبات جارية</span><strong>{apps?.length||0}</strong><small>مسار توظيف</small></article><article className="metric-card"><span>بيانات ناقصة</span><strong>{incomplete?.length||0}</strong><small>تحتاج استكمال</small></article></section>

    <section id="online" className="dashboard-grid equal">
      <article className="panel-card"><div className="panel-head"><div><span>LIVE ATTENDANCE</span><h2>الموظفون داخل الدوام</h2></div><b>{open?.length||0}</b></div><div className="people-list modern-people">{open?.length?open.map((x:any)=>{const id=x.employees?.discord_user_id;return <div key={x.id}><DiscordPerson profile={profiles.get(id)} fallback={x.employees?.game_name||x.employees?.discord_username} subtitle={`دخول: ${new Date(x.clock_in).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}`}/><span className="mini-status online">داخل الدوام</span></div>}):<div className="empty-state">لا يوجد أحد داخل الدوام.</div>}</div></article>
      <article className="panel-card"><div className="panel-head"><div><span>ON LEAVE</span><h2>الموظفون في إجازة</h2></div><b>{onLeave?.length||0}</b></div><div className="people-list modern-people">{onLeave?.length?onLeave.map((x:any)=>{const id=x.employees?.discord_user_id;return <div key={x.id}><DiscordPerson profile={profiles.get(id)} fallback={x.employees?.game_name||x.employees?.discord_username}/><span className="mini-status leave">حتى {x.ends_on}</span></div>}):<div className="empty-state">لا توجد إجازات فعالة.</div>}</div></article>
    </section>

    <section id="employees" className="panel-card"><div className="panel-head"><div><span>STAFF</span><h2>الموظفون</h2></div><b>{employees?.length||0}</b></div><div className="staff-directory">{(employees||[]).slice(0,30).map((e:any)=><div key={e.id}><DiscordPerson profile={profiles.get(e.discord_user_id)} fallback={e.game_name||e.discord_username} badge={roleText(profiles.get(e.discord_user_id)?.role||e.role)}/><div className="employee-meta"><span>{e.game_name||'اسم اللعبة غير مسجل'}</span><small>Citizen: {e.citizen_id||'—'}</small></div></div>)}</div></section>

    <section id="applications" className="panel-card"><div className="panel-head"><div><span>APPLICATIONS</span><h2>التقديمات الجارية</h2></div><b>{apps?.length||0}</b></div><div className="application-table"><div className="application-row header"><span>المتقدم</span><span>Discord</span><span>الحالة</span><span>التاريخ</span></div>{apps?.length?apps.slice(0,10).map((x:any)=><div className="application-row" key={x.id}><DiscordPerson profile={profiles.get(x.discord_user_id)} fallback={x.applicant_name||x.profile_game_name||'متقدم'}/><span>{x.discord_user_id}</span><span className={`status-text ${x.status}`}>{x.status==='pending'?'مراجعة أولية':x.status==='preaccepted'?'مقبول مبدئيًا':x.status==='profile_submitted'?'بيانات HR مكتملة':'مقابلة'}</span><span>{new Date(x.created_at).toLocaleDateString('ar-SA')}</span></div>):<div className="empty-state">لا توجد تقديمات جارية.</div>}</div></section>

    <section id="actions"><HRControls employees={employeeUi} leaves={leaves||[]}/></section>
  </StaffShell>;
}
