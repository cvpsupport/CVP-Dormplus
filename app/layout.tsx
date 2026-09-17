import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DormPlus — ระบบจัดการหอพัก',
  description: 'Dormitory management dashboard built with Next.js, Supabase and Vercel.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
