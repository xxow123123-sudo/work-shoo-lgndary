'use client';
import {FormEvent,useState} from 'react';
export default function LeaveForm(){
  const [msg,setMsg]=useState('');
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setMsg('جاري الإرسال...');const f=new FormData(e.currentTarget);const r=await fetch('/api/employee/leave',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.fromEntries(f.entries()))});const j=await r.json();setMsg(r.ok?'تم إرسال طلب الإجازة':j.error||'تعذر الإرسال');if(r.ok)e.currentTarget.reset();}
  return <form className="leave-form" onSubmit={submit}>
    <label><span>عدد الأيام</span><input type="number" name="days" min="1" max="60" placeholder="مثال: 3" required/></label>
    <label><span>السبب</span><textarea name="reason" placeholder="اكتب السبب باختصار..."/></label>
    <button className="silver-btn small">إرسال طلب الإجازة</button>{msg&&<p className="inline-message">{msg}</p>}
  </form>;
}
