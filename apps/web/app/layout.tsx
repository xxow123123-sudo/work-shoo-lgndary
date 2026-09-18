import './globals.css';

export const metadata={
  title:'Legendary Workshop',
  description:'Legendary Workshop recruitment and staff portal',
};

export default function RootLayout({children}:{children:React.ReactNode}){
  const ownerId=process.env.DISCORD_OWNER_USER_ID || '';
  const supportUrl=ownerId ? `https://discord.com/users/${ownerId}` : 'https://discord.com/';
  return <html lang="ar" dir="rtl"><body>
    {children}
    <footer className="site-credit-global">
      <span>Made by <strong>PILOT</strong></span>
      <span className="credit-sep">•</span>
      <a href={supportUrl} target="_blank" rel="noreferrer">Discord للأعطال والمساعدة</a>
    </footer>
  </body></html>;
}
