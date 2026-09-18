import { requireRole } from '../../lib/access';
import { adminDb } from '../../lib/database';
import AdminControls from './AdminControls';
import StaffShell from '../components/StaffShell';
export const dynamic='force-dynamic';

export default async function Admin(){
  const a=await requireRole('boss');
  if(a.locked) return <StaffShell role={a.role} name={a.employee?.game_name||a.employee?.discord_username} section="ADMIN"><div className="locked-state"><span>LOCKED</span><h1>الحساب موقوف</h1></div></StaffShell>;
  const db=adminDb();
  const [{data:week},{data:life},{data:employees},{data:setting},{count:online},{data:cycles}]=await Promise.all([
    db.from('current_week_stats').select('*').order('points',{ascending:false}),
    db.from('lifetime_stats').select('*').order('points',{ascending:false}),
    db.from('employees').select('*').order('discord_username'),
    db.from('bot_settings').select('value').eq('guild_id',process.env.DISCORD_GUILD_ID!).eq('key','recruitment_open').maybeSingle(),
    db.from('attendance').select('*',{count:'exact',head:true}).is('clock_out',null),
    db.from('weekly_cycles').select('*').order('starts_at',{ascending:false}).limit(8),
  ]);
  const total=(week||[]).reduce((x:any,r:any)=>({tool:x.tool+(r.tool_sales||0),mods:x.mods+(r.vehicle_mods||0),points:x.points+(r.points||0),money:x.money+Number(r.invoice_total||0)}),{tool:0,mods:0,points:0,money:0});
  const recruitmentOpen=setting?.value===undefined?true:setting.value==='true';
  const active=(employees||[]).filter((e:any)=>e.is_active&&e.employment_status==='active');
  const name=a.employee?.game_name||a.employee?.discord_username||(a.role==='owner'?'Owner':'Boss');
  return <StaffShell role={a.role} name={name} section="MANAGEMENT">
    <section className="staff-hero compact-hero"><div><span className={`work-status ${recruitmentOpen?'online':'offline'}`}>{recruitmentOpen?'التقديم مفتوح':'التقديم مغلق'}</span><h1>لوحة الإدارة العليا</h1><p>صورة كاملة عن الورشة، الأداء الأسبوعي، الموظفين والتحكم الإداري.</p></div><div className="profile-chip"><span>الموظفون النشطون</span><strong>{active.length}</strong><small>{online||0} داخل الدوام الآن</small></div></section>

    <section className="metric-grid metric-grid-5">
      <article className="metric-card featured"><span>إجمالي نقاط الأسبوع</span><strong>{total.points}</strong><small>نشاط الفريق</small></article>
      <article className="metric-card"><span>تعديلات المركبات</span><strong>{total.mods}</strong><small>هذا الأسبوع</small></article>
      <article className="metric-card"><span>بيع العدة</span><strong>{total.tool}</strong><small>هذا الأسبوع</small></article>
      <article className="metric-card"><span>قيمة الفواتير</span><strong>${total.money.toLocaleString()}</strong><small>هذا الأسبوع</small></article>
      <article className="metric-card"><span>داخل الدوام</span><strong>{online||0}</strong><small>الآن</small></article>
    </section>

    <section className="dashboard-grid equal">
      <article className="panel-card leaderboard">
        <div className="panel-head"><div><span>WEEKLY LEADERBOARD</span><h2>الأكثر نشاطًا هذا الأسبوع</h2></div></div>
        {(week||[]).filter((x:any)=>x.points>0).slice(0,7).map((x:any,i:number)=><div className="rank-row" key={x.employee_id}><span className={`rank-number top-${i+1}`}>{String(i+1).padStart(2,'0')}</span><div><strong>{x.game_name||x.discord_username||x.discord_user_id}</strong><small>{x.vehicle_mods||0} تعديل • {x.tool_sales||0} بيع عدة</small></div><b>{x.points} نقطة</b></div>)}
        {!(week||[]).some((x:any)=>x.points>0)&&<div className="empty-state">لا يوجد نشاط مسجل لهذا الأسبوع.</div>}
      </article>
      <article className="panel-card leaderboard">
        <div className="panel-head"><div><span>ALL TIME</span><h2>الأكثر نشاطًا دائمًا</h2></div></div>
        {(life||[]).filter((x:any)=>x.points>0).slice(0,7).map((x:any,i:number)=><div className="rank-row" key={x.employee_id}><span className="rank-number">{String(i+1).padStart(2,'0')}</span><div><strong>{x.game_name||x.discord_username||x.discord_user_id}</strong><small>${Number(x.invoice_total||0).toLocaleString()} فواتير</small></div><b>{x.points} نقطة</b></div>)}
        {!(life||[]).some((x:any)=>x.points>0)&&<div className="empty-state">لا يوجد سجل نشاط بعد.</div>}
      </article>
    </section>

    <section className="panel-card week-history">
      <div className="panel-head"><div><span>WEEK HISTORY</span><h2>سجل الأسابيع</h2></div></div>
      <div className="cycle-strip">{cycles?.map((c:any)=><div className={c.is_current?'current':''} key={c.id}><span>{c.is_current?'الأسبوع الحالي':'أسبوع مغلق'}</span><strong>{new Date(c.starts_at).toLocaleDateString('ar-SA')}</strong><small>{c.is_current?'مستمر الآن':c.ends_at?`أغلق ${new Date(c.ends_at).toLocaleDateString('ar-SA')}`:'مغلق'}</small></div>)}</div>
    </section>

    <AdminControls employees={(employees||[]).filter((e:any)=>e.role==='employee'||e.role==='hr')} recruitmentOpen={recruitmentOpen}/>
  </StaffShell>;
}
