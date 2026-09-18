import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminDb } from '../lib/database';
export const dynamic='force-dynamic';

const rules=[
  {n:'01',title:'الالتزام بالزي الرسمي',text:'يجب الالتزام بالزي الرسمي المعتمد للورشة طوال فترة العمل.'},
  {n:'02',title:'منع الأعمال الإجرامية',text:'يُمنع القيام بأي عمل إجرامي أثناء ارتداء الزي الرسمي، ومخالفة ذلك يترتب عليها الفصل.'},
  {n:'03',title:'التعامل مع المشاكل',text:'عند حدوث مشكلة ارجع للمشرف وتجنب الجدال.'},
  {n:'04',title:'احترام الزبائن',text:'يُمنع التعامل بقلة أدب أو حدة مع أي زبون.'},
  {n:'05',title:'الأسعار المعتمدة',text:'يجب الالتزام بالأسعار المعتمدة دون زيادة أو نقصان.'},
  {n:'06',title:'التعامل مع المخالفات',text:'ارفع المخالفة للإدارة ولا ترد عليها بمخالفة.'},
  {n:'07',title:'تسجيل الدخول والخروج',text:'يجب تسجيل الدخول عند بدء العمل والخروج عند الانتهاء.'},
  {n:'08',title:'الفواتير الوهمية',text:'يُمنع إنشاء أو تكرار فواتير وهمية.'},
  {n:'09',title:'تعليمات الإدارة',text:'يجب الالتزام بتوجيهات المشرفين والإدارة.'},
];

export default async function Home(){
  const db=adminDb();
  const store=await cookies();
  const applicationId=store.get('legendary_app')?.value;
  if(applicationId){
    const {data:application}=await db.from('applications').select('id').eq('id',applicationId).maybeSingle();
    if(application) redirect('/apply/status');
  }
  const {data:rows}=await db.from('current_week_stats').select('*');
  const stats=(rows??[]).reduce((a:any,r:any)=>({tool:a.tool+(r.tool_sales||0),mods:a.mods+(r.vehicle_mods||0),money:a.money+Number(r.invoice_total||0)}),{tool:0,mods:0,money:0});
  const {count:online}=await db.from('attendance').select('*',{count:'exact',head:true}).is('clock_out',null);
  const {data:setting}=await db.from('bot_settings').select('value').eq('guild_id',process.env.DISCORD_GUILD_ID!).eq('key','recruitment_open').maybeSingle();
  const recruitmentOpen=setting?.value===undefined?true:setting.value==='true';

  return <main className="site-shell">
    <nav className="topbar">
      <Link className="brand-mini" href="/">
        <img src="/legendary-logo.png" alt="Legendary"/>
        <span>LEGENDARY</span>
      </Link>
      <Link className="ghost-btn" href="/login">دخول الموظفين</Link>
    </nav>

    <section className="landing-hero">
      <img className="hero-logo" src="/legendary-logo.png" alt="Legendary Workshop"/>
      <div>
        <p className="eyebrow">LEGENDARY WORKSHOP</p>
        <h1>أهلاً بك في <span>Legendary</span></h1>
        <p className="hero-copy">اقرأ قوانين الورشة قبل إرسال طلب الانضمام.</p>
      </div>
    </section>

    <section className="rules-section">
      <div className="section-heading">
        <p>WORKSHOP RULES</p>
        <h2>قوانين Legendary</h2>
      </div>
      <div className="rules-grid">
        {rules.map(rule=><article className="rule-card" key={rule.n}>
          <span className="rule-number">{rule.n}</span>
          <h3>{rule.title}</h3>
          <p>{rule.text}</p>
        </article>)}
      </div>
    </section>

    <section className="apply-cta">
      {recruitmentOpen ? <>
        <span className="status-pill open">التقديم مفتوح</span>
        <h2>جاهز للانضمام؟</h2>
        <p>بعد إرسال الطلب تتم مراجعته من فريق الموارد البشرية.</p>
        <Link className="silver-btn" href="/apply">التقديم الآن</Link>
      </> : <>
        <span className="status-pill closed">التقديم مغلق</span>
        <h2>التقديم مغلق حاليًا</h2>
        <p>سيتم فتح التقديم عند توفر شواغر جديدة.</p>
      </>}
    </section>

    <section className="weekly-block">
      <div className="section-heading compact">
        <p>THIS WEEK</p>
        <h2>إنجازنا هذا الأسبوع</h2>
      </div>
      <div className="stats-row">
        <div><strong>{stats.tool}</strong><span>بيع عِدّة</span></div>
        <div><strong>{stats.mods}</strong><span>تعديل مركبات</span></div>
        <div><strong>{stats.tool+stats.mods}</strong><span>إجمالي الخدمات</span></div>
        <div><strong>${stats.money.toLocaleString()}</strong><span>قيمة الفواتير</span></div>
        <div><strong>{online??0}</strong><span>داخل الدوام الآن</span></div>
      </div>
    </section>

    <footer>Legendary Workshop</footer>
  </main>;
}
