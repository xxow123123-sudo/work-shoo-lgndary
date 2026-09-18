import 'dotenv/config';
import { adminDb } from './database.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

const required = ['DATABASE_URL','DISCORD_BOT_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing environment variable: ${key}`);

const db = adminDb();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel],
});

const commands = [
  new SlashCommandBuilder().setName('panel').setDescription('إرسال لوحة الموظفين').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setup-logs').setDescription('إنشاء وربط جميع رومات سجلات الورشة').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('setup-panels').setDescription('إنشاء لوحات الموظفين والمتقدمين وHR والإدارة').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(x => x.toJSON());

const settingEnvFallback: Record<string,string> = {
  application_review_channel_id: 'DISCORD_APPLICATION_REVIEW_CHANNEL_ID',
  decisions_channel_id: 'DISCORD_DECISIONS_CHANNEL_ID',
  warnings_channel_id: 'DISCORD_WARNINGS_CHANNEL_ID',
  hr_records_channel_id: 'DISCORD_HR_RECORDS_CHANNEL_ID',
  stats_channel_id: 'DISCORD_LOGS_CHANNEL_ID',
};

function employeeRoleId(){ return process.env.DISCORD_EMPLOYEE_ROLE_ID || process.env.DISCORD_EMPLOYEES_ROLE_ID; }
function applicantRoleId(){ return process.env.DISCORD_APPLICANT_ROLE_ID; }

function hasRole(interaction:any, roleId?:string){ return Boolean(roleId && interaction.member?.roles?.cache?.has?.(roleId)); }
function isOwner(interaction:any){ return interaction.user?.id === process.env.DISCORD_OWNER_USER_ID; }
function isOwnerOrBoss(interaction:any){ return isOwner(interaction) || hasRole(interaction, process.env.DISCORD_BOSS_ROLE_ID); }
function isHrOrHigher(interaction:any){ return isOwnerOrBoss(interaction) || hasRole(interaction, process.env.DISCORD_HR_ROLE_ID); }

async function getSetting(key:string){
  const { data } = await db.from('bot_settings').select('value').eq('guild_id', process.env.DISCORD_GUILD_ID!).eq('key', key).maybeSingle();
  return data?.value || (settingEnvFallback[key] ? process.env[settingEnvFallback[key]] : undefined);
}
async function setSetting(key:string, value:string, actor='system'){
  await db.from('bot_settings').upsert({
    guild_id: process.env.DISCORD_GUILD_ID!, key, value,
    updated_by_discord_id: actor, updated_at: new Date().toISOString(),
  }, { onConflict: 'guild_id,key' });
}
async function isRecruitmentOpen(){ const v=await getSetting('recruitment_open'); return v === undefined ? true : v === 'true'; }
async function getTextChannel(key:string){
  const id = await getSetting(key); if(!id) return null;
  const ch = await client.channels.fetch(id).catch(()=>null);
  return ch?.isTextBased() ? ch as any : null;
}
async function audit(actor:string|null, action:string, targetType?:string, targetId?:string, metadata:any={}){
  await db.from('audit_logs').insert({ actor_discord_id: actor, action, target_type: targetType || null, target_id: targetId || null, metadata });
}
async function getEmployee(discordId:string, activeOnly=true){
  let q=db.from('employees').select('*').eq('discord_user_id',discordId);
  if(activeOnly) q=q.eq('is_active',true).eq('employment_status','active');
  const {data}=await q.maybeSingle(); return data;
}
async function latestApplication(discordId:string){
  const {data}=await db.from('applications').select('*').eq('discord_user_id',discordId).order('created_at',{ascending:false}).limit(1).maybeSingle();
  return data;
}
function mention(id?:string|null){ return id ? `<@${id}>` : 'غير معروف'; }
function short(s:any,n=1000){ const x=String(s??'-'); return x.length>n ? x.slice(0,n-1)+'…' : x; }

function panelRow(){ return new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId('service:tool').setLabel('بيع عِدّة').setEmoji('🧰').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId('service:vehicle').setLabel('تعديل مركبة').setEmoji('🚗').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId('attendance:in').setLabel('دخول').setEmoji('🟢').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('attendance:out').setLabel('خروج').setEmoji('🔴').setStyle(ButtonStyle.Danger),
); }
function applicantRow(){ return new ActionRowBuilder<ButtonBuilder>().addComponents(
  new ButtonBuilder().setCustomId('applicant:complete').setLabel('استكمال بيانات التقديم').setEmoji('📝').setStyle(ButtonStyle.Success),
); }
function hrRows(){ return [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('hr:online').setLabel('المسجلون دخول الآن').setEmoji('🟢').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('hr:forceout').setLabel('خروج إجباري').setEmoji('🚪').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('hr:warning').setLabel('إنذار موظف').setEmoji('⚠️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('hr:edit').setLabel('تعديل معلومات موظف').setEmoji('✏️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('hr:lift_rejection').setLabel('رفع رفض متقدم').setEmoji('♻️').setStyle(ButtonStyle.Success),
  ),
]; }
function adminRows(){ return [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('admin:recruit_open').setLabel('فتح التقديم').setEmoji('🟢').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('admin:recruit_close').setLabel('إغلاق التقديم').setEmoji('🔴').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('admin:terminate').setLabel('فصل موظف').setEmoji('⛔').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('admin:reactivate').setLabel('إعادة تفعيل موظف').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('admin:close_week').setLabel('إغلاق الأسبوع').setEmoji('📦').setStyle(ButtonStyle.Primary),
  ),
]; }

