import { redirect } from 'next/navigation';
import { adminDb } from './database';
import { currentSession } from './auth';

export type StaffRole='owner'|'boss'|'hr'|'employee';
const rank:Record<StaffRole,number>={employee:1,hr:2,boss:3,owner:4};

async function liveDiscordRole(discordId:string):Promise<StaffRole|null>{
  if(discordId===process.env.DISCORD_OWNER_USER_ID) return 'owner';
  if(!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_GUILD_ID) return null;
  const r=await fetch(`https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordId}`,{headers:{authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`},cache:'no-store'}).catch(()=>null);
  if(!r?.ok) return null;
  const member:any=await r.json(); const roles:string[]=member.roles||[];
  if(process.env.DISCORD_BOSS_ROLE_ID && roles.includes(process.env.DISCORD_BOSS_ROLE_ID)) return 'boss';
  if(process.env.DISCORD_HR_ROLE_ID && roles.includes(process.env.DISCORD_HR_ROLE_ID)) return 'hr';
  const employeeRole=process.env.DISCORD_EMPLOYEE_ROLE_ID||process.env.DISCORD_EMPLOYEES_ROLE_ID;
  if(employeeRole && roles.includes(employeeRole)) return 'employee';
  return null;
}

export async function currentAccess(){
  const session=await currentSession();
  if(!session) return {user:null,discordId:'',role:null as StaffRole|null,employee:null,locked:false};
  const user={id:session.discordId,user_metadata:{full_name:session.username,name:session.username,preferred_username:session.username}};
  const discordId=session.discordId;
  const db=adminDb();
  const {data:employee}=await db.from('employees').select('*').eq('discord_user_id',discordId).maybeSingle();
  if(employee && (!employee.is_active || employee.employment_status!=='active')) return {user,discordId,role:null as StaffRole|null,employee,locked:true};
  let live=await liveDiscordRole(discordId);
  // الموظف في إجازة تُسحب منه رتبة Employee في Discord، لكن يبقى قادرًا على دخول موقعه
  // ومشاهدة حالة الإجازة وكسرها. نتحقق من الإجازة الفعالة من قاعدة البيانات.
  if(!live && employee){
    const today=new Date().toISOString().slice(0,10);
    const {data:leave}=await db.from('leave_requests').select('id').eq('employee_id',employee.id).eq('status','approved').lte('starts_on',today).gte('ends_on',today).limit(1).maybeSingle();
    if(leave) live='employee';
  }
  if(!live) return {user,discordId,role:null as StaffRole|null,employee,locked:false};
  let record=employee;
  if(!record && live!=='employee'){
    const {data}=await db.from('employees').upsert({discord_user_id:discordId,discord_username:session.username,role:live,is_active:true,employment_status:'active'},{onConflict:'discord_user_id'}).select('*').single();
    record=data;
  }else if(record && record.role!==live){
    const {data}=await db.from('employees').update({role:live,updated_at:new Date().toISOString()}).eq('id',record.id).select('*').single(); record=data;
  }
  return {user,discordId,role:live,employee:record,locked:false};
}

export async function requireRole(minimum:StaffRole){
  const a=await currentAccess();
  if(!a.user) redirect('/login');
  if(a.locked) return a;
  if(!a.role || rank[a.role]<rank[minimum]) redirect('/portal');
  return a;
}

export function roleHome(role:StaffRole|null){
  if(role==='owner'||role==='boss') return '/admin';
  if(role==='hr') return '/hr';
  if(role==='employee') return '/dashboard';
  return '/portal';
}
