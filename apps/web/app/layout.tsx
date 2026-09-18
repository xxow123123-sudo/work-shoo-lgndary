import './globals.css';

export const metadata={
  title:'Legendary Workshop',
  description:'Legendary Workshop recruitment and staff portal',
};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
