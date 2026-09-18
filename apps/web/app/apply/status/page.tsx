import Link from 'next/link';
import { cookies } from 'next/headers';
import { adminDb } from '../../../lib/database';
export const dynamic='force-dynamic';

const meta:Record<string,{label:string;title:string;copy:string;step:number}>={
  pending:{label:'تحت المراجعة',title:'طلبك وصلنا',copy:'تم استلام تقديمك وهو الآن بانتظار مراجعة الإدارة.',step:1},
  preaccepted:{label:'مقبول مبدئيًا',title:'تم قبولك مبدئيًا',copy:'الخطوة التالية: ادخل سيرفر Discord ثم توجه إلى لوحة استكمال الموارد البشرية.',step:2},
  profile_submitted:{label:'بانتظار HR',title:'تم استلام بياناتك',copy:'تم إرسال بيانات الموارد البشرية، وهي الآن تحت مراجعة HR.',step:3},
  interview:{label:'مقابلة',title:'تم تحويلك للمقابلة',copy:'راجع Discord لإكمال المقابلة مع فريق الموارد البشرية.',step:4},
  accepted:{label:'مقبول نهائيًا',title:'أهلًا بك في Legendary',copy:'تم قبولك كموظف. سجّل الدخول عبر Discord ليتم التعرف على حسابك ورتبتك.',step:5},
  rejected:{label:'مرفوض',title:'تم رفض الطلب',copy:'لا يمكنك إعادة التقديم حاليًا. يبقى الطلب مقفلًا حتى تقوم الإدارة برفع الرفض.',step:1},
};

export default async function ApplicationStatus(){
  const store=await cookies();
  const appId=store.get('legendary_app')?.value;
  let application:any=null;
  if(appId){
    const db=adminDb();
    const {data}=await db.from('applications').select('applicant_name,status,discord_invite_url,updated_at').eq('id',appId).maybeSingle();
    application=data;
  }

  if(!application){
    return <main className="status-page"><section className="status-shell empty-state">
      <img className="status-logo" src="/legendary-logo.png" alt="Legendary"/>
      <p className="eyebrow">LEGENDARY WORKSHOP</p>
      <h1>لا يوجد تقديم مرتبط بهذا الجهاز</h1>
      <p>إذا لم تقدم من قبل، ابدأ من صفحة التقديم.</p>
      <Link className="silver-btn" href="/apply">الذهاب للتقديم</Link>
    </section></main>;
  }

  const state=meta[application.status]||meta.pending;
  const rejected=application.status==='rejected';
  const steps=['استلام الطلب','المراجعة الأولية','الموارد البشرية','المقابلة / القرار','الانضمام'];

  return <main className="status-page">
    <section className={`status-shell ${rejected?'rejected':''}`}>
      <div className="status-brand">
        <img className="status-logo" src="/legendary-logo.png" alt="Legendary"/>
        <div><p className="eyebrow">LEGENDARY WORKSHOP</p><span>حالة التقديم</span></div>
      </div>

      <div className="status-hero">
        <span className={`status-badge status-${application.status}`}>{state.label}</span>
        <h1>{state.title}</h1>
        <p>أهلًا {application.applicant_name}، {state.copy}</p>
      </div>

      {!rejected&&<div className="application-progress">
        {steps.map((label,index)=>{
          const number=index+1; const done=number<state.step; const active=number===state.step;
          return <div className={`progress-item ${done?'done':''} ${active?'active':''}`} key={label}>
            <span>{done?'✓':number}</span><small>{label}</small>
          </div>;
        })}
      </div>}

      <div className="status-action-card">
        {application.status==='pending'&&<><h2>بانتظار المراجعة</h2><p>لا تحتاج تسوي أي شيء الآن. أول ما تتغير حالة تقديمك ستظهر هنا تلقائيًا.</p></>}
        {application.status==='preaccepted'&&<><h2>الخطوة التالية</h2><p>ادخل Discord، وبعدها توجه إلى شات استكمال التقديم واضغط زر الموارد البشرية.</p>{application.discord_invite_url&&<a className="silver-btn" href={application.discord_invite_url} target="_blank" rel="noreferrer">دخول سيرفر Discord</a>}</>}
        {application.status==='profile_submitted'&&<><h2>تم إرسال بياناتك</h2><p>فريق HR يراجع بياناتك الآن. ستتغير الصفحة عند اتخاذ القرار.</p></>}
        {application.status==='interview'&&<><h2>موعدك في Discord</h2><p>راجع التكت الخاص بك في Discord لإكمال المقابلة.</p>{application.discord_invite_url&&<a className="silver-btn" href={application.discord_invite_url} target="_blank" rel="noreferrer">فتح Discord</a>}</>}
        {application.status==='accepted'&&<><h2>تم قبولك كموظف</h2><p>سجل دخولك بحساب Discord، وبعدها الموقع يتعرف على حسابك ورتبتك ويعرض لوحة صلاحياتك.</p><Link className="silver-btn" href="/login">تسجيل الدخول عبر Discord</Link></>}
        {application.status==='rejected'&&<><h2>التقديم مقفل على حسابك</h2><p>إذا قامت الإدارة برفع الرفض، ستتغير حالتك هنا ويمكنك متابعة الخطوات بدون تقديم جديد.</p></>}
      </div>

      <p className="status-footnote">يتم تحديث الحالة من نفس نظام Legendary المرتبط بـ Discord.</p>
    </section>
  </main>;
}
