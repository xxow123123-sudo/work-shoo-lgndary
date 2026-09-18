import { NextResponse } from 'next/server';
import { clearSession, currentSession } from '../../../lib/auth';
import { auditEvent } from '../../../lib/audit';
export async function GET(req:Request){
  const session=await currentSession();
  if(session) await auditEvent(session.discordId,'website_logout','discord_user',session.discordId,{},'الموقع');
  await clearSession();
  return NextResponse.redirect(new URL('/',req.url));
}
