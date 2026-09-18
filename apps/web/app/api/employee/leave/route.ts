import { NextResponse } from 'next/server';
import { currentAccess } from '../../../../lib/access';
import { adminDb } from '../../../../lib/database';

export async function POST(req:Request){
  try{
    const a=await currentAccess(); if(!a.user||!a.role||a.locked||!a.employee) return NextResponse.json({error:'غير مصرح'},{status:403});
    const body=await req.json(); if(!body.starts_on||!body.ends_on) throw new Error('حدد تاريخ البداية والنهاية'); if(body.ends_on<body.starts_on) throw new Error('تاريخ النهاية يجب أن يكون بعد البداية');
    const {error}=await adminDb().from('leave_requests').insert({employee_id:a.employee.id,starts_on:body.starts_on,ends_on:body.ends_on,reason:body.reason||null}); if(error) throw error;
    return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({error:e.message||'error'},{status:500});}
}
