import type { Metadata } from 'next'
import './globals.css'
import 'leaflet/dist/leaflet.css';

export const metadata: Metadata = {
  title: 'Rider Tracker | Real-time GPS Group Mapping',
  description: 'Track your bike riders or car travelers in real-time. Create ephemeral groups and navigate together flawlessly.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <main className="app-container">
          {children}
        </main>
      </body>
    </html>
  )
}
