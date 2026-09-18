import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { clearOauthStateCookie, setSessionCookie, verifyOauthState } from '../../../lib/auth';
import { auditEvent } from '../../../lib/audit';
import { adminDb } from '../../../lib/database';

function attachApplicationCookie(response:NextResponse, applicationId:string){
  response.cookies.set('legendary_app',applicationId,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:60*60*24*365});
}

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
  const db=adminDb();
  const store=await cookies();
  const cookieAppId=store.get('legendary_app')?.value;

  // إذا فتح المتقدم OAuth من صفحة طلب موجود، لازم حساب Discord يطابق الـ ID الذي قدم به.
  if(cookieAppId){
    const {data:cookieApp}=await db.from('applications').select('id,discord_user_id,status').eq('id',cookieAppId).maybeSingle();
    if(cookieApp && cookieApp.discord_user_id!==user.id){
      const response=NextResponse.redirect(`${site}/apply/status?error=discord_mismatch`);
      clearOauthStateCookie(response);
      return response;
    }
  }

  const {data:application}=await db.from('applications').select('id,status,discord_user_id').eq('discord_user_id',user.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  const applicantStates=['pending','preaccepted','profile_submitted','interview','rejected'];
  const target=application && applicantStates.includes(application.status) ? '/apply/status' : '/portal';

  await auditEvent(user.id,'website_login','discord_user',user.id,{username:user.username,display_name:user.global_name||user.username,application_status:application?.status||null},'الموقع');
  const response=NextResponse.redirect(`${site}${target}`);
  setSessionCookie(response,user);
  if(application?.id) attachApplicationCookie(response,application.id);
  clearOauthStateCookie(response);
  return response;
}
