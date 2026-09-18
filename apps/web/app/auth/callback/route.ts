import { NextResponse } from 'next/server';
import { setSession, verifyOauthState } from '../../../lib/auth';
import { auditEvent } from '../../../lib/audit';

export async function GET(req:Request){
  const url=new URL(req.url);
  const code=url.searchParams.get('code'); const state=url.searchParams.get('state');
  const site=(process.env.NEXT_PUBLIC_SITE_URL||url.origin).replace(/\/$/,'');
  if(!code||!(await verifyOauthState(state))) return NextResponse.redirect(`${site}/login?error=oauth_state`);
  if(!process.env.DISCORD_CLIENT_ID||!process.env.DISCORD_CLIENT_SECRET) return NextResponse.redirect(`${site}/login?error=oauth_config`);
  const redirectUri=`${site}/auth/callback`;
  const body=new URLSearchParams({
    client_id:process.env.DISCORD_CLIENT_ID,
    client_secret:process.env.DISCORD_CLIENT_SECRET,
    grant_type:'authorization_code',
    code,
    redirect_uri:redirectUri,
  });
  const tokenRes=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,cache:'no-store'}).catch(()=>null);
  if(!tokenRes?.ok) return NextResponse.redirect(`${site}/login?error=oauth_token`);
  const token:any=await tokenRes.json();
  const userRes=await fetch('https://discord.com/api/v10/users/@me',{headers:{authorization:`Bearer ${token.access_token}`},cache:'no-store'}).catch(()=>null);
  if(!userRes?.ok) return NextResponse.redirect(`${site}/login?error=oauth_user`);
  const user:any=await userRes.json();
  await setSession(user);
  await auditEvent(user.id,'website_login','discord_user',user.id,{username:user.username,display_name:user.global_name||user.username},'الموقع');
  return NextResponse.redirect(`${site}/portal`);
}
