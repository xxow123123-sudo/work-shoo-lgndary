import { NextResponse } from 'next/server';
import { clearOauthStateCookie, setSessionCookie, verifyOauthState } from '../../../lib/auth';
import { auditEvent } from '../../../lib/audit';

export async function GET(req:Request){
  const url=new URL(req.url);
  const code=url.searchParams.get('code'); const state=url.searchParams.get('state');
  const site=(process.env.NEXT_PUBLIC_SITE_URL||url.origin).replace(/\/$/,'');
  if(!code||!(await verifyOauthState(state))){
    const response=NextResponse.redirect(`${site}/login?error=oauth_state`);
    clearOauthStateCookie(response);
    return response;
  }
  if(!process.env.DISCORD_CLIENT_ID||!process.env.DISCORD_CLIENT_SECRET){
    const response=NextResponse.redirect(`${site}/login?error=oauth_config`);
    clearOauthStateCookie(response);
    return response;
  }
  const redirectUri=`${site}/auth/callback`;
  const body=new URLSearchParams({
    client_id:process.env.DISCORD_CLIENT_ID,
    client_secret:process.env.DISCORD_CLIENT_SECRET,
    grant_type:'authorization_code',
    code,
    redirect_uri:redirectUri,
  });
  const tokenRes=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,cache:'no-store'}).catch(()=>null);
  if(!tokenRes?.ok){
    const response=NextResponse.redirect(`${site}/login?error=oauth_token`);
    clearOauthStateCookie(response);
    return response;
  }
  const token:any=await tokenRes.json();
  const userRes=await fetch('https://discord.com/api/v10/users/@me',{headers:{authorization:`Bearer ${token.access_token}`},cache:'no-store'}).catch(()=>null);
  if(!userRes?.ok){
    const response=NextResponse.redirect(`${site}/login?error=oauth_user`);
    clearOauthStateCookie(response);
    return response;
  }
  const user:any=await userRes.json();
  await auditEvent(user.id,'website_login','discord_user',user.id,{username:user.username,display_name:user.global_name||user.username},'الموقع');
  const response=NextResponse.redirect(`${site}/portal`);
  setSessionCookie(response,user);
  clearOauthStateCookie(response);
  return response;
}
