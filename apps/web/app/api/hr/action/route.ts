import { NextResponse } from 'next/server';
import { currentAccess } from '../../../../lib/access';
import { adminDb } from '../../../../lib/database';
import { discordChannelId, sendDiscord, updateDiscordMemberRole } from '../../../../lib/discord';

function allowed(role:string|null){ return role==='owner'||role==='boss'||role==='hr'; }
async function audit(actor:string,action:string,targetType:string,targetId:string,metadata:any={}){ await adminDb().from('audit_logs').insert({actor_discord_id:actor,action,target_type:targetType,target_id:targetId,metadata}); }
async function createInvite(){
  const channel=await discordChannelId('applicant_panel_channel_id'); if(!channel||!process.env.DISCORD_BOT_TOKEN) return null;
  const r=await fetch(`https://discord.com/api/v10/channels/${channel}/invites`,{method:'POST',headers:{authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({max_age:604800,max_uses:1,unique:true})}).catch(()=>null);
  if(!r?.ok) return process.env.DISCORD_INVITE_URL||null; const j=await r.json(); return `https://discord.gg/${j.code}`;
}

export async function POST(req:Request){
  try{
    const a=await currentAccess(); if(!a.user||!allowed(a.role)||a.locked) return NextResponse.json({error:'غير مصرح'},{status:403});
    const body=await req.json(); const action=body.action; const db=adminDb(); const actor=a.discordId;
    if(action==='force_out'){
      const {data:emp}=await db.from('employees').select('*').eq('discord_user_id',body.discord_id).maybeSingle(); if(!emp) throw new Error('الموظف غير موجود');
      const {data:shift}=await db.from('attendance').select('*').eq('employee_id',emp.id).is('clock_out',null).maybeSingle(); if(!shift) throw new Error('الموظف ليس داخل الدوام');
      await db.from('attendance').update({clock_out:new Date().toISOString(),forced_out:true,forced_out_by_discord_id:actor,forced_out_reason:body.reason||'خروج إجباري من الموقع'}).eq('id',shift.id);
      await sendDiscord('attendance_channel_id',{content:`🚪 **خروج إجباري**\nالموظف: <@${body.discord_id}>\nبواسطة: <@${actor}>\nالسبب: ${body.reason||'-'}`});
      await audit(actor,'forced_clock_out','employee',emp.id,{reason:body.reason}); return NextResponse.json({ok:true});
    }
    if(action==='warning'){
      const {data:emp}=await db.from('employees').select('*').eq('discord_user_id',body.discord_id).maybeSingle(); if(!emp) throw new Error('الموظف غير موجود');
      await db.from('warnings').insert({employee_id:emp.id,reason:body.reason,issued_by_discord_id:actor});
      const role=process.env.DISCORD_EMPLOYEE_ROLE_ID||process.env.DISCORD_EMPLOYEES_ROLE_ID;
      await sendDiscord('warnings_channel_id',{content:`<@${body.discord_id}> ${role?`<@&${role}>`:''}`,embeds:[{title:'⚠️ إنذار موظف',description:`الموظف: <@${body.discord_id}>\nالسبب: **${body.reason}**\nبواسطة: <@${actor}>`,timestamp:new Date().toISOString()}]});
      await audit(actor,'employee_warning','employee',emp.id,{reason:body.reason}); return NextResponse.json({ok:true});
    }
    if(action==='edit_employee'){
      const {data:emp}=await db.from('employees').select('*').eq('discord_user_id',body.discord_id).maybeSingle(); if(!emp) throw new Error('الموظف غير موجود');
      const update:any={updated_at:new Date().toISOString()}; for(const k of ['game_name','game_phone','citizen_id']) if(body[k]) update[k]=String(body[k]).trim();
      await db.from('employees').update(update).eq('id',emp.id); await audit(actor,'employee_profile_edit','employee',emp.id,{before:{game_name:emp.game_name,game_phone:emp.game_phone,citizen_id:emp.citizen_id},after:update}); return NextResponse.json({ok:true});
    }
    if(action==='lift_rejection'){
      const {data:app}=await db.from('applications').select('*').eq('discord_user_id',body.discord_id).eq('status','rejected').order('created_at',{ascending:false}).limit(1).maybeSingle(); if(!app) throw new Error('لا يوجد طلب مرفوض');
      const invite=await createInvite(); await db.from('applications').update({status:'preaccepted',discord_invite_url:invite,updated_at:new Date().toISOString()}).eq('id',app.id);
      await updateDiscordMemberRole(body.discord_id,process.env.DISCORD_APPLICANT_ROLE_ID,true); await audit(actor,'application_rejection_lifted','application',app.id,{}); return NextResponse.json({ok:true});
    }
    if(action==='leave_review'){
      const {data:leave}=await db.from('leave_requests').select('*,employees(discord_user_id)').eq('id',body.id).maybeSingle(); if(!leave) throw new Error('طلب الإجازة غير موجود');
      const status=body.decision==='approve'?'approved':'rejected'; await db.from('leave_requests').update({status,reviewed_by_discord_id:actor,updated_at:new Date().toISOString()}).eq('id',leave.id);
      await audit(actor,`leave_${status}`,'leave_request',leave.id,{}); return NextResponse.json({ok:true});
    }
    return NextResponse.json({error:'إجراء غير معروف'},{status:400});
  }catch(e:any){ return NextResponse.json({error:e.message||'error'},{status:500}); }
}
