'use client';

import { useState } from 'react';
import { MapPin, Users, Crown } from 'lucide-react';

interface JoinModalProps {
    onJoin: (data: { name: string; groupCode: string; isLeader: boolean }) => void;
}

export default function JoinModal({ onJoin }: JoinModalProps) {
    const [name, setName] = useState('');
    const [groupCode, setGroupCode] = useState('');
    const [mode, setMode] = useState<'join' | 'create'>('join');

    const handleAction = () => {
        if (!name.trim()) {
            alert("Please enter a display name!");
            return;
        }

        let code = groupCode.trim().toUpperCase();
        if (mode === 'create') {
            // Generate random 5 letter code
            code = Math.random().toString(36).substring(2, 7).toUpperCase();
        } else if (!code) {
            alert("Please enter a group code!");
            return;
        }

        onJoin({
            name: name.trim(),
            groupCode: code,
            isLeader: mode === 'create'
        });
    };

    return (
        <div className="glass-panel" style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '100%', maxWidth: '400px', padding: '32px', zIndex: 10
        }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                <MapPin size={48} color="var(--accent-cyan)" style={{ filter: 'drop-shadow(0 0 10px var(--accent-glow))', marginBottom: '16px' }} />
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '8px' }}>Rider Tracker</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Real-time GPS synchronization for groups</p>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '8px' }}>
                <button
                    onClick={() => setMode('join')}
                    style={{
                        flex: 1, padding: '8px', borderRadius: '4px', color: mode === 'join' ? '#fff' : 'var(--text-secondary)',
                        background: mode === 'join' ? 'var(--bg-panel)' : 'transparent', fontWeight: 600, transition: 'var(--transition-smooth)'
                    }}>
                    Join Group
                </button>
                <button
                    onClick={() => setMode('create')}
                    style={{
                        flex: 1, padding: '8px', borderRadius: '4px', color: mode === 'create' ? '#fff' : 'var(--text-secondary)',
                        background: mode === 'create' ? 'var(--bg-panel)' : 'transparent', fontWeight: 600, transition: 'var(--transition-smooth)'
                    }}>
                    Create Group
                </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>Display Name</label>
                    <input
                        className="input-elegant"
                        placeholder="e.g. Ghost Rider"
                        value={name}
                        onChange={e => setName(e.target.value)}
                    />
                </div>

                {mode === 'join' && (
                    <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '8px', color: 'var(--text-secondary)' }}>Group Code</label>
                        <input
                            className="input-elegant"
                            placeholder="e.g. X1A9B"
                            value={groupCode}
                            onChange={e => setGroupCode(e.target.value)}
                            style={{ textTransform: 'uppercase' }}
                        />
                    </div>
                )}

                <button className="btn-primary" style={{ marginTop: '8px' }} onClick={handleAction}>
                    {mode === 'create' ? <Crown size={20} /> : <Users size={20} />}
                    {mode === 'create' ? 'Create & Lead' : 'Join Group'}
                </button>
            </div>
        </div>
    );
}
