import { NextResponse } from 'next/server';
import { currentAccess } from '../../../../lib/access';
import { adminDb } from '../../../../lib/database';
import { auditEvent } from '../../../../lib/audit';
import { sendDiscord } from '../../../../lib/discord';

export async function POST(req:Request){
  try{
    const a=await currentAccess(); if(!a.user||!a.role||a.locked||!a.employee) return NextResponse.json({error:'غير مصرح'},{status:403});
    const body=await req.json(); const days=Number(body.days); if(!Number.isInteger(days)||days<1||days>60) throw new Error('عدد الأيام يجب أن يكون من 1 إلى 60');
    const {data,error}=await adminDb().from('leave_requests').insert({employee_id:a.employee.id,requested_days:days,starts_on:null,ends_on:null,reason:body.reason||null}).select('*').single(); if(error) throw error;
    await auditEvent(a.discordId,'leave_requested','leave_request',data.id,{days,reason:body.reason||null},'الموقع');
    await sendDiscord('hr_records_channel_id',{content:`<@&${process.env.DISCORD_HR_ROLE_ID}> <@${a.discordId}>`,embeds:[{title:'طلب إجازة من الموقع',description:`الموظف: <@${a.discordId}>\nالمدة المطلوبة: **${days} يوم**\nالسبب: ${body.reason||'—'}\n\nراجع الطلب من لوحة HR في الموقع.`,timestamp:new Date().toISOString()}]});
    return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({error:e.message||'error'},{status:500});}
}