function staffOverwrites(guild:any, includeHr=true){
  const arr:any[]=[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]}];
  const allow=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory];
  if(process.env.DISCORD_OWNER_USER_ID) arr.push({id:process.env.DISCORD_OWNER_USER_ID,allow});
  if(process.env.DISCORD_BOSS_ROLE_ID) arr.push({id:process.env.DISCORD_BOSS_ROLE_ID,allow});
  if(includeHr && process.env.DISCORD_HR_ROLE_ID) arr.push({id:process.env.DISCORD_HR_ROLE_ID,allow});
  return arr;
}
function employeeReadOnlyOverwrites(guild:any){
  const arr:any[]=[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]}];
  const read=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory];
  const staff=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory];
  if(employeeRoleId()) arr.push({id:employeeRoleId(),allow:read,deny:[PermissionFlagsBits.SendMessages]});
  if(process.env.DISCORD_OWNER_USER_ID) arr.push({id:process.env.DISCORD_OWNER_USER_ID,allow:staff});
  if(process.env.DISCORD_BOSS_ROLE_ID) arr.push({id:process.env.DISCORD_BOSS_ROLE_ID,allow:staff});
  if(process.env.DISCORD_HR_ROLE_ID) arr.push({id:process.env.DISCORD_HR_ROLE_ID,allow:staff});
  return arr;
}
function applicantOverwrites(guild:any){
  const arr:any[]=[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]}];
  const read=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory];
  const staff=[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory];
  if(applicantRoleId()) arr.push({id:applicantRoleId(),allow:read,deny:[PermissionFlagsBits.SendMessages]});
  if(process.env.DISCORD_OWNER_USER_ID) arr.push({id:process.env.DISCORD_OWNER_USER_ID,allow:staff});
  if(process.env.DISCORD_BOSS_ROLE_ID) arr.push({id:process.env.DISCORD_BOSS_ROLE_ID,allow:staff});
  if(process.env.DISCORD_HR_ROLE_ID) arr.push({id:process.env.DISCORD_HR_ROLE_ID,allow:staff});
  return arr;
}

async function setupLogs(interaction:any){
  if(!interaction.guild) throw new Error('الأمر يعمل داخل السيرفر فقط');
  if(!isOwnerOrBoss(interaction)) return void interaction.editReply('هذا الأمر للـ Owner أو Boss فقط.');
  const guild=interaction.guild;
  const savedCategoryId=await getSetting('logs_category_id');
  let category=savedCategoryId?await guild.channels.fetch(savedCategoryId).catch(()=>null):null;
  if(!category || category.type!==ChannelType.GuildCategory) category=guild.channels.cache.find((c:any)=>c.type===ChannelType.GuildCategory&&c.name==='📋・سجلات-الورشة');
  if(!category) category=await guild.channels.create({name:'📋・سجلات-الورشة',type:ChannelType.GuildCategory,permissionOverwrites:staffOverwrites(guild,true)});
  await setSetting('logs_category_id',category.id,interaction.user.id);
  const defs=[
    ['tool_sales_channel_id','🧰・بيع-العدة','staff'],
    ['vehicle_mods_channel_id','🚗・تعديل-المركبات','staff'],
    ['attendance_channel_id','🟢・الدخول-والخروج','staff'],
    ['application_review_channel_id','📨・طلبات-الموقع','staff'],
    ['hr_records_channel_id','👥・مراجعة-المتقدمين','staff'],
    ['admin_logs_channel_id','🛡️・سجل-الادارة','staff'],
    ['warnings_channel_id','⚠️・الانذارات','public'],
    ['decisions_channel_id','📢・القرارات','public'],
    ['stats_channel_id','📊・نشاط-الاسبوع','public'],
  ] as const;
  const linked:string[]=[];
  for(const [key,name,access] of defs){
    const savedId=await getSetting(key);
    let ch=savedId?await guild.channels.fetch(savedId).catch(()=>null):null;
    if(!ch || ch.type!==ChannelType.GuildText) ch=guild.channels.cache.find((c:any)=>c.type===ChannelType.GuildText&&c.parentId===category.id&&c.name===name);
    if(!ch) ch=await guild.channels.create({name,type:ChannelType.GuildText,parent:category.id,permissionOverwrites:access==='public'?employeeReadOnlyOverwrites(guild):staffOverwrites(guild,true)});
    await setSetting(key,ch.id,interaction.user.id); linked.push(`<#${ch.id}>`);
  }
  await audit(interaction.user.id,'setup_logs','guild',guild.id,{channels:linked});
  await interaction.editReply(`✅ تم إنشاء وربط سجلات الورشة كاملة.\n${linked.join('  ')}`);
  await refreshStatsPanel();
}

async function upsertPanelMessage(channel:any,title:string,description:string,components:any[]){
  const messages=await channel.messages.fetch({limit:50}).catch(()=>null);
  const old=messages?.find((m:any)=>m.author.id===client.user!.id && m.embeds?.[0]?.title===title);
  const payload={embeds:[new EmbedBuilder().setTitle(title).setDescription(description).setTimestamp()],components};
  if(old) return old.edit(payload);
  return channel.send(payload);
}

async function setupPanels(interaction:any){
  if(!interaction.guild) throw new Error('الأمر يعمل داخل السيرفر فقط');
  if(!isOwnerOrBoss(interaction)) return void interaction.editReply('هذا الأمر للـ Owner أو Boss فقط.');
  const guild=interaction.guild;
  let category:any=null;
  const saved=await getSetting('panels_category_id');
  if(saved) category=await guild.channels.fetch(saved).catch(()=>null);
  if(!category || category.type!==ChannelType.GuildCategory) category=guild.channels.cache.find((c:any)=>c.type===ChannelType.GuildCategory&&c.name==='🧭・لوحات-النظام');
  if(!category) category=await guild.channels.create({name:'🧭・لوحات-النظام',type:ChannelType.GuildCategory});
  await setSetting('panels_category_id',category.id,interaction.user.id);

  const defs:any[]=[
    ['employee_panel_channel_id','👷・لوحة-الموظفين',employeeReadOnlyOverwrites(guild)],
    ['applicant_panel_channel_id','📝・استكمال-التقديم',applicantOverwrites(guild)],
    ['hr_panel_channel_id','👥・لوحة-hr',staffOverwrites(guild,true)],
    ['admin_panel_channel_id','👑・لوحة-الادارة-العليا',staffOverwrites(guild,false)],
  ];
  const channels:Record<string,any>={};
  for(const [key,name,perms] of defs){
    let ch:any=null; const id=await getSetting(key); if(id) ch=await guild.channels.fetch(id).catch(()=>null);
    if(!ch || ch.type!==ChannelType.GuildText) ch=guild.channels.cache.find((c:any)=>c.type===ChannelType.GuildText&&c.parentId===category.id&&c.name===name);
    if(!ch) ch=await guild.channels.create({name,type:ChannelType.GuildText,parent:category.id,permissionOverwrites:perms});
    await setSetting(key,ch.id,interaction.user.id); channels[key]=ch;
  }
  await upsertPanelMessage(channels.employee_panel_channel_id,'👷 لوحة الموظفين','اختر العملية المطلوبة. بيع العدة = **1 نقطة**، تعديل المركبة = **5 نقاط**.',[panelRow()]);
  await upsertPanelMessage(channels.applicant_panel_channel_id,'📝 استكمال التقديم','إذا تم قبولك مبدئيًا من الموقع، اضغط الزر وسيسألك البوت عن **اسمك داخل اللعبة + رقم الجوال داخل اللعبة + Citizen ID**.',[applicantRow()]);
  await refreshControlPanels(channels);
  await audit(interaction.user.id,'setup_panels','guild',guild.id,Object.fromEntries(Object.entries(channels).map(([k,v]:any)=>[k,v.id])));
  await interaction.editReply(`✅ تم إنشاء وربط اللوحات.\n👷 <#${channels.employee_panel_channel_id.id}>  📝 <#${channels.applicant_panel_channel_id.id}>  👥 <#${channels.hr_panel_channel_id.id}>  👑 <#${channels.admin_panel_channel_id.id}>`);
}

