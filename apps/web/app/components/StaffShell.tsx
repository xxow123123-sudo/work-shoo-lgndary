import Link from 'next/link';
import type {ReactNode} from 'react';

type Role='owner'|'boss'|'hr'|'employee'|string|null;
const roleLabel:Record<string,string>={owner:'Owner',boss:'Boss',hr:'HR',employee:'Employee'};

type NavItem={href:string;label:string;group?:string};
function navFor(role:Role):NavItem[]{
  const employee=[
    {href:'/dashboard#overview',label:'الرئيسية'},
    {href:'/dashboard#activity',label:'عملياتي'},
    {href:'/dashboard#attendance',label:'الحضور والساعات'},
    {href:'/dashboard#leave',label:'الإجازات'},
    {href:'/dashboard#warnings',label:'الإنذارات'},
  ];
  if(role==='employee') return employee;
  const hr=[
    {href:'/hr#overview',label:'الرئيسية'},
    {href:'/hr#employees',label:'الموظفون'},
    {href:'/hr#online',label:'المسجلون دخول'},
    {href:'/hr#applications',label:'التقديمات'},
    {href:'/hr#leave',label:'الإجازات'},
    {href:'/hr#actions',label:'إجراءات HR'},
  ];
  if(role==='hr') return hr;
  return [
    {href:'/admin#overview',label:'الرئيسية'},
    {href:'/admin#stats',label:'إحصائيات الورشة'},
    {href:'/admin#leaderboard',label:'النشاط الأسبوعي'},
    {href:'/admin#requirements',label:'متطلبات الموظفين'},
    {href:'/admin#controls',label:'التحكم الإداري'},
    {href:'/admin#audit',label:'اللوق الإداري'},
    {href:'/hr',label:'الموارد البشرية'},
  ];
}

export default function StaffShell({role,name,username,avatarUrl,section,children}:{role:Role;name?:string|null;username?:string|null;avatarUrl?:string|null;section:string;children:ReactNode}){
  const nav=navFor(role);
  return <main className="staff-app-shell">
    <aside className="staff-sidebar">
      <Link href="/" className="sidebar-brand"><img src="/legendary-logo.png" alt="Legendary"/><div><strong>LEGENDARY</strong><span>WORKSHOP</span></div></Link>
      <nav className="sidebar-nav">{nav.map(item=><Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>
      <div className="sidebar-bottom">
        <div className="sidebar-user">
          {avatarUrl?<img src={avatarUrl} alt={name||'Discord user'}/>:<span className="sidebar-avatar-fallback">{(name||'?').slice(0,1).toUpperCase()}</span>}
          <div><strong>{name||'Legendary Staff'}</strong><span>{username?`@${username}`:roleLabel[String(role)]||'Staff'}</span></div>
          <b>{roleLabel[String(role)]||'Staff'}</b>
        </div>
        <Link className="sidebar-logout" href="/auth/logout">تسجيل الخروج</Link>
      </div>
    </aside>
    <section className="staff-main">
      <header className="staff-topbar">
        <div><span>LEGENDARY / {section}</span><strong>{roleLabel[String(role)]||'Staff'} Dashboard</strong></div>
        <div className="topbar-profile">
          {avatarUrl?<img src={avatarUrl} alt={name||'Discord user'}/>:null}
          <div><strong>{name||'Legendary Staff'}</strong><span>{username?`@${username}`:''}</span></div>
        </div>
      </header>
      <div className="staff-content">{children}</div>
    </section>
  </main>;
}
