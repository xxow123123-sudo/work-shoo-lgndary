import { NextResponse } from 'next/server';
import { newOauthState, setOauthStateCookie } from '../../../lib/auth';

export async function GET(req:Request){
  const url=new URL(req.url);
  const clientId=process.env.DISCORD_CLIENT_ID;
  if(!clientId) return NextResponse.redirect(`${url.origin}/login?error=missing_client_id`);
  const state=newOauthState();
  const site=(process.env.NEXT_PUBLIC_SITE_URL||url.origin).replace(/\/$/,'');
  const redirectUri=`${site}/auth/callback`;
  const target=new URL('https://discord.com/oauth2/authorize');
  target.searchParams.set('client_id',clientId);
  target.searchParams.set('response_type','code');
  target.searchParams.set('redirect_uri',redirectUri);
  target.searchParams.set('scope','identify');
  target.searchParams.set('state',state);
  const response=NextResponse.redirect(target);
  setOauthStateCookie(response,state);
  return response;
}
