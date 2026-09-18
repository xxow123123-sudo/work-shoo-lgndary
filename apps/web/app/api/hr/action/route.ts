import { NextResponse } from 'next/server';
import { currentAccess } from '../../../../lib/access';
import { adminDb, sql } from '../../../../lib/database';
import { discordChannelId, sendDiscord, updateDiscordMemberRole } from '../../../../lib/discord';
import { auditEvent } from '../../../../lib/audit';

function allowed(role:string|null){ return role==='owner'||role==='boss'||role==='hr'; }
async function createInvite(){
  const channel=await discordChannelId('applicant_panel_channel_id'); if(!channel||!process.env.DISCORD_BOT_TOKEN) return null;
  const r=await fetch(`https://discord.com/api/v10/channels/${channel}/invites`,{method:'POST',headers:{authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`,'content-type':'application/json'},body:JSON.stringify({max_age:604800,max_uses:1,unique:true})}).catch(()=>null);
  if(!r?.ok) return process.env.DISCORD_INVITE_URL||null; const j=await r.json(); return `https://discord.gg/${j.code}`;
}
async function setting(key:string){
  const {data}=await adminDb().from('bot_settings').select('value').eq('guild_id',process.env.DISCORD_GUILD_ID!).eq('key',key).maybeSingle();
  return data?.value||null;
}

export async function POST(req:Request){
  try{
    const a=await currentAccess(); if(!a.user||!allowed(a.role)||a.locked) return NextResponse.json({error:'غير مصرح'},{status:403});
    const body=await req.json(); const action=body.action; const db=adminDb(); const actor=a.discordId;
    if(action==='force_out'){
      const {data:emp}=await db.from('employees').select('*').eq('discord_user_id',body.discord_id).maybeSingle(); if(!emp) throw new Error('الموظف غير موجود');
      const {data:shift}=await db.from('attendance').select('*').eq('employee_id',emp.id).is('clock_out',null).maybeSingle(); if(!shift) throw new Error('الموظف ليس داخل الدوام');
      const outAt=new Date();
      await db.from('attendance').update({clock_out:outAt.toISOString(),forced_out:true,forced_out_by_discord_id:actor,forced_out_reason:body.reason||'خروج إجباري من الموقع'}).eq('id',shift.id);
      const shiftSeconds=Math.max(0,Math.floor((outAt.getTime()-new Date(shift.clock_in).getTime())/1000));
      const cycle=await db.from('weekly_cycles').select('*').eq('is_current',true).limit(1).maybeSingle();
      let weeklySeconds=shiftSeconds;
      if(cycle.data){const q=await sql(`select coalesce(sum(extract(epoch from (coalesce(clock_out, now()) - greatest(clock_in, $2::timestamptz)))),0)::bigint as seconds from attendance where employee_id=$1 and coalesce(clock_out, now()) >= $2::timestamptz`,[emp.id,cycle.data.starts_at]);weeklySeconds=Number(q.rows[0]?.seconds||0);}
      const fmt=(n:number)=>`${Math.floor(n/3600)}س ${Math.floor((n%3600)/60)}د`;
      await sendDiscord('attendance_channel_id',{content:`**خروج إجباري**\nالموظف: <@${body.discord_id}>\nبواسطة: <@${actor}>\nمدة الشفت: **${fmt(shiftSeconds)}**\nإجمالي الأسبوع: **${fmt(weeklySeconds)}**\nالسبب: ${body.reason||'-'}`});
      await auditEvent(actor,'forced_clock_out','employee',emp.id,{discord_user_id:body.discord_id,reason:body.reason,shift_seconds:shiftSeconds,weekly_seconds:weeklySeconds},'الموقع'); return NextResponse.json({ok:true});
    }
    if(action==='warning'){
      const {data:emp}=await db.from('employees').select('*').eq('discord_user_id',body.discord_id).maybeSingle(); if(!emp) throw new Error('الموظف غير موجود');
      await db.from('warnings').insert({employee_id:emp.id,reason:body.reason,issued_by_discord_id:actor});
      const role=process.env.DISCORD_EMPLOYEE_ROLE_ID||process.env.DISCORD_EMPLOYEES_ROLE_ID;
      await sendDiscord('warnings_channel_id',{content:`<@${body.discord_id}> ${role?`<@&${role}>`:''}`,embeds:[{title:'⚠️ إنذار موظف',description:`الموظف: <@${body.discord_id}>\nالسبب: **${body.reason}**\nبواسطة: <@${actor}>`,timestamp:new Date().toISOString()}]});
      await auditEvent(actor,'employee_warning','employee',emp.id,{reason:body.reason}); return NextResponse.json({ok:true});
    }
    if(action==='edit_employee'){
      const {data:emp}=await db.from('employees').select('*').eq('discord_user_id',body.discord_id).maybeSingle(); if(!emp) throw new Error('الموظف غير موجود');
      const update:any={updated_at:new Date().toISOString()}; for(const k of ['game_name','game_phone','citizen_id']) if(body[k]) update[k]=String(body[k]).trim();
      await db.from('employees').update(update).eq('id',emp.id); await auditEvent(actor,'employee_profile_edit','employee',emp.id,{before:{game_name:emp.game_name,game_phone:emp.game_phone,citizen_id:emp.citizen_id},after:update}); return NextResponse.json({ok:true});
    }
    if(action==='lift_rejection'){
      const {data:app}=await db.from('applications').select('*').eq('discord_user_id',body.discord_id).eq('status','rejected').order('created_at',{ascending:false}).limit(1).maybeSingle(); if(!app) throw new Error('لا يوجد طلب مرفوض');
      const invite=await createInvite(); await db.from('applications').update({status:'preaccepted',discord_invite_url:invite,updated_at:new Date().toISOString()}).eq('id',app.id);
      await updateDiscordMemberRole(body.discord_id,process.env.DISCORD_APPLICANT_ROLE_ID,true); await auditEvent(actor,'application_rejection_lifted','application',app.id,{}); return NextResponse.json({ok:true});
    }
    if(action==='hire'){
      const discordId=String(body.discord_id||'').trim(); if(!/^\d{15,25}$/.test(discordId)) throw new Error('Discord ID غير صحيح');
      const {data:existing}=await db.from('employees').select('*').eq('discord_user_id',discordId).maybeSingle();
      const payload={discord_user_id:discordId,discord_username:existing?.discord_username||discordId,role:'employee',game_name:String(body.game_name||'').trim(),game_phone:String(body.game_phone||'').trim(),citizen_id:String(body.citizen_id||'').trim(),profile_complete:true,is_active:true,employment_status:'active',status_reason:null,status_changed_by_discord_id:actor,status_changed_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      if(!payload.game_name||!payload.game_phone||!payload.citizen_id) throw new Error('أكمل جميع بيانات الموظف');
      await db.from('employees').upsert(payload,{onConflict:'discord_user_id'});
      await updateDiscordMemberRole(discordId,process.env.DISCORD_EMPLOYEE_ROLE_ID||process.env.DISCORD_EMPLOYEES_ROLE_ID,true);
      await updateDiscordMemberRole(discordId,process.env.DISCORD_APPLICANT_ROLE_ID,false);
      await sendDiscord('hr_records_channel_id',{embeds:[{title:'➕ توظيف مباشر',description:`الموظف: <@${discordId}>\nالاسم: **${payload.game_name}**\nالجوال: **${payload.game_phone}**\nCitizen ID: **${payload.citizen_id}**\nوظّفه: <@${actor}>`,timestamp:new Date().toISOString()}]});
      await auditEvent(actor,'employee_manual_hire','employee',discordId,payload); return NextResponse.json({ok:true});
    }
    if(action==='leave_review'){
      const {data:leave}=await db.from('leave_requests').select('*,employees(discord_user_id)').eq('id',body.id).maybeSingle(); if(!leave) throw new Error('طلب الإجازة غير موجود');
      const status=body.decision==='approve'?'approved':'rejected';
      const patch:any={status,reviewed_by_discord_id:actor,updated_at:new Date().toISOString()};
      if(status==='approved'){
        const days=Math.max(1,Number(leave.requested_days||1)); const start=new Date(); const end=new Date(start); end.setUTCDate(end.getUTCDate()+days-1);
        patch.starts_on=start.toISOString().slice(0,10); patch.ends_on=end.toISOString().slice(0,10);
      }
      await db.from('leave_requests').update(patch).eq('id',leave.id);
      if(status==='approved'){
        const discordId=leave.employees?.discord_user_id;
        if(discordId){
          await updateDiscordMemberRole(discordId,process.env.DISCORD_EMPLOYEE_ROLE_ID||process.env.DISCORD_EMPLOYEES_ROLE_ID,false);
          const leaveRole=await setting('leave_role_id'); if(leaveRole) await updateDiscordMemberRole(discordId,leaveRole,true);
          const {data:emp}=await db.from('employees').select('*').eq('discord_user_id',discordId).maybeSingle();
          if(emp){ const {data:shift}=await db.from('attendance').select('*').eq('employee_id',emp.id).is('clock_out',null).maybeSingle(); if(shift) await db.from('attendance').update({clock_out:new Date().toISOString(),forced_out:true,forced_out_by_discord_id:actor,forced_out_reason:'بدء إجازة'}).eq('id',shift.id); }
        }
      }
      await auditEvent(actor,`leave_${status}`,'leave_request',leave.id,{days:leave.requested_days||1,starts_on:patch.starts_on||null,ends_on:patch.ends_on||null},'الموقع'); return NextResponse.json({ok:true});
    }
    return NextResponse.json({error:'إجراء غير معروف'},{status:400});
  }catch(e:any){ return NextResponse.json({error:e.message||'error'},{status:500}); }
}
