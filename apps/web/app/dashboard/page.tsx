import { requireRole } from '../../lib/access';
import { adminDb } from '../../lib/database';
import LeaveForm from './LeaveForm';
import StaffShell from '../components/StaffShell';
export const dynamic='force-dynamic';

function serviceName(type:string){return type==='vehicle_mod'?'تعديل مركبة':'بيع عدة';}

export default async function Dashboard(){
  const a=await requireRole('employee');
  if(a.locked) return <StaffShell role="employee" name={a.employee?.game_name||a.employee?.discord_username} section="ACCOUNT"><div className="locked-state"><span>LOCKED</span><h1>الحساب الوظيفي موقوف</h1><p>{a.employee?.status_reason||'راجع الإدارة لمعرفة حالة حسابك.'}</p></div></StaffShell>;
  const db=adminDb(); const employee=a.employee;
  const [{data:week},{data:life},{data:warnings},{data:leaves},{data:openShift},{data:recent},{data:modSetting},{data:cycle}]=await Promise.all([
    db.from('current_week_stats').select('*').eq('employee_id',employee.id).maybeSingle(),
    db.from('lifetime_stats').select('*').eq('employee_id',employee.id).maybeSingle(),
    db.from('warnings').select('*').eq('employee_id',employee.id).order('created_at',{ascending:false}).limit(8),
    db.from('leave_requests').select('*').eq('employee_id',employee.id).order('created_at',{ascending:false}).limit(8),
    db.from('attendance').select('*').eq('employee_id',employee.id).is('clock_out',null).maybeSingle(),
    db.from('service_records').select('*').eq('employee_id',employee.id).order('created_at',{ascending:false}).limit(8),
    db.from('bot_settings').select('value').eq('guild_id',process.env.DISCORD_GUILD_ID!).eq('key','weekly_vehicle_mod_requirement').maybeSingle(),
    db.from('weekly_cycles').select('*').eq('is_current',true).limit(1).maybeSingle(),
  ]);
  const modRequirement=Number(modSetting?.value||0)||0;
  const {data:delivery}=cycle?await db.from('weekly_resource_deliveries').select('*').eq('cycle_id',cycle.id).eq('employee_id',employee.id).maybeSingle():{data:null as any};
  const name=employee.game_name||employee.discord_username||a.discordId;
  return <StaffShell role={a.role} name={name} section="EMPLOYEE">
    <section className="staff-hero compact-hero">
      <div>
        <span className={`work-status ${openShift?'online':'offline'}`}>{openShift?'داخل الدوام الآن':'خارج الدوام'}</span>
        <h1>أهلاً، {name}</h1>
        <p>تابع نشاطك الأسبوعي وسجلك الوظيفي من مكان واحد.</p>
      </div>
      <div className="profile-chip">
        <span>Citizen ID</span><strong>{employee.citizen_id||'—'}</strong>
        <small>{employee.game_phone||'رقم الجوال غير مسجل'}</small>
      </div>
    </section>

    <section className="metric-grid metric-grid-4">
      <article className="metric-card featured"><span>نقاط الأسبوع</span><strong>{week?.points||0}</strong><small>بيع عدة = 1 • تعديل = 5</small></article>
      <article className="metric-card"><span>تعديلات المركبات</span><strong>{week?.vehicle_mods||0}{modRequirement?` / ${modRequirement}`:''}</strong><small>{modRequirement&&Number(week?.vehicle_mods||0)>=modRequirement?'المتطلب مكتمل':'هذا الأسبوع'}</small></article>
      <article className="metric-card"><span>بيع العدة</span><strong>{week?.tool_sales||0}</strong><small>هذا الأسبوع</small></article>
      <article className="metric-card"><span>قيمة الفواتير</span><strong>${Number(week?.invoice_total||0).toLocaleString()}</strong><small>هذا الأسبوع</small></article>
    </section>

    <section className="panel-card">
      <div className="panel-head"><div><span>WEEKLY CHECKLIST</span><h2>متطلبات الأسبوع</h2></div></div>
      <div className="lifetime-stat"><span>تعديلات المركبات المطلوبة</span><strong>{modRequirement?`${week?.vehicle_mods||0} / ${modRequirement}`:'غير محدد'}</strong></div>
      <div className="lifetime-stat"><span>تسليم الموارد</span><strong>{delivery?`تم التسليم: ${delivery.quantity}`:'لم يتم التسليم'}</strong></div>
    </section>

    <section className="dashboard-grid two-one">
      <article className="panel-card">
        <div className="panel-head"><div><span>WEEK ACTIVITY</span><h2>آخر العمليات</h2></div><b>{recent?.length||0} ظاهرة</b></div>
        <div className="activity-list">
          {recent?.length?recent.map((r:any)=><div className="activity-row" key={r.id}>
            <div className="activity-icon">{r.service_type==='vehicle_mod'?'🚗':'🧰'}</div>
            <div><strong>{serviceName(r.service_type)}</strong><span>{new Date(r.created_at).toLocaleString('ar-SA')}</span></div>
            <div className="activity-amount"><strong>${Number(r.invoice_amount||0).toLocaleString()}</strong><span>+{r.points} نقطة</span></div>
          </div>):<div className="empty-state">لا توجد عمليات مسجلة حتى الآن.</div>}
        </div>
      </article>

      <article className="panel-card lifetime-card">
        <div className="panel-head"><div><span>LIFETIME</span><h2>السجل الدائم</h2></div></div>
        <div className="lifetime-stat"><span>إجمالي النقاط</span><strong>{life?.points||0}</strong></div>
        <div className="lifetime-stat"><span>إجمالي التعديلات</span><strong>{life?.vehicle_mods||0}</strong></div>
        <div className="lifetime-stat"><span>إجمالي بيع العدة</span><strong>{life?.tool_sales||0}</strong></div>
        <div className="lifetime-stat"><span>إجمالي الفواتير</span><strong>${Number(life?.invoice_total||0).toLocaleString()}</strong></div>
      </article>
    </section>

    <section className="dashboard-grid equal">
      <article className="panel-card">
        <div className="panel-head"><div><span>WARNINGS</span><h2>الإنذارات</h2></div><b>{warnings?.length||0}</b></div>
        <div className="simple-list">
          {warnings?.length?warnings.map((w:any)=><div key={w.id}><span className="list-dot warning"/><div><strong>{w.reason}</strong><small>{new Date(w.created_at).toLocaleDateString('ar-SA')}</small></div></div>):<div className="empty-state">لا توجد إنذارات على ملفك.</div>}
        </div>
      </article>
      <article className="panel-card">
        <div className="panel-head"><div><span>LEAVE REQUEST</span><h2>الإجازات</h2></div></div>
        <LeaveForm/>
        <div className="leave-history">
          {leaves?.slice(0,4).map((l:any)=><div key={l.id}><span>{l.starts_on} ← {l.ends_on}</span><b className={`status-text ${l.status}`}>{l.status==='approved'?'مقبولة':l.status==='rejected'?'مرفوضة':l.status==='cancelled'?'ملغاة':'تحت المراجعة'}</b></div>)}
        </div>
      </article>
    </section>
  </StaffShell>;
}
