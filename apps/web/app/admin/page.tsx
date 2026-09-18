import { requireRole } from '../../lib/access';
import { adminDb } from '../../lib/database';
import { discordProfiles } from '../../lib/discord';
import AdminControls from './AdminControls';
import StaffShell from '../components/StaffShell';
import DiscordPerson from '../components/DiscordPerson';
export const dynamic='force-dynamic';

export default async function Admin(){
  const a=await requireRole('boss');
  const name=a.user?.user_metadata?.full_name||a.employee?.game_name||a.employee?.discord_username||(a.role==='owner'?'Owner':'Boss');
  if(a.locked) return <StaffShell role={a.role} name={name} username={a.username} avatarUrl={a.avatarUrl} section="ADMIN"><div className="locked-state"><span>LOCKED</span><h1>الحساب موقوف</h1></div></StaffShell>;
  const db=adminDb();
  const [{data:week},{data:life},{data:employees},{data:setting},{data:modSetting},{count:online},{data:cycles},{data:auditRows}]=await Promise.all([
    db.from('current_week_stats').select('*').order('points',{ascending:false}),
    db.from('lifetime_stats').select('*').order('points',{ascending:false}),
    db.from('employees').select('*').order('discord_username'),
    db.from('bot_settings').select('value').eq('guild_id',process.env.DISCORD_GUILD_ID!).eq('key','recruitment_open').maybeSingle(),
    db.from('bot_settings').select('value').eq('guild_id',process.env.DISCORD_GUILD_ID!).eq('key','weekly_vehicle_mod_requirement').maybeSingle(),
    db.from('attendance').select('*',{count:'exact',head:true}).is('clock_out',null),
    db.from('weekly_cycles').select('*').order('starts_at',{ascending:false}).limit(8),
    db.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(25),
  ]);
  const total=(week||[]).reduce((x:any,r:any)=>({tool:x.tool+(r.tool_sales||0),mods:x.mods+(r.vehicle_mods||0),points:x.points+(r.points||0),money:x.money+Number(r.invoice_total||0)}),{tool:0,mods:0,points:0,money:0});
  const recruitmentOpen=setting?.value===undefined?true:setting.value==='true'; const modRequirement=Number(modSetting?.value||0)||0;
  const active=(employees||[]).filter((e:any)=>e.is_active&&e.employment_status==='active'); const current=(cycles||[]).find((c:any)=>c.is_current);
  const {data:deliveries}=current?await db.from('weekly_resource_deliveries').select('*').eq('cycle_id',current.id):{data:[] as any[]};
  const deliveryMap=new Map((deliveries||[]).map((d:any)=>[d.employee_id,d.quantity]));
  const profiles=await discordProfiles([...(employees||[]).map((e:any)=>e.discord_user_id),...(auditRows||[]).map((x:any)=>x.actor_discord_id)]);
  const empById=new Map((employees||[]).map((e:any)=>[e.id,e]));
  const employeeUi=(employees||[]).map((e:any)=>{const p=profiles.get(e.discord_user_id);return {...e,role:(p?.role&&p.role!=='applicant'?p.role:e.role),discord_display_name:p?.displayName||e.game_name||e.discord_username,discord_live_username:p?.username||e.discord_username,avatar_url:p?.avatarUrl||null};});
  return <StaffShell role={a.role} name={name} username={a.username} avatarUrl={a.avatarUrl} section="MANAGEMENT">
    <section id="overview" className="staff-hero compact-hero"><div><span className={`work-status ${recruitmentOpen?'online':'offline'}`}>{recruitmentOpen?'التقديم مفتوح':'التقديم مغلق'}</span><h1>لوحة الإدارة العليا</h1><p>إدارة الورشة، النشاط الأسبوعي، الموظفين والمتطلبات من مكان واحد.</p></div><div className="profile-chip"><span>الموظفون النشطون</span><strong>{active.length}</strong><small>{online||0} داخل الدوام الآن</small></div></section>

    <section id="stats" className="metric-grid metric-grid-5"><article className="metric-card featured"><span>إجمالي نقاط الأسبوع</span><strong>{total.points}</strong><small>نشاط الفريق</small></article><article className="metric-card"><span>تعديلات المركبات</span><strong>{total.mods}</strong><small>هذا الأسبوع</small></article><article className="metric-card"><span>بيع العدة</span><strong>{total.tool}</strong><small>هذا الأسبوع</small></article><article className="metric-card"><span>قيمة الفواتير</span><strong>${total.money.toLocaleString()}</strong><small>هذا الأسبوع</small></article><article className="metric-card"><span>داخل الدوام</span><strong>{online||0}</strong><small>الآن</small></article></section>

    <section id="leaderboard" className="dashboard-grid equal">
      <article className="panel-card leaderboard"><div className="panel-head"><div><span>WEEKLY LEADERBOARD</span><h2>الأكثر نشاطًا هذا الأسبوع</h2></div></div>{(week||[]).filter((x:any)=>x.points>0).slice(0,7).map((x:any,i:number)=>{const e=empById.get(x.employee_id) as any;return <div className="rank-row person-rank" key={x.employee_id}><span className={`rank-number top-${i+1}`}>{String(i+1).padStart(2,'0')}</span><DiscordPerson profile={profiles.get(x.discord_user_id)} fallback={x.game_name||x.discord_username||x.discord_user_id}/><b>{x.points} نقطة</b></div>})}{!(week||[]).some((x:any)=>x.points>0)&&<div className="empty-state">لا يوجد نشاط مسجل لهذا الأسبوع.</div>}</article>
      <article className="panel-card leaderboard"><div className="panel-head"><div><span>ALL TIME</span><h2>الأكثر نشاطًا دائمًا</h2></div></div>{(life||[]).filter((x:any)=>x.points>0).slice(0,7).map((x:any,i:number)=><div className="rank-row person-rank" key={x.employee_id}><span className="rank-number">{String(i+1).padStart(2,'0')}</span><DiscordPerson profile={profiles.get(x.discord_user_id)} fallback={x.game_name||x.discord_username||x.discord_user_id}/><b>{x.points} نقطة</b></div>)}{!(life||[]).some((x:any)=>x.points>0)&&<div className="empty-state">لا يوجد سجل نشاط بعد.</div>}</article>
    </section>

    <section className="panel-card week-history"><div className="panel-head"><div><span>WEEK HISTORY</span><h2>سجل الأسابيع</h2></div></div><div className="cycle-strip">{cycles?.map((c:any)=><div className={c.is_current?'current':''} key={c.id}><span>{c.is_current?'الأسبوع الحالي':'أسبوع مغلق'}</span><strong>{new Date(c.starts_at).toLocaleDateString('ar-SA')}</strong><small>{c.is_current?'مستمر الآن':c.ends_at?`أغلق ${new Date(c.ends_at).toLocaleDateString('ar-SA')}`:'مغلق'}</small></div>)}</div></section>

    <section id="requirements" className="panel-card"><div className="panel-head"><div><span>WEEKLY REQUIREMENTS</span><h2>متطلبات الموظفين هذا الأسبوع</h2></div><b>شرط التعديلات: {modRequirement}</b></div><div className="staff-requirements">{active.map((e:any)=>{const w=(week||[]).find((x:any)=>x.employee_id===e.id);const mods=w?.vehicle_mods||0;const qty=deliveryMap.get(e.id);const complete=(!modRequirement||mods>=modRequirement)&&qty!==undefined;return <div key={e.id}><DiscordPerson profile={profiles.get(e.discord_user_id)} fallback={e.game_name||e.discord_username||e.discord_user_id} badge={e.role==='hr'?'HR':'Employee'}/><div className="requirement-values"><span>التعديلات <b>{mods} / {modRequirement||'—'}</b></span><span>الموارد <b>{qty!==undefined?`سلّم ${qty}`:'لم يسلّم'}</b></span><span className={`status-text ${complete?'accepted':'pending'}`}>{complete?'مكتمل':'ناقص'}</span></div></div>})}</div></section>


    <section id="audit" className="panel-card audit-timeline"><div className="panel-head"><div><span>ADMIN LOG</span><h2>آخر الحركات الإدارية</h2></div><b>{auditRows?.length||0}</b></div><div className="timeline-list">{(auditRows||[]).map((row:any)=><div className="timeline-row" key={row.id}><div className="timeline-time">{new Date(row.created_at).toLocaleTimeString('ar-SA',{hour:'2-digit',minute:'2-digit'})}</div><DiscordPerson profile={profiles.get(row.actor_discord_id)} fallback={row.actor_discord_id||'SYSTEM'} badge={row.metadata?.source||'Discord'}/><div className="timeline-action"><strong>{String(row.action).replaceAll('_',' ')}</strong><small>{row.target_type||'—'} {row.target_id||''}</small></div></div>)}</div></section>

    <section id="controls"><AdminControls employees={employeeUi.filter((e:any)=>e.role==='employee'||e.role==='hr')} recruitmentOpen={recruitmentOpen} modRequirement={modRequirement}/></section>
  </StaffShell>;
}
