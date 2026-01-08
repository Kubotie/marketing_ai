import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '競合バナー分析アプリ',
  description: '競合バナーの構成要素・訴求・示唆を分析',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
