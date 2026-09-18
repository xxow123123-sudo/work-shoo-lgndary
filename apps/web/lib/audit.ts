import { adminDb } from './database';
import { sendDiscord } from './discord';

const labels:Record<string,string>={
  website_login:'تسجيل دخول للموقع',website_logout:'تسجيل خروج من الموقع',application_submitted:'تقديم جديد من الموقع',
  forced_clock_out:'خروج إجباري',employee_warning:'إنذار موظف',employee_profile_edit:'تعديل بيانات موظف',
  application_rejection_lifted:'رفع رفض متقدم',employee_manual_hire:'توظيف مباشر',leave_approved:'قبول إجازة',leave_rejected:'رفض إجازة',
  leave_requested:'طلب إجازة',recruitment_open:'فتح التقديم',recruitment_close:'إغلاق التقديم',employee_terminated:'فصل موظف',
  employee_reactivated:'إعادة تفعيل موظف',weekly_mod_requirement:'تعديل شرط التعديلات الأسبوعي',weekly_resources_received:'تسجيل تسليم موارد',
  close_week:'إغلاق الأسبوع',
};
function short(v:any,n=1000){const s=typeof v==='string'?v:JSON.stringify(v);return (s||'—').length>n?(s||'').slice(0,n-1)+'…':s||'—';}
export async function auditEvent(actor:string|null,action:string,targetType?:string,targetId?:string,metadata:any={},source='website'){
  const full={...metadata,source};
  await adminDb().from('audit_logs').insert({actor_discord_id:actor,action,target_type:targetType||null,target_id:targetId||null,metadata:full});
  const actorText=actor?`<@${actor}>`:'SYSTEM';
  const target=targetId?`${targetType||'target'}: ${targetId}`:'—';
  const details=Object.keys(metadata||{}).length?short(metadata,2200):'—';
  await sendDiscord('admin_logs_channel_id',{embeds:[{title:labels[action]||action.replaceAll('_',' '),description:`المنفذ: ${actorText}\nالمصدر: **${source==='website'?'الموقع':source}**\nالهدف: ${target}\nالتفاصيل: ${details}`,timestamp:new Date().toISOString()}]}).catch(()=>false);
}
