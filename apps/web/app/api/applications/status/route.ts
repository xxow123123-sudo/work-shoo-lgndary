import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { adminDb } from '../../../../lib/database';

const labels:Record<string,string>={
  pending:'تحت المراجعة',
  preaccepted:'مقبول مبدئيًا',
  profile_submitted:'بانتظار HR',
  interview:'مقابلة',
  accepted:'مقبول نهائيًا',
  rejected:'مرفوض',
};

export async function GET(){
  const store=await cookies();
  const appId=store.get('legendary_app')?.value;
  if(!appId) return NextResponse.json({error:'لا يوجد تقديم مرتبط بهذا الجهاز'},{status:404});
  const db=adminDb();
  const {data,error}=await db.from('applications').select('status,discord_invite_url,updated_at').eq('id',appId).maybeSingle();
  if(error) return NextResponse.json({error:error.message},{status:500});
  if(!data) return NextResponse.json({error:'لم يتم العثور على التقديم'},{status:404});
  const showInvite=['preaccepted','profile_submitted','interview','accepted'].includes(data.status);
  return NextResponse.json({status:data.status,status_label:labels[data.status]||data.status,discord_invite_url:showInvite?data.discord_invite_url:null,updated_at:data.updated_at});
}
