import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { adminDb } from '../../lib/database';
import ApplyForm from './ApplyForm';
export const dynamic='force-dynamic';

export default async function Apply(){
  const db=adminDb();
  const store=await cookies();
  const applicationId=store.get('legendary_app')?.value;
  if(applicationId){
    const {data:application}=await db.from('applications').select('id').eq('id',applicationId).maybeSingle();
    if(application) redirect('/apply/status');
  }
  const {data:setting}=await db.from('bot_settings').select('value').eq('guild_id',process.env.DISCORD_GUILD_ID!).eq('key','recruitment_open').maybeSingle();
  const open=setting?.value===undefined?true:setting.value==='true';
  return <main className="form-page">
    <div className="form-top">
      <Link className="brand-mini" href="/"><img src="/legendary-logo.png" alt="Legendary"/><span>LEGENDARY</span></Link>
      <Link className="status-link" href="/">العودة للرئيسية</Link>
    </div>
    <section className="form-card">
      <p className="eyebrow">JOIN THE TEAM</p>
      <h1>التقديم على Legendary</h1>
      <p className="form-intro">تأكد من كتابة بيانات صحيحة. سيتم ربط طلبك بحساب Discord من خلال الـ ID.</p>
      {!open ? <div className="closed-box"><h2>التقديم مغلق حاليًا</h2><p>سيتم فتحه عند توفر شواغر جديدة.</p></div> : <ApplyForm/>}
    </section>
  </main>;
}
