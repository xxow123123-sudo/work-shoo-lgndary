import Link from 'next/link';
import { cookies } from 'next/headers';
import { adminDb } from '../../../lib/database';
import { currentSession } from '../../../lib/auth';
import { redirect } from 'next/navigation';
export const dynamic='force-dynamic';

const meta:Record<string,{label:string;title:string;copy:string;step:number}>={
  pending:{label:'تحت المراجعة',title:'طلبك وصلنا',copy:'تم استلام تقديمك وهو الآن بانتظار مراجعة الإدارة.',step:1},
  preaccepted:{label:'مقبول مبدئيًا',title:'تم قبولك مبدئيًا',copy:'الخطوة التالية: ادخل سيرفر Discord واربط حسابك بالموقع، ثم استكمل بيانات الموارد البشرية من Discord.',step:2},
  profile_submitted:{label:'بانتظار HR',title:'تم استلام بياناتك',copy:'تم إرسال بيانات الموارد البشرية، وهي الآن تحت مراجعة HR.',step:3},
  interview:{label:'مقابلة',title:'تم تحويلك للمقابلة',copy:'راجع Discord لإكمال المقابلة مع فريق الموارد البشرية.',step:4},
  accepted:{label:'مقبول نهائيًا',title:'أهلًا بك في Legendary',copy:'تم قبولك كموظف. إذا كنت مسجلًا بحساب Discord سيتم تحويلك مباشرة إلى لوحة الموظف.',step:5},
  rejected:{label:'مرفوض',title:'تم رفض الطلب',copy:'لا يمكنك إعادة التقديم حاليًا. يبقى الطلب مقفلًا حتى تقوم الإدارة برفع الرفض.',step:1},
};

export default async function ApplicationStatus(){
  const store=await cookies();
  const session=await currentSession();
  const db=adminDb();
  let application:any=null;

  // بعد تسجيل الدخول نعتمد Discord ID نفسه، وليس كوكي المتصفح فقط.
  if(session?.discordId){
    const {data}=await db.from('applications').select('id,applicant_name,status,discord_invite_url,discord_user_id,updated_at').eq('discord_user_id',session.discordId).order('created_at',{ascending:false}).limit(1).maybeSingle();
    application=data;
  }else{
    const appId=store.get('legendary_app')?.value;
    if(appId){
      const {data}=await db.from('applications').select('id,applicant_name,status,discord_invite_url,discord_user_id,updated_at').eq('id',appId).maybeSingle();
      application=data;
    }
  }

  if(application?.status==='accepted' && session?.discordId===application.discord_user_id){
    redirect('/portal');
  }

  if(!application){
    return <main className="status-page"><section className="status-shell empty-state">
      <img className="status-logo" src="/legendary-logo.png" alt="Legendary"/>
      <p className="eyebrow">LEGENDARY WORKSHOP</p>
      <h1>{session?'لا يوجد تقديم مرتبط بحساب Discord هذا':'لا يوجد تقديم مرتبط بهذا الجهاز'}</h1>
      <p>{session?'تأكد أنك سجلت الدخول بنفس حساب Discord ID الموجود في طلب التقديم.':'إذا لم تقدم من قبل، ابدأ من صفحة التقديم.'}</p>
      <Link className="silver-btn" href={session?'/auth/logout':'/apply'}>{session?'تسجيل الخروج وتجربة حساب آخر':'الذهاب للتقديم'}</Link>
    </section></main>;
  }

  const state=meta[application.status]||meta.pending;
  const rejected=application.status==='rejected';
  const steps=['استلام الطلب','المراجعة الأولية','الموارد البشرية','المقابلة / القرار','الانضمام'];
  const discordLinked=Boolean(session?.discordId===application.discord_user_id);

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
        {discordLinked&&<div className="discord-linked-chip"><span></span> Discord مرتبط: @{session?.username}</div>}
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
        {application.status==='preaccepted'&&<>
          <h2>الخطوة التالية</h2>
          <p>أولًا ادخل سيرفر Discord. بعدها اربط نفس حساب Discord بالموقع، ثم من السيرفر توجه إلى شات استكمال التقديم واضغط زر استكمال بيانات التقديم.</p>
          <div className="status-actions">
            {application.discord_invite_url&&<a className="silver-btn" href={application.discord_invite_url} target="_blank" rel="noreferrer">دخول سيرفر Discord</a>}
            {!discordLinked?<a className="status-secondary-btn" href="/auth/discord">تسجيل الدخول بحساب Discord</a>:<Link className="status-secondary-btn" href="/apply/status">تم ربط Discord — تحديث الحالة</Link>}
          </div>
        </>}
        {application.status==='profile_submitted'&&<><h2>تم إرسال بياناتك</h2><p>فريق HR يراجع بياناتك الآن. ستتغير الصفحة عند اتخاذ القرار.</p>{!discordLinked&&<a className="status-secondary-btn" href="/auth/discord">ربط حساب Discord بالموقع</a>}</>}
        {application.status==='interview'&&<><h2>موعدك في Discord</h2><p>راجع التكت الخاص بك في Discord لإكمال المقابلة.</p><div className="status-actions">{application.discord_invite_url&&<a className="silver-btn" href={application.discord_invite_url} target="_blank" rel="noreferrer">فتح Discord</a>}{!discordLinked&&<a className="status-secondary-btn" href="/auth/discord">ربط حساب Discord بالموقع</a>}</div></>}
        {application.status==='accepted'&&<><h2>تم قبولك كموظف</h2><p>اربط حساب Discord مرة واحدة، وبعدها تدخل لوحة الموظف مباشرة ولن تحتاج تعيد تسجيل الدخول كل تحديث.</p><a className="silver-btn" href="/auth/discord">تسجيل الدخول عبر Discord</a></>}
        {application.status==='rejected'&&<><h2>التقديم مقفل على حسابك</h2><p>إذا قامت الإدارة برفع الرفض، ستتغير حالتك هنا ويمكنك متابعة الخطوات بدون تقديم جديد.</p></>}
      </div>

      <p className="status-footnote">يتم تحديث الحالة من نفس نظام Legendary المرتبط بـ Discord.</p>
    </section>
  </main>;
}
