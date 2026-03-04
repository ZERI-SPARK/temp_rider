'use client';

import { useState } from 'react';
import JoinModal from '@/components/JoinModal';
import TrackingView from '@/components/TrackingView';

export default function Home() {
  const [session, setSession] = useState<{ name: string, groupCode: string, isLeader: boolean } | null>(null);

  return (
    <>
      {!session ? (
        <JoinModal onJoin={(data) => setSession(data)} />
      ) : (
        <TrackingView session={session} onLeave={() => setSession(null)} />
      )}
    </>
  );
}
