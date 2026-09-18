'use client';
import {FormEvent,useState} from 'react';

async function post(body:any){const r=await fetch('/api/admin/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||'تعذر التنفيذ');return j;}
export default function AdminControls({employees,recruitmentOpen,modRequirement}:{employees:any[],recruitmentOpen:boolean,modRequirement:number}){
  const [msg,setMsg]=useState('');
  async function action(body:any){setMsg('جاري التنفيذ...');try{await post(body);setMsg('تم تنفيذ الإجراء ✅');window.location.reload();}catch(e:any){setMsg(e.message);}}
  async function form(e:FormEvent<HTMLFormElement>,type:string){e.preventDefault();const body:any=Object.fromEntries(new FormData(e.currentTarget).entries());body.action=type;await action(body);}
  const EmployeeSelect=()=> <select name="discord_id" required defaultValue=""><option value="" disabled>اختر الموظف</option>{employees.map(e=><option key={e.id} value={e.discord_user_id}>{e.game_name||e.discord_username||e.discord_user_id}</option>)}</select>;
  return <section className="management-actions admin-actions">
    <div className="section-title-line"><div><span>MANAGEMENT CONTROLS</span><h2>التحكم الإداري</h2></div>{msg&&<p>{msg}</p>}</div>
    <div className="admin-control-grid">
      <article className="recruitment-control"><div><span>RECRUITMENT</span><h3>حالة التقديم</h3><p>الحالة الآن: <b className={recruitmentOpen?'good':'bad'}>{recruitmentOpen?'مفتوح':'مغلق'}</b></p></div><div><button className="control-btn" onClick={()=>action({action:'recruitment',open:true})}>فتح التقديم</button><button className="control-btn danger" onClick={()=>action({action:'recruitment',open:false})}>إغلاق التقديم</button></div></article>
      <article className="recruitment-control week-close"><div><span>WEEK RESET</span><h3>إغلاق الأسبوع</h3><p>يحفظ التقرير الحالي ثم يبدأ أسبوع جديد من صفر، بدون التأثير على السجل الدائم.</p></div><button className="control-btn" onClick={()=>{if(confirm('تأكيد إغلاق الأسبوع وحفظ النتائج؟'))void action({action:'close_week'});}}>إغلاق الأسبوع الآن</button></article>
    </div>
    <div className="action-accordion-grid">
      <details className="action-panel"><summary><span>🚗</span><div><strong>شرط تعديلات المركبات</strong><small>الحالي: {modRequirement||0} تعديل لكل موظف أسبوعيًا</small></div></summary><form onSubmit={e=>form(e,'set_mod_requirement')}><label>عدد التعديلات المطلوبة<input name="count" type="number" min="0" max="100" required defaultValue={modRequirement||0}/></label><button className="silver-btn small">حفظ الشرط</button></form></details>
      <details className="action-panel"><summary><span>📦</span><div><strong>تسجيل تسليم موارد</strong><small>اختر الموظف واكتب الكمية فقط</small></div></summary><form onSubmit={e=>form(e,'resource_delivery')}><label>الموظف<EmployeeSelect/></label><label>الكمية<input name="quantity" type="number" min="0" required/></label><button className="silver-btn small">تسجيل التسليم</button></form></details>
      <details className="action-panel danger-panel"><summary><span>⛔</span><div><strong>فصل موظف</strong><small>إيقاف الحساب وسحب رتبة الموظف</small></div></summary><form onSubmit={e=>form(e,'terminate')}><label>الموظف<EmployeeSelect/></label><label>السبب<textarea name="reason" required placeholder="سبب الفصل"/></label><button className="silver-btn small">تأكيد الفصل</button></form></details>
      <details className="action-panel"><summary><span>↻</span><div><strong>إعادة تفعيل موظف</strong><small>إرجاع صلاحيات الموظف وفتح الموقع</small></div></summary><form onSubmit={e=>form(e,'reactivate')}><label>الموظف<EmployeeSelect/></label><button className="silver-btn small">إعادة التفعيل</button></form></details>
    </div>
  </section>;
}