async function refreshControlPanels(preloaded?:Record<string,any>){
  const hr=preloaded?.hr_panel_channel_id || await getTextChannel('hr_panel_channel_id');
  const admin=preloaded?.admin_panel_channel_id || await getTextChannel('admin_panel_channel_id');
  if(hr){
    const {count:online}=await db.from('attendance').select('*',{count:'exact',head:true}).is('clock_out',null);
    const {count:rejected}=await db.from('applications').select('*',{count:'exact',head:true}).eq('status','rejected');
    const {count:pending}=await db.from('applications').select('*',{count:'exact',head:true}).in('status',['pending','profile_submitted','interview']);
    await upsertPanelMessage(hr,'👥 لوحة HR',`🟢 داخل الدوام الآن: **${online||0}**\n📨 طلبات تحتاج متابعة: **${pending||0}**\n❌ مرفوضون: **${rejected||0}**\n\nكل إجراء يتم حفظه في سجل الإدارة.`,hrRows());
  }
  if(admin){
    const open=await isRecruitmentOpen();
    const {data:rows}=await db.from('current_week_stats').select('*').order('points',{ascending:false});
    const total=(rows??[]).reduce((a:any,r:any)=>({points:a.points+(r.points||0),money:a.money+Number(r.invoice_total||0),ops:a.ops+(r.tool_sales||0)+(r.vehicle_mods||0)}),{points:0,money:0,ops:0});
    await upsertPanelMessage(admin,'👑 لوحة الإدارة العليا',`التقديم: **${open?'🟢 مفتوح':'🔴 مغلق'}**\n⭐ نقاط الأسبوع: **${total.points}**\n🧾 خدمات الأسبوع: **${total.ops}**\n💰 قيمة فواتير الأسبوع: **$${total.money.toLocaleString()}**`,adminRows());
  }
}

async function waitAttachment(channel:any,userId:string,prompt:string){
  await channel.send({content:`<@${userId}> ${prompt}`});
  const c=await channel.awaitMessages({filter:(m:any)=>m.author.id===userId&&m.attachments.size>0,max:1,time:120000});
  const m=c.first(); if(!m) throw new Error('انتهى الوقت بدون صورة'); return m.attachments.first()!.url;
}
async function askAmount(channel:any,userId:string){
  await channel.send({content:`<@${userId}> اكتب قيمة الفاتورة بالأرقام فقط. (قراءة الصورة تلقائيًا ستُربط في مرحلة OCR)`});
  const c=await channel.awaitMessages({filter:(m:any)=>m.author.id===userId&&/^\d+(\.\d+)?$/.test(m.content.trim()),max:1,time:120000});
  const m=c.first(); if(!m) throw new Error('لم يتم إدخال قيمة صحيحة'); return Number(m.content.trim());
}

async function refreshStatsPanel(){
  const channel=await getTextChannel('stats_channel_id'); if(!channel) return;
  const {data:rows}=await db.from('current_week_stats').select('*').order('points',{ascending:false});
  const {count:online}=await db.from('attendance').select('*',{count:'exact',head:true}).is('clock_out',null);
  const total=(rows??[]).reduce((a:any,r:any)=>({tool:a.tool+(r.tool_sales||0),mods:a.mods+(r.vehicle_mods||0),points:a.points+(r.points||0),money:a.money+Number(r.invoice_total||0)}),{tool:0,mods:0,points:0,money:0});
  const top=(rows??[]).filter((r:any)=>r.points>0).slice(0,3).map((r:any,i:number)=>`${['🥇','🥈','🥉'][i]} ${r.game_name||r.discord_username||mention(r.discord_user_id)} — **${r.points} نقطة**`).join('\n')||'لا يوجد نشاط بعد';
  const embed=new EmbedBuilder().setTitle('📊 نشاط الورشة هذا الأسبوع').setDescription(`🧰 بيع عِدد: **${total.tool}**\n🚗 تعديل مركبات: **${total.mods}**\n💰 قيمة الفواتير: **$${total.money.toLocaleString()}**\n⭐ إجمالي النقاط: **${total.points}**\n👷 داخل الدوام الآن: **${online||0}**\n\n**الأكثر نشاطًا**\n${top}`).setTimestamp();
  const messages=await channel.messages.fetch({limit:30}).catch(()=>null);
  const old=messages?.find((m:any)=>m.author.id===client.user!.id&&m.embeds?.[0]?.title==='📊 نشاط الورشة هذا الأسبوع');
  if(old) await old.edit({embeds:[embed]}); else await channel.send({embeds:[embed]});
}

async function createApplicantInvite(){
  const ch:any=await getTextChannel('applicant_panel_channel_id');
  if(ch?.createInvite){
    const inv=await ch.createInvite({maxAge:7*24*60*60,maxUses:1,unique:true,reason:'قبول مبدئي لمتقدم'}).catch(()=>null);
    if(inv?.url) return inv.url;
  }
  return process.env.DISCORD_INVITE_URL || null;
}

