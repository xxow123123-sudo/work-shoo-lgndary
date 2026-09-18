import { NextResponse } from 'next/server';
import { currentAccess } from '../../../../lib/access';
import { adminDb } from '../../../../lib/database';
import { auditEvent } from '../../../../lib/audit';
import { sendDiscord, updateDiscordMemberRole } from '../../../../lib/discord';

function allowed(role:string|null){return role==='owner'||role==='boss';}

export async function POST(req:Request){
  try{
    const a=await currentAccess(); if(!a.user||!allowed(a.role)||a.locked) return NextResponse.json({error:'غير مصرح'},{status:403});
    const body=await req.json(); const db=adminDb(); const actor=a.discordId;
    if(body.action==='recruitment'){
      const value=body.open?'true':'false'; await db.from('bot_settings').upsert({guild_id:process.env.DISCORD_GUILD_ID!,key:'recruitment_open',value,updated_by_discord_id:actor,updated_at:new Date().toISOString()},{onConflict:'guild_id,key'});
      await auditEvent(actor,body.open?'recruitment_open':'recruitment_close','guild',process.env.DISCORD_GUILD_ID!); return NextResponse.json({ok:true});
    }
    if(body.action==='terminate'){
      const {data:emp}=await db.from('employees').select('*').eq('discord_user_id',body.discord_id).maybeSingle(); if(!emp) throw new Error('الموظف غير موجود');
      await db.from('employees').update({is_active:false,employment_status:'terminated',status_reason:body.reason||'فصل من الإدارة',status_changed_by_discord_id:actor,status_changed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',emp.id);
      const {data:shift}=await db.from('attendance').select('*').eq('employee_id',emp.id).is('clock_out',null).maybeSingle(); if(shift) await db.from('attendance').update({clock_out:new Date().toISOString(),forced_out:true,forced_out_by_discord_id:actor,forced_out_reason:'فصل الموظف'}).eq('id',shift.id);
      await updateDiscordMemberRole(body.discord_id,process.env.DISCORD_EMPLOYEE_ROLE_ID||process.env.DISCORD_EMPLOYEES_ROLE_ID,false);
      await auditEvent(actor,'employee_terminated','employee',emp.id,{reason:body.reason}); return NextResponse.json({ok:true});
    }
    if(body.action==='reactivate'){
      const {data:emp}=await db.from('employees').select('*').eq('discord_user_id',body.discord_id).maybeSingle(); if(!emp) throw new Error('الموظف غير موجود');
      await db.from('employees').update({is_active:true,employment_status:'active',status_reason:null,status_changed_by_discord_id:actor,status_changed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',emp.id);
      await updateDiscordMemberRole(body.discord_id,process.env.DISCORD_EMPLOYEE_ROLE_ID||process.env.DISCORD_EMPLOYEES_ROLE_ID,true); await auditEvent(actor,'employee_reactivated','employee',emp.id,{}); return NextResponse.json({ok:true});
    }
    if(body.action==='set_mod_requirement'){
      const count=Number(body.count); if(!Number.isInteger(count)||count<0||count>100) throw new Error('عدد التعديلات غير صحيح');
      await db.from('bot_settings').upsert({guild_id:process.env.DISCORD_GUILD_ID!,key:'weekly_vehicle_mod_requirement',value:String(count),updated_by_discord_id:actor,updated_at:new Date().toISOString()},{onConflict:'guild_id,key'});
      await auditEvent(actor,'weekly_mod_requirement','guild',process.env.DISCORD_GUILD_ID!,{count}); return NextResponse.json({ok:true});
    }
    if(body.action==='resource_delivery'){
      const quantity=Number(body.quantity); if(!Number.isInteger(quantity)||quantity<0) throw new Error('الكمية غير صحيحة');
      const {data:emp}=await db.from('employees').select('*').eq('discord_user_id',body.discord_id).maybeSingle(); if(!emp) throw new Error('الموظف غير موجود');
      const {data:cycle}=await db.from('weekly_cycles').select('*').eq('is_current',true).limit(1).maybeSingle(); if(!cycle) throw new Error('لا يوجد أسبوع حالي');
      await db.from('weekly_resource_deliveries').upsert({cycle_id:cycle.id,employee_id:emp.id,quantity,received_by_discord_id:actor,delivered_at:new Date().toISOString()},{onConflict:'cycle_id,employee_id'});
      await sendDiscord('resources_channel_id',{embeds:[{title:'📦 تسليم موارد أسبوعي',description:`الموظف: <@${body.discord_id}>\nالكمية: **${quantity}**\nاستلمها: <@${actor}>`,timestamp:new Date().toISOString()}]});
      await auditEvent(actor,'weekly_resources_received','employee',emp.id,{quantity,cycle_id:cycle.id}); return NextResponse.json({ok:true});
    }
    if(body.action==='close_week'){
      const {data:cycle}=await db.from('weekly_cycles').select('*').eq('is_current',true).limit(1).maybeSingle(); if(!cycle) throw new Error('لا يوجد أسبوع حالي');
      const {data:rows}=await db.from('current_week_stats').select('*');
      const {data:deliveries}=await db.from('weekly_resource_deliveries').select('*').eq('cycle_id',cycle.id); const deliveryMap=new Map((deliveries||[]).map((x:any)=>[x.employee_id,Number(x.quantity||0)]));
      if(rows?.length) await db.from('weekly_snapshots').upsert(rows.map((r:any)=>({cycle_id:cycle.id,employee_id:r.employee_id,tool_sales:r.tool_sales||0,vehicle_mods:r.vehicle_mods||0,points:r.points||0,invoice_total:r.invoice_total||0,resources_quantity:deliveryMap.get(r.employee_id)||0})),{onConflict:'cycle_id,employee_id'});
      const now=new Date().toISOString(); await db.from('weekly_cycles').update({is_current:false,ends_at:now,closed_by_discord_id:actor}).eq('id',cycle.id); await db.from('weekly_cycles').insert({starts_at:now,is_current:true}); await auditEvent(actor,'close_week','weekly_cycle',cycle.id,{snapshot_count:rows?.length||0}); return NextResponse.json({ok:true});
    }
    return NextResponse.json({error:'إجراء غير معروف'},{status:400});
  }catch(e:any){return NextResponse.json({error:e.message||'error'},{status:500});}
}
