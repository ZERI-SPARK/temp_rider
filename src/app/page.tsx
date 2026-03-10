'use client';

import { useState, useEffect } from 'react';
import JoinModal from '@/components/JoinModal';
import TrackingView from '@/components/TrackingView';

export default function Home() {
  const [session, setSession] = useState<{ name: string, groupCode: string, isLeader: boolean } | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const savedSession = localStorage.getItem('temp_rider_session');
    if (savedSession) {
      try {
        setSession(JSON.parse(savedSession));
      } catch (e) {
        localStorage.removeItem('temp_rider_session');
      }
    }
    setIsLoaded(true);
  }, []);

  const handleJoin = (data: { name: string, groupCode: string, isLeader: boolean }) => {
    setSession(data);
    localStorage.setItem('temp_rider_session', JSON.stringify(data));
  };

  const handleLeave = () => {
    setSession(null);
    localStorage.removeItem('temp_rider_session');
  };

  if (!isLoaded) return null; // Avoid hydration mismatch

  return (
    <>
      {!session ? (
        <JoinModal onJoin={handleJoin} />
      ) : (
        <TrackingView session={session} onLeave={handleLeave} />
      )}
    </>
  );
}