async function addApplicantRoleIfPresent(guild:any,discordId:string){
  if(!applicantRoleId()) return;
  const m=await guild.members.fetch(discordId).catch(()=>null); if(m) await m.roles.add(applicantRoleId()!).catch(()=>{});
}
async function finalAccept(interaction:any, app:any){
  if(!isHrOrHigher(interaction)) return interaction.reply({content:'هذا الإجراء للـ HR والإدارة فقط.',ephemeral:true});
  const member=await interaction.guild?.members.fetch(app.discord_user_id).catch(()=>null);
  if(member && employeeRoleId()) await member.roles.add(employeeRoleId()!).catch(()=>{});
  if(member && applicantRoleId()) await member.roles.remove(applicantRoleId()!).catch(()=>{});
  await db.from('employees').upsert({
    discord_user_id:app.discord_user_id,
    discord_username:member?.user?.username || app.discord_username || app.applicant_name,
    role:'employee',
    game_name:app.profile_game_name,
    game_phone:app.profile_game_phone,
    citizen_id:app.profile_citizen_id,
    profile_complete:true,
    is_active:true,
    employment_status:'active',
    status_reason:null,
    status_changed_by_discord_id:interaction.user.id,
    status_changed_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  },{onConflict:'discord_user_id'});
  await db.from('applications').update({status:'accepted',final_reviewed_by_discord_id:interaction.user.id,reviewed_by_discord_id:interaction.user.id,updated_at:new Date().toISOString()}).eq('id',app.id);
  const decisions=await getTextChannel('decisions_channel_id');
  if(decisions) await decisions.send({content:`✅ **قرار قبول نهائي**\nنرحب بـ ${mention(app.discord_user_id)} ضمن فريق الورشة. ${employeeRoleId()?`<@&${employeeRoleId()}>`:''}`});
  await audit(interaction.user.id,'application_final_accept','application',app.id,{discord_user_id:app.discord_user_id});
  await interaction.reply({content:'✅ تم القبول النهائي وإعطاء رتبة الموظف.',ephemeral:true});
  await refreshControlPanels();
}
async function finalReject(interaction:any, app:any){
  if(!isHrOrHigher(interaction)) return interaction.reply({content:'هذا الإجراء للـ HR والإدارة فقط.',ephemeral:true});
  await db.from('applications').update({status:'rejected',final_reviewed_by_discord_id:interaction.user.id,reviewed_by_discord_id:interaction.user.id,updated_at:new Date().toISOString()}).eq('id',app.id);
  await audit(interaction.user.id,'application_final_reject','application',app.id,{discord_user_id:app.discord_user_id});
  await interaction.reply({content:'❌ تم رفض المتقدم. سيظهر له "أنت مرفوض" إذا ضغط زر الاستكمال حتى يتم رفع الرفض.',ephemeral:true});
  await refreshControlPanels();
}
async function openInterview(interaction:any, app:any){
  if(!isHrOrHigher(interaction)) return interaction.reply({content:'هذا الإجراء للـ HR والإدارة فقط.',ephemeral:true});
  const guild=interaction.guild!;
  const overwrites:any[]=[
    {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:app.discord_user_id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
  ];
  if(process.env.DISCORD_HR_ROLE_ID) overwrites.push({id:process.env.DISCORD_HR_ROLE_ID,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});
  if(process.env.DISCORD_BOSS_ROLE_ID) overwrites.push({id:process.env.DISCORD_BOSS_ROLE_ID,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});
  if(process.env.DISCORD_OWNER_USER_ID) overwrites.push({id:process.env.DISCORD_OWNER_USER_ID,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});
  let ticket:any=null;
  if(app.interview_channel_id) ticket=await guild.channels.fetch(app.interview_channel_id).catch(()=>null);
  if(!ticket) ticket=await guild.channels.create({name:`interview-${String(app.discord_user_id).slice(-6)}`,type:ChannelType.GuildText,permissionOverwrites:overwrites});
  await db.from('applications').update({status:'interview',interview_channel_id:ticket.id,reviewed_by_discord_id:interaction.user.id,updated_at:new Date().toISOString()}).eq('id',app.id);
  const row=new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`app_final_accept:${app.id}`).setLabel('قبول').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`app_final_reject:${app.id}`).setLabel('رفض').setStyle(ButtonStyle.Danger),
  );
  await ticket.send({content:`${mention(app.discord_user_id)} <@&${process.env.DISCORD_HR_ROLE_ID}>`,embeds:[new EmbedBuilder().setTitle('🎙️ مقابلة متقدم').addFields(
    {name:'الاسم داخل اللعبة',value:short(app.profile_game_name),inline:true},
    {name:'رقم الجوال',value:short(app.profile_game_phone),inline:true},
    {name:'Citizen ID',value:short(app.profile_citizen_id),inline:true},
  )],components:[row]});
  await audit(interaction.user.id,'application_interview','application',app.id,{channel_id:ticket.id});
  await interaction.reply({content:`🎙️ تم فتح المقابلة: <#${ticket.id}>`,ephemeral:true});
  await refreshControlPanels();
}

async function closeCurrentWeek(actor:string){
  const {data:cycle,error:cycleErr}=await db.from('weekly_cycles').select('*').eq('is_current',true).limit(1).maybeSingle();
  if(cycleErr) throw cycleErr; if(!cycle) throw new Error('لا يوجد أسبوع حالي.');
  const {data:rows,error:rowsErr}=await db.from('current_week_stats').select('*'); if(rowsErr) throw rowsErr;
  if(rows?.length){
    const snapshots=rows.map((r:any)=>({cycle_id:cycle.id,employee_id:r.employee_id,tool_sales:r.tool_sales||0,vehicle_mods:r.vehicle_mods||0,points:r.points||0,invoice_total:r.invoice_total||0}));
    const {error}=await db.from('weekly_snapshots').upsert(snapshots,{onConflict:'cycle_id,employee_id'}); if(error) throw error;
  }
  const now=new Date().toISOString();
  const {error:e1}=await db.from('weekly_cycles').update({is_current:false,ends_at:now,closed_by_discord_id:actor}).eq('id',cycle.id); if(e1) throw e1;
  const {error:e2}=await db.from('weekly_cycles').insert({starts_at:now,is_current:true}); if(e2) throw e2;
  await audit(actor,'close_week','weekly_cycle',cycle.id,{snapshot_count:rows?.length||0});
  await refreshStatsPanel(); await refreshControlPanels();
}

