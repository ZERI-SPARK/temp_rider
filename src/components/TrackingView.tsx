'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import Dashboard from './Dashboard';

// Dynamically import the map to avoid SSR issues with Leaflet
const MapComponent = dynamic(() => import('./MapComponent'), {
    ssr: false,
    loading: () => (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-secondary)', color: 'var(--accent-blue)', flexDirection: 'column', gap: '16px' }}>
            <div className="pulsating-marker" style={{ position: 'relative', width: '48px', height: '48px' }}></div>
            <p style={{ fontWeight: 600 }}>Initializing GPS Engine...</p>
        </div>
    )
});

interface TrackingViewProps {
    session: {
        name: string;
        groupCode: string;
        isLeader: boolean;
    };
    onLeave: () => void;
}

export default function TrackingView({ session, onLeave }: TrackingViewProps) {
    const [peers, setPeers] = useState<Record<string, any>>({});

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <MapComponent session={session} onPeersUpdate={setPeers} />
            <Dashboard session={session} onLeave={onLeave} peers={peers} />
        </div>
    );
}
