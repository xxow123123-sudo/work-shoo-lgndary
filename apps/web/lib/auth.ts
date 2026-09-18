import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

const SESSION_COOKIE='legendary_session';
const STATE_COOKIE='legendary_oauth_state';
const SESSION_DAYS=Math.max(1,Number(process.env.SESSION_DAYS||30));
const SESSION_SECONDS=60*60*24*SESSION_DAYS;

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

export function newOauthState(){return randomBytes(24).toString('base64url');}

export async function verifyOauthState(state:string|null){
  const store=await cookies(); const saved=store.get(STATE_COOKIE)?.value;
  return Boolean(state&&saved&&state===saved);
}

export function setOauthStateCookie(response:NextResponse,state:string){
  response.cookies.set(STATE_COOKIE,state,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:600});
}

export function clearOauthStateCookie(response:NextResponse){
  response.cookies.set(STATE_COOKIE,'',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:0,expires:new Date(0)});
}

export function setSessionCookie(response:NextResponse,user:{id:string;username:string;global_name?:string|null;avatar?:string|null}){
  const session:Session={discordId:user.id,username:user.username,displayName:user.global_name||user.username,avatar:user.avatar||null,exp:Date.now()+SESSION_SECONDS*1000};
  response.cookies.set(SESSION_COOKIE,encode(session),{
    httpOnly:true,
    sameSite:'lax',
    secure:process.env.NODE_ENV==='production',
    path:'/',
    maxAge:SESSION_SECONDS,
    expires:new Date(Date.now()+SESSION_SECONDS*1000),
    priority:'high',
  });
}

export function sessionAvatarUrl(session:Session|null){
  if(!session) return null;
  if(session.avatar) return `https://cdn.discordapp.com/avatars/${session.discordId}/${session.avatar}.png?size=128`;
  try{return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(session.discordId)>>22n)%6n)}.png`;}catch{return 'https://cdn.discordapp.com/embed/avatars/0.png';}
}

export async function clearSession(){
  const store=await cookies();
  store.set(SESSION_COOKIE,'',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:0,expires:new Date(0)});
}