client.once(Events.ClientReady, async c=>{
  console.log(`Logged in as ${c.user.tag}`);
  const rest=new REST({version:'10'}).setToken(process.env.DISCORD_BOT_TOKEN!);
  await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID!,process.env.DISCORD_GUILD_ID!),{body:commands});
  if((await getSetting('recruitment_open'))===undefined) await setSetting('recruitment_open','true','system');
  await refreshStatsPanel(); await refreshControlPanels();
});

client.on(Events.GuildMemberAdd, async member=>{
  try{
    if(member.guild.id!==process.env.DISCORD_GUILD_ID) return;
    const app=await latestApplication(member.id);
    if(app && ['preaccepted','profile_submitted','interview'].includes(app.status) && applicantRoleId()) await member.roles.add(applicantRoleId()!).catch(()=>{});
  }catch(e){console.error('GuildMemberAdd',e);}
});

client.on(Events.InteractionCreate, async interaction=>{
  try{
    // Slash commands
    if(interaction.isChatInputCommand() && interaction.commandName==='panel'){
      await interaction.reply({content:'تم إرسال لوحة الموظفين.',ephemeral:true});
      await interaction.channel?.send({embeds:[new EmbedBuilder().setTitle('👷 لوحة الموظفين').setDescription('اختر العملية المطلوبة.')],components:[panelRow()]}); return;
    }
    if(interaction.isChatInputCommand() && interaction.commandName==='setup-logs'){
      await interaction.deferReply({ephemeral:true}); await setupLogs(interaction); return;
    }
    if(interaction.isChatInputCommand() && interaction.commandName==='setup-panels'){
      await interaction.deferReply({ephemeral:true}); await setupPanels(interaction); return;
    }

    if(!interaction.isButton() && !interaction.isModalSubmit()) return;

    // Employee attendance
    if(interaction.isButton() && interaction.customId.startsWith('attendance:')){
      const emp=await getEmployee(interaction.user.id); if(!emp) return interaction.reply({content:'أنت غير مسجل كموظف نشط.',ephemeral:true});
      const action=interaction.customId.split(':')[1];
      if(action==='in'){
        const {data:open}=await db.from('attendance').select('id').eq('employee_id',emp.id).is('clock_out',null).maybeSingle();
        if(open) return interaction.reply({content:'أنت مسجل دخول بالفعل.',ephemeral:true});
        const {error}=await db.from('attendance').insert({employee_id:emp.id}); if(error) throw error;
        const log=await getTextChannel('attendance_channel_id'); if(log) await log.send(`🟢 ${mention(interaction.user.id)} سجّل **دخول**.`);
        await interaction.reply({content:'🟢 تم تسجيل دخولك.',ephemeral:true});
      } else {
        const {data:open}=await db.from('attendance').select('*').eq('employee_id',emp.id).is('clock_out',null).maybeSingle();
        if(!open) return interaction.reply({content:'أنت غير مسجل دخول حاليًا.',ephemeral:true});
        await db.from('attendance').update({clock_out:new Date().toISOString()}).eq('id',open.id);
        const log=await getTextChannel('attendance_channel_id'); if(log) await log.send(`🔴 ${mention(interaction.user.id)} سجّل **خروج**.`);
        await interaction.reply({content:'🔴 تم تسجيل خروجك.',ephemeral:true});
      }
      await refreshStatsPanel(); await refreshControlPanels(); return;
    }

    // Employee services
    if(interaction.isButton() && interaction.customId.startsWith('service:')){
      const emp=await getEmployee(interaction.user.id); if(!emp) return interaction.reply({content:'أنت غير مسجل كموظف نشط.',ephemeral:true});
      await interaction.reply({content:'بدأ تسجيل العملية. أكمل المطلوب في هذا الروم خلال دقيقتين.',ephemeral:true});
      const ch:any=interaction.channel; if(!ch) throw new Error('الروم غير متاح');
      const invoice=await waitAttachment(ch,interaction.user.id,'أرسل **صورة الفاتورة** الآن.');
      const amount=await askAmount(ch,interaction.user.id);
      const kind=interaction.customId.split(':')[1];
      if(kind==='tool'){
        const {error}=await db.from('service_records').insert({employee_id:emp.id,service_type:'tool_sale',points:1,invoice_amount:amount,invoice_image_url:invoice}); if(error) throw error;
        const log=await getTextChannel('tool_sales_channel_id'); if(log) await log.send({embeds:[new EmbedBuilder().setTitle('🧰 بيع عِدّة').setDescription(`الموظف: ${mention(interaction.user.id)}\nالقيمة: **$${amount.toLocaleString()}**\nالنقاط: **1**`).setImage(invoice).setTimestamp()]});
        await ch.send({content:`✅ ${mention(interaction.user.id)} تم تسجيل بيع عِدّة — **1 نقطة** — قيمة الفاتورة: **$${amount.toLocaleString()}**`});
      }else{
        const vehicle=await waitAttachment(ch,interaction.user.id,'أرسل **صورة المركبة المعدلة** الآن.');
        const {error}=await db.from('service_records').insert({employee_id:emp.id,service_type:'vehicle_mod',points:5,invoice_amount:amount,invoice_image_url:invoice,vehicle_image_url:vehicle}); if(error) throw error;
        const log=await getTextChannel('vehicle_mods_channel_id'); if(log) await log.send({embeds:[new EmbedBuilder().setTitle('🚗 تعديل مركبة').setDescription(`الموظف: ${mention(interaction.user.id)}\nالقيمة: **$${amount.toLocaleString()}**\nالنقاط: **5**`).setImage(vehicle).setTimestamp()],files:[invoice]});
        await ch.send({content:`✅ ${mention(interaction.user.id)} تم تسجيل تعديل المركبة — **5 نقاط** — قيمة الفاتورة: **$${amount.toLocaleString()}**`});
      }
      await refreshStatsPanel(); await refreshControlPanels(); return;
    }

    // Applicant completion button
    if(interaction.isButton() && interaction.customId==='applicant:complete'){
      const app=await latestApplication(interaction.user.id);
      if(!app) return interaction.reply({content:'⚠️ لا يوجد طلب تقديم مرتبط بـ Discord ID الخاص بك.',ephemeral:true});
      if(app.status==='rejected') return interaction.reply({content:'❌ **أنت مرفوض حاليًا.** لا يمكنك استكمال التقديم حتى يقوم HR برفع الرفض.',ephemeral:true});
      if(app.status==='pending') return interaction.reply({content:'⏳ طلبك ما زال تحت المراجعة ولم يتم قبولك مبدئيًا بعد.',ephemeral:true});
      if(app.status==='accepted') return interaction.reply({content:'✅ أنت مقبول ومسجل كموظف بالفعل.',ephemeral:true});
      if(['profile_submitted','interview'].includes(app.status)) return interaction.reply({content:'✅ سبق أن سجلت بياناتك وهي الآن لدى HR للمراجعة.',ephemeral:true});
      if(app.status!=='preaccepted') return interaction.reply({content:'حالة طلبك لا تسمح باستكمال البيانات الآن.',ephemeral:true});
      const modal=new ModalBuilder().setCustomId(`applicant_profile:${app.id}`).setTitle('استكمال بيانات التقديم');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('game_name').setLabel('اسمك داخل اللعبة').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('game_phone').setLabel('رقم جوالك داخل اللعبة').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('citizen_id').setLabel('Citizen ID').setStyle(TextInputStyle.Short).setRequired(true)),
      );
      await interaction.showModal(modal); return;
    }

    if(interaction.isModalSubmit() && interaction.customId.startsWith('applicant_profile:')){
      const id=interaction.customId.split(':')[1];
      const {data:app}=await db.from('applications').select('*').eq('id',id).maybeSingle();
      if(!app || app.discord_user_id!==interaction.user.id) return interaction.reply({content:'تعذر التحقق من الطلب.',ephemeral:true});
      if(app.status==='rejected') return interaction.reply({content:'طلبك مرفوض حاليًا.',ephemeral:true});
      if(app.status!=='preaccepted') return interaction.reply({content:'تم إرسال بيانات هذا الطلب مسبقًا أو حالته تغيرت.',ephemeral:true});
      const profile={
        profile_game_name:interaction.fields.getTextInputValue('game_name'),
        profile_game_phone:interaction.fields.getTextInputValue('game_phone'),
        profile_citizen_id:interaction.fields.getTextInputValue('citizen_id'),
        status:'profile_submitted',updated_at:new Date().toISOString(),
      };
      await db.from('applications').update(profile).eq('id',id);
      const hr=await getTextChannel('hr_records_channel_id');
      let msg:any=null;
      if(hr){
        const buttons=new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`app_final_accept:${id}`).setLabel('قبول').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`app_final_reject:${id}`).setLabel('رفض').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(`app_final_interview:${id}`).setLabel('مقابلة').setStyle(ButtonStyle.Primary),
        );
        msg=await hr.send({content:`<@&${process.env.DISCORD_HR_ROLE_ID}> ${mention(interaction.user.id)}`,embeds:[new EmbedBuilder().setTitle('👤 استكمال بيانات متقدم').addFields(
          {name:'المتقدم',value:mention(interaction.user.id),inline:true},
          {name:'الاسم داخل اللعبة',value:short(profile.profile_game_name),inline:true},
          {name:'رقم الجوال',value:short(profile.profile_game_phone),inline:true},
          {name:'Citizen ID',value:short(profile.profile_citizen_id),inline:true},
        ).setTimestamp()],components:[buttons]});
      }
      if(msg) await db.from('applications').update({hr_message_id:msg.id}).eq('id',id);
      await audit(interaction.user.id,'application_profile_submit','application',id,profile);
      await interaction.reply({content:'✅ تم إرسال بياناتك إلى HR للمراجعة.',ephemeral:true});
      await refreshControlPanels(); return;
    }

    // Initial website application review: only accept/reject
    if(interaction.isButton() && (interaction.customId.startsWith('app_preaccept:') || interaction.customId.startsWith('app_reject_initial:'))){
      if(!isHrOrHigher(interaction)) return interaction.reply({content:'هذا الإجراء للـ HR والإدارة فقط.',ephemeral:true});
      const [action,id]=interaction.customId.split(':');
      const {data:app}=await db.from('applications').select('*').eq('id',id).maybeSingle(); if(!app) return interaction.reply({content:'الطلب غير موجود.',ephemeral:true});
      if(action==='app_preaccept'){
        const invite=await createApplicantInvite();
        await db.from('applications').update({status:'preaccepted',initial_reviewed_by_discord_id:interaction.user.id,reviewed_by_discord_id:interaction.user.id,discord_invite_url:invite,updated_at:new Date().toISOString()}).eq('id',id);
        await addApplicantRoleIfPresent(interaction.guild,app.discord_user_id);
        await audit(interaction.user.id,'application_preaccept','application',id,{discord_user_id:app.discord_user_id,invite_created:Boolean(invite)});
        await interaction.reply({content:`✅ تم القبول المبدئي. ${invite?'ظهر رابط Discord الآن في حالة طلبه بالموقع.':'تنبيه: لم أستطع إنشاء رابط دعوة؛ تأكد من /setup-panels وصلاحية Create Invite.'}`,ephemeral:true});
      }else{
        await db.from('applications').update({status:'rejected',initial_reviewed_by_discord_id:interaction.user.id,reviewed_by_discord_id:interaction.user.id,updated_at:new Date().toISOString()}).eq('id',id);
        await audit(interaction.user.id,'application_initial_reject','application',id,{discord_user_id:app.discord_user_id});
        await interaction.reply({content:'❌ تم رفض الطلب.',ephemeral:true});
      }
      await refreshControlPanels(); return;
    }

    // Final HR buttons
    if(interaction.isButton() && (interaction.customId.startsWith('app_final_accept:') || interaction.customId.startsWith('app_final_reject:') || interaction.customId.startsWith('app_final_interview:'))){
      const [action,id]=interaction.customId.split(':');
      const {data:app}=await db.from('applications').select('*').eq('id',id).maybeSingle(); if(!app) return interaction.reply({content:'الطلب غير موجود.',ephemeral:true});
      if(action==='app_final_accept') return void await finalAccept(interaction,app);
      if(action==='app_final_reject') return void await finalReject(interaction,app);
      return void await openInterview(interaction,app);
    }

    // HR panel actions
    if(interaction.isButton() && interaction.customId.startsWith('hr:')){
      if(!isHrOrHigher(interaction)) return interaction.reply({content:'هذه اللوحة للـ HR والإدارة فقط.',ephemeral:true});
      const action=interaction.customId.split(':')[1];
      if(action==='online'){
        const {data:open}=await db.from('attendance').select('id,clock_in,employees(discord_user_id,discord_username,game_name)').is('clock_out',null).order('clock_in',{ascending:true});
        const lines=(open??[]).slice(0,25).map((x:any,i:number)=>`${i+1}. ${mention(x.employees?.discord_user_id)} — ${x.employees?.game_name||x.employees?.discord_username||'-'} — منذ <t:${Math.floor(new Date(x.clock_in).getTime()/1000)}:R>`);
        return interaction.reply({content:lines.length?`**🟢 المسجلون دخول الآن (${open?.length||0})**\n${lines.join('\n')}`:'لا يوجد موظفون داخل الدوام الآن.',ephemeral:true});
      }
      if(action==='forceout'){
        const modal=new ModalBuilder().setCustomId('hr_forceout_submit').setTitle('خروج إجباري');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID للموظف').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('سبب الخروج الإجباري').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        ); return interaction.showModal(modal);
      }
      if(action==='warning'){
        const modal=new ModalBuilder().setCustomId('hr_warning_submit').setTitle('إنذار موظف');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID للموظف').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('سبب الإنذار').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        ); return interaction.showModal(modal);
      }
      if(action==='edit'){
        const modal=new ModalBuilder().setCustomId('hr_edit_submit').setTitle('تعديل معلومات موظف');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID للموظف').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('game_name').setLabel('اسم اللعبة الجديد (اتركه فارغًا للإبقاء)').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('game_phone').setLabel('رقم الجوال الجديد (اختياري)').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('citizen_id').setLabel('Citizen ID الجديد (اختياري)').setStyle(TextInputStyle.Short).setRequired(false)),
        ); return interaction.showModal(modal);
      }
      if(action==='lift_rejection'){
        const modal=new ModalBuilder().setCustomId('hr_lift_rejection_submit').setTitle('رفع رفض متقدم');
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID للمتقدم').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(modal);
      }
    }

    if(interaction.isModalSubmit() && interaction.customId==='hr_forceout_submit'){
      if(!isHrOrHigher(interaction)) return interaction.reply({content:'غير مصرح.',ephemeral:true});
      const discordId=interaction.fields.getTextInputValue('discord_id').trim(); const reason=interaction.fields.getTextInputValue('reason').trim();
      const emp=await getEmployee(discordId,false); if(!emp) return interaction.reply({content:'الموظف غير موجود.',ephemeral:true});
      const {data:shift}=await db.from('attendance').select('*').eq('employee_id',emp.id).is('clock_out',null).maybeSingle(); if(!shift) return interaction.reply({content:'الموظف ليس داخل الدوام حاليًا.',ephemeral:true});
      await db.from('attendance').update({clock_out:new Date().toISOString(),forced_out:true,forced_out_by_discord_id:interaction.user.id,forced_out_reason:reason}).eq('id',shift.id);
      const log=await getTextChannel('attendance_channel_id'); if(log) await log.send(`🚪 **خروج إجباري**\nالموظف: ${mention(discordId)}\nبواسطة: ${mention(interaction.user.id)}\nالسبب: ${reason}`);
      await audit(interaction.user.id,'forced_clock_out','employee',emp.id,{reason});
      await interaction.reply({content:'✅ تم تسجيل الخروج الإجباري.',ephemeral:true}); await refreshStatsPanel(); await refreshControlPanels(); return;
    }
    if(interaction.isModalSubmit() && interaction.customId==='hr_warning_submit'){
      if(!isHrOrHigher(interaction)) return interaction.reply({content:'غير مصرح.',ephemeral:true});
      const discordId=interaction.fields.getTextInputValue('discord_id').trim(); const reason=interaction.fields.getTextInputValue('reason').trim();
      const emp=await getEmployee(discordId,false); if(!emp) return interaction.reply({content:'الموظف غير موجود.',ephemeral:true});
      await db.from('warnings').insert({employee_id:emp.id,reason,issued_by_discord_id:interaction.user.id});
      const warn=await getTextChannel('warnings_channel_id'); if(warn) await warn.send({content:`${mention(discordId)} ${employeeRoleId()?`<@&${employeeRoleId()}>`:''}`,embeds:[new EmbedBuilder().setTitle('⚠️ إنذار موظف').setDescription(`الموظف: ${mention(discordId)}\nالسبب: **${reason}**\nبواسطة: ${mention(interaction.user.id)}`).setTimestamp()]});
      await audit(interaction.user.id,'employee_warning','employee',emp.id,{reason});
      await interaction.reply({content:'✅ تم تسجيل الإنذار وإرساله لروم الإنذارات.',ephemeral:true}); return;
    }
    if(interaction.isModalSubmit() && interaction.customId==='hr_edit_submit'){
      if(!isHrOrHigher(interaction)) return interaction.reply({content:'غير مصرح.',ephemeral:true});
      const discordId=interaction.fields.getTextInputValue('discord_id').trim(); const emp=await getEmployee(discordId,false); if(!emp) return interaction.reply({content:'الموظف غير موجود.',ephemeral:true});
      const update:any={updated_at:new Date().toISOString()};
      for(const key of ['game_name','game_phone','citizen_id']){ const v=interaction.fields.getTextInputValue(key).trim(); if(v) update[key]=v; }
      await db.from('employees').update(update).eq('id',emp.id);
      const hr=await getTextChannel('hr_records_channel_id'); if(hr) await hr.send(`✏️ تم تعديل بيانات ${mention(discordId)} بواسطة ${mention(interaction.user.id)}.`);
      await audit(interaction.user.id,'employee_profile_edit','employee',emp.id,{before:{game_name:emp.game_name,game_phone:emp.game_phone,citizen_id:emp.citizen_id},after:update});
      await interaction.reply({content:'✅ تم تعديل معلومات الموظف.',ephemeral:true}); return;
    }
    if(interaction.isModalSubmit() && interaction.customId==='hr_lift_rejection_submit'){
      if(!isHrOrHigher(interaction)) return interaction.reply({content:'غير مصرح.',ephemeral:true});
      const discordId=interaction.fields.getTextInputValue('discord_id').trim();
      const {data:app}=await db.from('applications').select('*').eq('discord_user_id',discordId).eq('status','rejected').order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(!app) return interaction.reply({content:'لا يوجد طلب مرفوض لهذا Discord ID.',ephemeral:true});
      const invite=await createApplicantInvite();
      await db.from('applications').update({status:'preaccepted',discord_invite_url:invite,updated_at:new Date().toISOString()}).eq('id',app.id);
      await addApplicantRoleIfPresent(interaction.guild,discordId);
      await audit(interaction.user.id,'application_rejection_lifted','application',app.id,{discord_user_id:discordId});
      await interaction.reply({content:'✅ تم رفع الرفض. يستطيع المتقدم الآن ضغط زر استكمال التقديم.',ephemeral:true}); await refreshControlPanels(); return;
    }

    // Admin panel
    if(interaction.isButton() && interaction.customId.startsWith('admin:')){
      if(!isOwnerOrBoss(interaction)) return interaction.reply({content:'هذه اللوحة للـ Owner وBoss فقط.',ephemeral:true});
      const action=interaction.customId.split(':')[1];
      if(action==='recruit_open' || action==='recruit_close'){
        const open=action==='recruit_open'; await setSetting('recruitment_open',String(open),interaction.user.id); await audit(interaction.user.id,open?'recruitment_open':'recruitment_close','guild',interaction.guildId||'');
        await interaction.reply({content:open?'🟢 تم فتح التقديم في الموقع.':'🔴 تم إغلاق التقديم في الموقع.',ephemeral:true}); await refreshControlPanels(); return;
      }
      if(action==='terminate'){
        const modal=new ModalBuilder().setCustomId('admin_terminate_submit').setTitle('فصل موظف');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID للموظف').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('سبب الفصل').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        ); return interaction.showModal(modal);
      }
      if(action==='reactivate'){
        const modal=new ModalBuilder().setCustomId('admin_reactivate_submit').setTitle('إعادة تفعيل موظف');
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('discord_id').setLabel('Discord ID للموظف').setStyle(TextInputStyle.Short).setRequired(true)));
        return interaction.showModal(modal);
      }
      if(action==='close_week'){
        const row=new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('admin:close_week_confirm').setLabel('تأكيد إغلاق الأسبوع').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('admin:close_week_cancel').setLabel('إلغاء').setStyle(ButtonStyle.Secondary),
        );
        return interaction.reply({content:'⚠️ سيتم حفظ تقرير الأسبوع الحالي ثم يبدأ أسبوع جديد من صفر. **الإحصائيات الدائمة لن تتأثر.**',components:[row],ephemeral:true});
      }
      if(action==='close_week_cancel') return interaction.update({content:'تم الإلغاء.',components:[]});
      if(action==='close_week_confirm'){
        await interaction.deferUpdate(); await closeCurrentWeek(interaction.user.id); return interaction.editReply({content:'✅ تم إغلاق الأسبوع وحفظ التقرير وبدء أسبوع جديد.',components:[]});
      }
    }
    if(interaction.isModalSubmit() && interaction.customId==='admin_terminate_submit'){
      if(!isOwnerOrBoss(interaction)) return interaction.reply({content:'غير مصرح.',ephemeral:true});
      const discordId=interaction.fields.getTextInputValue('discord_id').trim(); const reason=interaction.fields.getTextInputValue('reason').trim(); const emp=await getEmployee(discordId,false);
      if(!emp) return interaction.reply({content:'الموظف غير موجود.',ephemeral:true});
      await db.from('employees').update({is_active:false,employment_status:'terminated',status_reason:reason,status_changed_by_discord_id:interaction.user.id,status_changed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',emp.id);
      const {data:shift}=await db.from('attendance').select('*').eq('employee_id',emp.id).is('clock_out',null).maybeSingle();
      if(shift) await db.from('attendance').update({clock_out:new Date().toISOString(),forced_out:true,forced_out_by_discord_id:interaction.user.id,forced_out_reason:'فصل الموظف: '+reason}).eq('id',shift.id);
      const member=await interaction.guild?.members.fetch(discordId).catch(()=>null); if(member&&employeeRoleId()) await member.roles.remove(employeeRoleId()!).catch(()=>{});
      const log=await getTextChannel('admin_logs_channel_id'); if(log) await log.send(`⛔ **فصل موظف**\nالموظف: ${mention(discordId)}\nبواسطة: ${mention(interaction.user.id)}\nالسبب: ${reason}`);
      await audit(interaction.user.id,'employee_terminated','employee',emp.id,{reason}); await interaction.reply({content:'⛔ تم فصل الموظف وقفل صلاحياته، مع إبقاء جميع إحصائياته القديمة.',ephemeral:true}); await refreshStatsPanel(); await refreshControlPanels(); return;
    }
    if(interaction.isModalSubmit() && interaction.customId==='admin_reactivate_submit'){
      if(!isOwnerOrBoss(interaction)) return interaction.reply({content:'غير مصرح.',ephemeral:true});
      const discordId=interaction.fields.getTextInputValue('discord_id').trim(); const emp=await getEmployee(discordId,false); if(!emp) return interaction.reply({content:'الموظف غير موجود.',ephemeral:true});
      await db.from('employees').update({is_active:true,employment_status:'active',status_reason:null,status_changed_by_discord_id:interaction.user.id,status_changed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',emp.id);
      const member=await interaction.guild?.members.fetch(discordId).catch(()=>null); if(member&&employeeRoleId()) await member.roles.add(employeeRoleId()!).catch(()=>{});
      await audit(interaction.user.id,'employee_reactivated','employee',emp.id,{}); await interaction.reply({content:'✅ تم إعادة تفعيل الموظف وإرجاع صلاحياته بدون تصفير سجله.',ephemeral:true}); await refreshControlPanels(); return;
    }

  }catch(e:any){
    console.error(e);
    if(interaction.isRepliable()){
      const payload={content:`خطأ: ${e?.message||'حدث خطأ غير معروف'}`,ephemeral:true};
      if(interaction.replied||interaction.deferred) await interaction.followUp(payload).catch(()=>{}); else await interaction.reply(payload).catch(()=>{});
    }
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
