'use client';

import { LogOut, Copy, CheckCircle, Navigation, ShieldAlert } from 'lucide-react';
import { useState, useEffect } from 'react';

interface DashboardProps {
    session: {
        name: string;
        groupCode: string;
        isLeader: boolean;
    };
    onLeave: () => void;
    peers?: Record<string, any>;
}

export default function Dashboard({ session, onLeave, peers = {} }: DashboardProps) {
    const [copied, setCopied] = useState(false);
    const [isExpanded, setIsExpanded] = useState(true);
    const [showMembers, setShowMembers] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(session.groupCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const membersCount = Object.keys(peers).length + 1; // peers + self

    return (
        <div className="glass-panel bottom-overlay" style={{
            padding: isExpanded ? '20px' : '12px 20px',
            display: 'flex', flexDirection: 'column', gap: isExpanded ? '16px' : '0',
            overflowY: 'auto', transition: 'var(--transition-smooth)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{ cursor: 'pointer', display: 'flex', flexGrow: 1, alignItems: 'center' }}
                >
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Navigation size={20} color="var(--accent-cyan)" />
                            {session.name}
                        </h2>
                        {isExpanded && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', background: session.isLeader ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: session.isLeader ? 'var(--leader-gold)' : 'var(--accent-blue)', fontWeight: 600 }}>
                                    {session.isLeader ? 'Group Leader' : 'Rider'}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={() => setIsExpanded(!isExpanded)} style={{ color: 'var(--text-secondary)', padding: '8px', borderRadius: '8px', transition: 'var(--transition-smooth)' }}>
                        <span style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'var(--transition-smooth)' }}>▼</span>
                    </button>
                    <button onClick={onLeave} style={{ color: 'var(--danger-red)', padding: '8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', transition: 'var(--transition-smooth)' }}>
                        <LogOut size={20} />
                    </button>
                </div>
            </div>

            {isExpanded && (
                <>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Group Code</p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '2px', color: 'var(--text-primary)' }}>{session.groupCode}</span>
                            <button onClick={handleCopy} style={{ color: copied ? 'var(--success-green)' : 'var(--text-secondary)', transition: 'var(--transition-smooth)' }}>
                                {copied ? <CheckCircle size={20} /> : <Copy size={20} />}
                            </button>
                        </div>
                    </div>

                    {/* Members Toggle Section */}
                    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
                        <div
                            onClick={() => setShowMembers(!showMembers)}
                            style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}
                        >
                            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                Group Members ({membersCount})
                            </p>
                            <span style={{ transform: showMembers ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'var(--transition-smooth)', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>▼</span>
                        </div>

                        {showMembers && (
                            <div style={{ padding: '0 16px 16px 16px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                                {/* Self */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                                    <span style={{ color: 'var(--text-primary)' }}>{session.name} (You)</span>
                                    {session.isLeader && <span style={{ color: 'var(--leader-gold)', fontSize: '1rem' }}>👑</span>}
                                </div>

                                {/* Peers */}
                                {Object.values(peers).map((peer: any) => (
                                    <div key={peer.socketId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>{peer.name}</span>
                                        {peer.isLeader && <span style={{ color: 'var(--leader-gold)', fontSize: '1rem' }}>👑</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        <ShieldAlert size={16} color="var(--accent-cyan)" style={{ flexShrink: 0 }} />
                        <p>Keep the app open to continue broadcasting your location to the group.</p>
                    </div>
                </>
            )}
        </div>
    );
}
