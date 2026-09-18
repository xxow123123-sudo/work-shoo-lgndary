import Link from 'next/link';
import type {ReactNode} from 'react';

type Role='owner'|'boss'|'hr'|'employee'|string|null;
const roleLabel:Record<string,string>={owner:'المالك',boss:'الإدارة العليا',hr:'الموارد البشرية',employee:'موظف'};

export default function StaffShell({role,name,section,children}:{role:Role;name?:string|null;section:string;children:ReactNode}){
  return <main className="staff-shell">
    <header className="staff-nav">
      <div className="staff-brand">
        <img src="/legendary-logo.png" alt="Legendary"/>
        <div><strong>LEGENDARY</strong><span>WORKSHOP SYSTEM</span></div>
      </div>
      <nav className="staff-nav-links">
        <Link href="/">الرئيسية</Link>
        {role==='employee'&&<Link href="/dashboard">لوحتي</Link>}
        {(role==='hr'||role==='boss'||role==='owner')&&<Link href="/hr">HR</Link>}
        {(role==='boss'||role==='owner')&&<Link href="/admin">الإدارة العليا</Link>}
      </nav>
      <div className="staff-user">
        <div className="staff-user-copy"><strong>{name||'Legendary Staff'}</strong><span>{roleLabel[String(role)]||'عضو'}</span></div>
        <span className="staff-role-dot"/>
      </div>
    </header>
    <section className="staff-content">
      <div className="staff-section-kicker">LEGENDARY / {section}</div>
      {children}
    </section>
  </main>;
}
