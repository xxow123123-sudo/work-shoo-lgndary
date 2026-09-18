import { adminDb } from './database';

export async function discordChannelId(key:string){
  const db=adminDb(); const {data}=await db.from('bot_settings').select('value').eq('guild_id',process.env.DISCORD_GUILD_ID!).eq('key',key).maybeSingle();
  return data?.value||null;
}
export async function sendDiscord(key:string,payload:any){
  const channel=await discordChannelId(key); if(!channel||!process.env.DISCORD_BOT_TOKEN) return false;
  const r=await fetch(`https://discord.com/api/v10/channels/${channel}/messages`,{method:'POST',headers:{authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`,'content-type':'application/json'},body:JSON.stringify(payload)}).catch(()=>null);
  return Boolean(r?.ok);
}
export async function updateDiscordMemberRole(discordId:string,roleId:string|undefined,add:boolean){
  if(!roleId||!process.env.DISCORD_BOT_TOKEN||!process.env.DISCORD_GUILD_ID) return false;
  const url=`https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordId}/roles/${roleId}`;
  const r=await fetch(url,{method:add?'PUT':'DELETE',headers:{authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`}}).catch(()=>null); return Boolean(r?.ok);
}

export type DiscordProfile={id:string;displayName:string;username:string;avatarUrl:string|null;role:'owner'|'boss'|'hr'|'employee'|'applicant'|null};
function roleFromRoles(id:string,roles:string[]):DiscordProfile['role']{
  if(id===process.env.DISCORD_OWNER_USER_ID) return 'owner';
  if(process.env.DISCORD_BOSS_ROLE_ID&&roles.includes(process.env.DISCORD_BOSS_ROLE_ID)) return 'boss';
  if(process.env.DISCORD_HR_ROLE_ID&&roles.includes(process.env.DISCORD_HR_ROLE_ID)) return 'hr';
  const employeeRole=process.env.DISCORD_EMPLOYEE_ROLE_ID||process.env.DISCORD_EMPLOYEES_ROLE_ID;
  if(employeeRole&&roles.includes(employeeRole)) return 'employee';
  if(process.env.DISCORD_APPLICANT_ROLE_ID&&roles.includes(process.env.DISCORD_APPLICANT_ROLE_ID)) return 'applicant';
  return null;
}
function defaultAvatar(id:string){
  try{return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id)>>22n)%6n)}.png`;}catch{return 'https://cdn.discordapp.com/embed/avatars/0.png';}
}
export async function discordMemberProfile(discordId:string):Promise<DiscordProfile>{
  const fallback={id:discordId,displayName:discordId,username:discordId,avatarUrl:null,role:discordId===process.env.DISCORD_OWNER_USER_ID?'owner' as const:null};
  if(!process.env.DISCORD_BOT_TOKEN||!process.env.DISCORD_GUILD_ID) return fallback;
  const r=await fetch(`https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordId}`,{headers:{authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`},cache:'no-store'}).catch(()=>null);
  if(!r?.ok) return fallback;
  const member:any=await r.json(); const user=member.user||{}; const roles:string[]=member.roles||[];
  return {
    id:discordId,
    displayName:member.nick||user.global_name||user.username||discordId,
    username:user.username||discordId,
    avatarUrl:user.avatar?`https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png?size=128`:defaultAvatar(discordId),
    role:roleFromRoles(discordId,roles),
  };
}
export async function discordProfiles(ids:(string|null|undefined)[]){
  const unique=[...new Set(ids.filter(Boolean).map(String))].slice(0,100);
  const rows=await Promise.all(unique.map(async id=>[id,await discordMemberProfile(id)] as const));
  return new Map(rows);
}
