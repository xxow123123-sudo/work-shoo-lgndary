import { NextResponse } from 'next/server';
import { adminDb } from '../../../lib/database';
import { auditEvent } from '../../../lib/audit';

function attachApplicationCookie(response:NextResponse, applicationId:string){
  response.cookies.set('legendary_app',applicationId,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*365});
  return response;
}

export async function POST(req:Request){
  try{
    const body=await req.json();
    const db=adminDb();
    const {data:setting}=await db.from('bot_settings').select('value').eq('guild_id',process.env.DISCORD_GUILD_ID!).eq('key','recruitment_open').maybeSingle();
    const recruitmentOpen = setting?.value === undefined ? true : setting.value === 'true';
    if(!recruitmentOpen) return NextResponse.json({error:'التقديم مغلق حاليًا.'},{status:403});

    const discordId=String(body.discord_user_id||'').trim();
    const applicantName=String(body.applicant_name||'').trim();
    const age=Number(body.age);
    const dailyHours=Number(body.daily_hours);
    if(!/^\d{15,25}$/.test(discordId)) return NextResponse.json({error:'Discord ID غير صحيح. فعّل Developer Mode ثم انسخ User ID.'},{status:400});
    if(!applicantName) return NextResponse.json({error:'اكتب اسمك.'},{status:400});
    if(!Number.isFinite(age)||age<1||age>99) return NextResponse.json({error:'العمر غير صحيح.'},{status:400});
    if(!Number.isFinite(dailyHours)||dailyHours<1||dailyHours>24) return NextResponse.json({error:'عدد ساعات التواجد يجب أن يكون بين 1 و24.'},{status:400});

    const {data:latest}=await db.from('applications').select('id,status').eq('discord_user_id',discordId).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(latest){
      return attachApplicationCookie(NextResponse.json({ok:true,existing:true,status:latest.status,has_application:true}),latest.id);
    }

    const {data,error}=await db.from('applications').insert({
      applicant_name:applicantName,
      age,
      game_id:null,
      discord_username:null,
      discord_user_id:discordId,
      experience:null,
      availability:`${dailyHours} ساعة يوميًا`,
      reason:null,
    }).select('*').single();
    if(error) throw error;

    const {data:reviewSetting}=await db.from('bot_settings').select('value').eq('guild_id',process.env.DISCORD_GUILD_ID!).eq('key','application_review_channel_id').maybeSingle();
    const channel=reviewSetting?.value||process.env.DISCORD_APPLICATION_REVIEW_CHANNEL_ID;
    if(!channel) throw new Error('لم يتم إعداد روم طلبات الموقع. استخدم /setup-logs في Discord.');

    const token=process.env.DISCORD_BOT_TOKEN!;
    const payload={
      content:`<@&${process.env.DISCORD_HR_ROLE_ID}> طلب تقديم جديد`,
      embeds:[{title:'📨 طلب تقديم جديد',fields:[
        {name:'الاسم',value:data.applicant_name||'-',inline:true},
        {name:'العمر',value:String(data.age||'-'),inline:true},
        {name:'Discord ID',value:`${data.discord_user_id}`,inline:false},
        {name:'التواجد اليومي',value:String(data.availability||'-').slice(0,1000),inline:true},
      ]}],
      components:[{type:1,components:[
        {type:2,style:3,label:'قبول مبدئي',custom_id:`app_preaccept:${data.id}`},
        {type:2,style:4,label:'رفض',custom_id:`app_reject_initial:${data.id}`},
      ]}],
    };
    const dr=await fetch(`https://discord.com/api/v10/channels/${channel}/messages`,{method:'POST',headers:{authorization:`Bot ${token}`,'content-type':'application/json'},body:JSON.stringify(payload)});
    if(!dr.ok){ const text=await dr.text(); throw new Error(`Discord API: ${text}`); }
    const m=await dr.json();
    await db.from('applications').update({discord_message_id:m.id}).eq('id',data.id);
    await auditEvent(discordId,'application_submitted','application',data.id,{applicant_name:applicantName,age,daily_hours:dailyHours},'الموقع');
    return attachApplicationCookie(NextResponse.json({ok:true,has_application:true}),data.id);
  }catch(e:any){
    return NextResponse.json({error:e.message||'error'},{status:500});
  }
}
