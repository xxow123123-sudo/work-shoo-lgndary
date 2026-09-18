import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

const SESSION_COOKIE='legendary_session';
const STATE_COOKIE='legendary_oauth_state';

type Session={discordId:string;username:string;displayName?:string;avatar?:string|null;exp:number};

function secret(){
  const value=process.env.SESSION_SECRET;
  if(!value) throw new Error('SESSION_SECRET is required');
  return value;
}
function sign(payload:string){return createHmac('sha256',secret()).update(payload).digest('base64url');}
function encode(session:Session){
  const payload=Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
function decode(raw?:string|null):Session|null{
  if(!raw) return null;
  const [payload,sig]=raw.split('.'); if(!payload||!sig) return null;
  const expected=sign(payload);
  const a=Buffer.from(sig); const b=Buffer.from(expected);
  if(a.length!==b.length||!timingSafeEqual(a,b)) return null;
  try{const data=JSON.parse(Buffer.from(payload,'base64url').toString()) as Session; if(!data.discordId||!data.exp||Date.now()>data.exp) return null; return data;}catch{return null;}
}

export async function currentSession(){
  const store=await cookies();
  return decode(store.get(SESSION_COOKIE)?.value);
}

export async function createOauthState(){
  const state=randomBytes(24).toString('base64url');
  const store=await cookies();
  store.set(STATE_COOKIE,state,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:600});
  return state;
}

export async function verifyOauthState(state:string|null){
  const store=await cookies(); const saved=store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  return Boolean(state&&saved&&state===saved);
}

export async function setSession(user:{id:string;username:string;global_name?:string|null;avatar?:string|null}){
  const store=await cookies();
  const session:Session={discordId:user.id,username:user.username,displayName:user.global_name||user.username,avatar:user.avatar||null,exp:Date.now()+1000*60*60*24*7};
  store.set(SESSION_COOKIE,encode(session),{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*7});
}

export function sessionAvatarUrl(session:Session|null){
  if(!session) return null;
  if(session.avatar) return `https://cdn.discordapp.com/avatars/${session.discordId}/${session.avatar}.png?size=128`;
  try{return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(session.discordId)>>22n)%6n)}.png`;}catch{return 'https://cdn.discordapp.com/embed/avatars/0.png';}
}

export async function clearSession(){const store=await cookies();store.delete(SESSION_COOKIE);}
