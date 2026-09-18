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
