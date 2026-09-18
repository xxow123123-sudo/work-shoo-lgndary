'use client';
import {FormEvent,useState} from 'react';

export default function ApplyForm(){
  const [msg,setMsg]=useState(''); const [sending,setSending]=useState(false);
  const submit=async(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault(); setSending(true); setMsg('جاري إرسال طلبك...');
    const f=new FormData(e.currentTarget); const body=Object.fromEntries(f.entries());
    const r=await fetch('/api/applications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}); const j=await r.json();
    setSending(false);
    if(r.ok || j.has_application){
      window.location.href='/apply/status';
      return;
    }
    setMsg(j.error||'تعذر إرسال الطلب');
  };
  return <form className="legendary-form" onSubmit={submit}>
    <label><span>Discord ID</span><input name="discord_user_id" inputMode="numeric" required placeholder="مثال: 123456789012345678"/></label>
    <label><span>اسمك</span><input name="applicant_name" required placeholder="اكتب اسمك"/></label>
    <label><span>عمرك</span><input name="age" type="number" min="1" max="99" required placeholder="مثال: 21"/></label>
    <label><span>كم ساعة تتواجد في اليوم؟</span><input name="daily_hours" type="number" min="1" max="24" required placeholder="مثال: 4"/></label>
    <label className="agreement"><input name="accepted_rules" type="checkbox" required/><span>قرأت قوانين الورشة وأوافق عليها.</span></label>
    <button className="silver-btn submit-btn" disabled={sending}>{sending?'جاري الإرسال...':'إرسال الطلب'}</button>
    {msg&&<p className="form-message">{msg}</p>}
  </form>;
}
