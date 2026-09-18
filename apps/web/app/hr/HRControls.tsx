'use client';
import {FormEvent,useState} from 'react';

async function post(body:any){const r=await fetch('/api/hr/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||'تعذر التنفيذ');return j;}
export default function HRControls({employees,leaves}:{employees:any[],leaves:any[]}){
  const [msg,setMsg]=useState('');
  async function form(e:FormEvent<HTMLFormElement>,action:string){e.preventDefault();setMsg('جاري التنفيذ...');try{const body:any=Object.fromEntries(new FormData(e.currentTarget).entries());body.action=action;await post(body);setMsg('تم تنفيذ الإجراء ✅');window.location.reload();}catch(err:any){setMsg(err.message);}}
  async function reviewLeave(id:string,decision:string){setMsg('جاري التنفيذ...');try{await post({action:'leave_review',id,decision});setMsg('تم ✅');window.location.reload();}catch(err:any){setMsg(err.message);}}
  const EmployeeSelect=()=> <select name="discord_id" required defaultValue=""><option value="" disabled>اختر الموظف</option>{employees.map(e=><option key={e.id} value={e.discord_user_id}>{e.game_name||e.discord_username||e.discord_user_id}</option>)}</select>;
  return <section className="management-actions">
    <div className="section-title-line"><div><span>HR ACTIONS</span><h2>إجراءات الموارد البشرية</h2></div>{msg&&<p>{msg}</p>}</div>
    <div className="action-accordion-grid">
      <details className="action-panel"><summary><span>🚪</span><div><strong>خروج إجباري</strong><small>إنهاء شفت موظف مع تسجيل السبب</small></div></summary><form onSubmit={e=>form(e,'force_out')}><label>الموظف<EmployeeSelect/></label><label>السبب<textarea name="reason" required placeholder="سبب الخروج الإجباري"/></label><button className="silver-btn small">تنفيذ</button></form></details>
      <details className="action-panel"><summary><span>⚠️</span><div><strong>إنذار موظف</strong><small>إضافة إنذار وإرساله للّوق</small></div></summary><form onSubmit={e=>form(e,'warning')}><label>الموظف<EmployeeSelect/></label><label>سبب الإنذار<textarea name="reason" required placeholder="اكتب سبب الإنذار"/></label><button className="silver-btn small">إرسال الإنذار</button></form></details>
      <details className="action-panel"><summary><span>✎</span><div><strong>تعديل بيانات موظف</strong><small>تحديث بيانات ملفه الوظيفي</small></div></summary><form onSubmit={e=>form(e,'edit_employee')}><label>الموظف<EmployeeSelect/></label><label>اسم اللعبة<input name="game_name"/></label><label>رقم الجوال<input name="game_phone"/></label><label>Citizen ID<input name="citizen_id"/></label><button className="silver-btn small">حفظ التعديلات</button></form></details>
      <details className="action-panel"><summary><span>↻</span><div><strong>رفع رفض متقدم</strong><small>السماح له بإكمال مسار التوظيف</small></div></summary><form onSubmit={e=>form(e,'lift_rejection')}><label>Discord ID<input name="discord_id" required placeholder="Discord ID"/></label><button className="silver-btn small">رفع الرفض</button></form></details>
    </div>
    <article className="panel-card leave-review-card"><div className="panel-head"><div><span>LEAVE REVIEW</span><h2>طلبات الإجازة المعلقة</h2></div><b>{leaves.length}</b></div>{leaves.length?<div className="review-list">{leaves.map((l:any)=><div key={l.id}><div><strong>{l.employees?.game_name||l.employees?.discord_username||l.employees?.discord_user_id}</strong><span>{l.starts_on} ← {l.ends_on}</span><small>{l.reason||'بدون سبب'}</small></div><div className="review-buttons"><button onClick={()=>reviewLeave(l.id,'approve')}>قبول</button><button className="danger" onClick={()=>reviewLeave(l.id,'reject')}>رفض</button></div></div>)}</div>:<div className="empty-state">لا توجد طلبات إجازة معلقة.</div>}</article>
  </section>;
}
