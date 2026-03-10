'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Tooltip, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { io, Socket } from 'socket.io-client';
import DestinationSearch from './DestinationSearch';

// We fix default leaflet icon paths for Next.js manually if we need to,
// but since we are using custom HTML markers, standard markers are less critical.
// We will create a custom DivIcon for our markers to use the pulsating CSS.

interface Position { lat: number; lng: number }
interface RiderData {
    socketId: string;
    groupId: string;
    userId: string;
    name: string;
    lat: number;
    lng: number;
    isLeader: boolean;
    lastUpdate: number;
}

interface MapComponentProps {
    session: {
        name: string;
        groupCode: string;
        isLeader: boolean;
    };
    onPeersUpdate?: (peers: Record<string, RiderData>) => void;
    onLeave?: () => void;
}

// Google Maps-style navigation camera lock
function NavigationCamera({ myPosition, isNavigating, autoPan }: { myPosition: Position | null, isNavigating: boolean, autoPan: boolean }) {
    const map = useMap();
    useEffect(() => {
        if (isNavigating && myPosition && autoPan) {
            // Lock onto the exact position tightly when navigating
            map.flyTo([myPosition.lat, myPosition.lng], 18, { animate: true, duration: 0.5 });
        }
    }, [myPosition, isNavigating, autoPan, map]);

    // Initial center on load if not navigating
    useEffect(() => {
        if (!isNavigating && myPosition) {
            map.setView([myPosition.lat, myPosition.lng], 16, { animate: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once to center user on initial load

    return null;
}

// Track user drag/zoom to disable auto-pan
function MapEventTracker({ onDrag }: { onDrag: () => void }) {
    useMapEvents({
        dragstart: onDrag,
        zoomstart: () => {
            // Let user zoom without snapping back immediately
            onDrag();
        }
    });
    return null;
}

export default function MapComponent({ session, onPeersUpdate, onLeave }: MapComponentProps) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [myPosition, setMyPosition] = useState<Position | null>(null);
    const [peers, setPeers] = useState<Record<string, RiderData>>({});

    // Routing state
    const [destination, setDestination] = useState<{ lat: number, lng: number, name: string } | null>(null);
    const [route, setRoute] = useState<[number, number][]>([]);

    // View state for Riders
    const [viewMode, setViewMode] = useState<'all' | 'leader' | 'destination'>('all');
    const [isNavigating, setIsNavigating] = useState(false);
    const [autoPan, setAutoPan] = useState(true);
    const [heading, setHeading] = useState(0);

    const geoWatchId = useRef<number | null>(null);

    useEffect(() => {
        // Connect to Socket.IO server ensuring secure websocket upgrade handling behind Render's proxy
        const socketUrl = window.location.origin.includes('localhost') ? window.location.origin : window.location.origin.replace('http://', 'https://');
        const newSocket = io(socketUrl, {
            transports: ['websocket', 'polling'], // Fallback safely
            secure: true,
            rejectUnauthorized: false
        });
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log("Socket connected:", newSocket.id);
            // Send full session object so server knows if this is a leader joining
            newSocket.emit('join_group', session);
        });

        newSocket.on('session_error', (msg: string) => {
            alert(msg);
            if (onLeave) onLeave();
        });

        newSocket.on('session_closed', (msg: string) => {
            alert(msg);
            if (onLeave) onLeave();
        });

        newSocket.on('location_updated', (data: RiderData) => {
            setPeers(prev => ({
                ...prev,
                [data.socketId]: { ...data, lastUpdate: Date.now() }
            }));
        });

        newSocket.on('destination_updated', (data: { lat: number, lng: number, name: string }) => {
            setDestination(data);
        });

        newSocket.on('navigation_started', (status: boolean) => {
            setIsNavigating(status);
        });

        return () => {
            newSocket.disconnect();
        };
    }, [session]);

    // Re-emit location when a new peer joins the group, so they see us immediately
    // even if our GPS hasn't moved.
    useEffect(() => {
        if (!socket || !myPosition) return;

        const handlePeerJoined = (socketId: string) => {
            setTimeout(() => {
                socket.emit('update_location', {
                    groupId: session.groupCode,
                    userId: session.name,
                    name: session.name,
                    lat: myPosition.lat,
                    lng: myPosition.lng,
                    isLeader: session.isLeader
                });
            }, 500);
        };

        socket.on('peer_joined', handlePeerJoined);
        return () => {
            socket.off('peer_joined', handlePeerJoined);
        };
    }, [socket, myPosition, session]);

    useEffect(() => {
        const handleOrientation = (event: any) => {
            let h = 0;
            if (event.webkitCompassHeading) {
                // iOS fallback
                h = event.webkitCompassHeading;
            } else if (event.alpha !== null) {
                // Android/Standard absolute alpha
                // Device orientation alpha is typical 0=North, increasing CCW
                h = 360 - event.alpha;
            }
            setHeading(h);
        };

        if (typeof window !== 'undefined' && window.DeviceOrientationEvent) {
            // Some devices need absolute listener
            window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener);
            // General fallback
            window.addEventListener('deviceorientation', handleOrientation as EventListener);
        }

        return () => {
            window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener);
            window.removeEventListener('deviceorientation', handleOrientation as EventListener);
        };
    }, []);

    useEffect(() => {
        if (!navigator.geolocation) {
            console.error("Geolocation is not supported by your browser");
            return;
        }

        geoWatchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                const currentPos = { lat: latitude, lng: longitude };
                setMyPosition(currentPos);

                if (socket && socket.connected) {
                    socket.emit('update_location', {
                        groupId: session.groupCode,
                        userId: session.name, // Using name as identifier for simplicity here
                        name: session.name,
                        lat: latitude,
                        lng: longitude,
                        isLeader: session.isLeader
                    });
                }
            },
            (error) => {
                console.error("Error watching location:", error.message, error.code);
                if (error.code === error.PERMISSION_DENIED && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
                    alert("Geolocation is blocked! On mobile devices, Chrome requires a secure HTTPS connection or 'localhost' to access GPS. You are accessing via HTTP on a local IP.");
                }
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 5000
            }
        );

        return () => {
            if (geoWatchId.current !== null) {
                navigator.geolocation.clearWatch(geoWatchId.current);
            }
        };
    }, [socket, session]);

    // Clean up stale peers (not updated in last 30 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            const now = Date.now();
            setPeers(prev => {
                const next = { ...prev };
                let changed = false;
                Object.keys(next).forEach(socketId => {
                    if (now - next[socketId].lastUpdate > 30000) {
                        delete next[socketId];
                        changed = true;
                    }
                });
                return changed ? next : prev;
            });
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    // Sync peers state to parent TrackingView outside of render cycles
    useEffect(() => {
        if (onPeersUpdate) {
            onPeersUpdate(peers);
        }
    }, [peers, onPeersUpdate]);

    // Fetch optimal route from Leader to Destination using OSRM
    useEffect(() => {
        if (!destination) {
            setRoute([]);
            return;
        }

        // Find leader position
        let leaderPos: Position | null = null;
        if (session.isLeader && myPosition) {
            leaderPos = myPosition;
        } else {
            const peerLeader = Object.values(peers).find(p => p.isLeader);
            if (peerLeader) {
                leaderPos = { lat: peerLeader.lat, lng: peerLeader.lng };
            }
        }

        if (!leaderPos) return;

        // OSRM coordinates are formatted as {longitude},{latitude}
        const fetchRoute = async () => {
            try {
                const url = `https://router.project-osrm.org/route/v1/driving/${leaderPos.lng},${leaderPos.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
                const res = await fetch(url);
                const data = await res.json();

                if (data.routes && data.routes.length > 0) {
                    const coords = data.routes[0].geometry.coordinates;
                    // GeoJSON is [lng, lat], Leaflet Polyline expects [lat, lng]
                    const latLngs = coords.map((c: number[]) => [c[1], c[0]]);
                    setRoute(latLngs);
                }
            } catch (err) {
                console.error("OSRM route fetch failed", err);
            }
        };

        // Fetch initially and set an interval if we want dynamic routing,
        // but to avoid API spam, fetch once when destination or leader pos changes significantly.
        // For simplicity, fetch immediately.
        fetchRoute();

    }, [destination, myPosition, peers, session.isLeader]);

    const handleSelectDestination = (dest: { lat: number, lng: number, name: string }) => {
        setDestination(dest);
        if (socket && socket.connected) {
            socket.emit('set_destination', { groupId: session.groupCode, ...dest });
        }
    };

    const handleStartNavigation = () => {
        setIsNavigating(true);
        setAutoPan(true);
        if (socket && socket.connected) {
            socket.emit('start_navigation', session.groupCode);
        }
    };

    // Simple hash to generate a hex color from a string
    const getColorFromName = (name: string) => {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        let color = '#';
        for (let i = 0; i < 3; i++) {
            const value = (hash >> (i * 8)) & 0xFF;
            color += ('00' + value.toString(16)).substr(-2);
        }
        return color;
    };

    const createCustomIcon = (isLeader: boolean, name: string, userHeading?: number) => {
        const colorStyle = !isLeader ? `--marker-color: ${getColorFromName(name)};` : '';
        const headingStyle = userHeading !== undefined ? `--heading: ${userHeading}deg;` : '--heading: 0deg;';
        return L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="arrow-marker ${isLeader ? 'leader-marker' : ''}" style="${colorStyle} ${headingStyle}"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
    };

    const getCardinalDirection = (deg: number) => {
        const val = Math.floor((deg / 22.5) + 0.5);
        const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
        return arr[(val % 16)];
    };

    if (!myPosition) {
        return (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-secondary)', color: 'var(--accent-blue)', flexDirection: 'column', gap: '16px' }}>
                <div className="pulsating-marker" style={{ position: 'relative', width: '48px', height: '48px' }}></div>
                <p style={{ fontWeight: 600 }}>Locating you...</p>
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            {session.isLeader && !isNavigating && (
                <DestinationSearch onSelectDestination={handleSelectDestination} />
            )}

            {session.isLeader && destination && !isNavigating && (
                <div className="top-overlay" style={{ display: 'flex', justifyContent: 'center', pointerEvents: 'none', top: '70px' }}>
                    <button onClick={handleStartNavigation} className="btn-primary" style={{ pointerEvents: 'auto', width: '250px', boxShadow: '0 4px 20px var(--success-green)' }}>
                        <span style={{ fontSize: '1.1rem' }}>▶ Start Navigation</span>
                    </button>
                </div>
            )}

            {!session.isLeader && destination && !isNavigating && (
                <div className="top-overlay" style={{ display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div className="glass-panel" style={{ display: 'flex', padding: '6px', borderRadius: '30px', pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.95)' }}>
                        <p style={{ color: 'var(--text-secondary)', fontWeight: 600, padding: '4px 16px', margin: 0, fontSize: '0.9rem' }}>
                            Waiting for Leader to start...
                        </p>
                    </div>
                </div>
            )}

            {isNavigating && !autoPan && (
                <div className="top-overlay" style={{ display: 'flex', justifyContent: 'center', pointerEvents: 'none', top: '70px' }}>
                    <button onClick={() => setAutoPan(true)} className="btn-primary" style={{ pointerEvents: 'auto', background: 'var(--bg-panel)', color: 'var(--accent-blue)', border: '1px solid var(--accent-blue)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                        <span style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🎯 Recenter
                        </span>
                    </button>
                </div>
            )}

            <MapContainer
                center={[myPosition.lat, myPosition.lng]}
                zoom={16}
                style={{ width: '100%', height: '100%' }}
                zoomControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />

                <MapEventTracker onDrag={() => {
                    if (isNavigating) setAutoPan(false);
                }} />

                <NavigationCamera myPosition={myPosition} isNavigating={isNavigating} autoPan={autoPan} />

                {/* Destination & Route */}
                {destination && (
                    <Marker position={[destination.lat, destination.lng]} zIndexOffset={500}>
                        <Tooltip direction="top" offset={[0, -20]} opacity={1} permanent>
                            <span style={{ fontWeight: 800, color: 'var(--accent-blue)' }}>🏁 {destination.name}</span>
                        </Tooltip>
                    </Marker>
                )}
                {route.length > 0 && (
                    <Polyline positions={route} color="var(--accent-blue)" weight={5} opacity={0.6} />
                )}

                {/* My Marker */}
                <Marker position={[myPosition.lat, myPosition.lng]} icon={createCustomIcon(session.isLeader, session.name, heading)} zIndexOffset={1000}>
                    <Tooltip direction="bottom" offset={[0, 12]} opacity={0.9} permanent>
                        <span style={{ fontWeight: 'bold', color: 'var(--bg-primary)' }}>{session.name} (You) {session.isLeader ? '👑' : ''} ({getCardinalDirection(heading)})</span>
                    </Tooltip>
                    <Popup>
                        <div style={{ color: '#000', fontWeight: 'bold' }}>{session.name} (You) {session.isLeader ? '👑' : ''}</div>
                    </Popup>
                </Marker>

                {/* Peer Markers */}
                {Object.values(peers).map((peer) => (
                    <Marker key={peer.socketId} position={[peer.lat, peer.lng]} icon={createCustomIcon(peer.isLeader, peer.name)}>
                        <Tooltip direction="bottom" offset={[0, 12]} opacity={0.9} permanent>
                            <span style={{ fontWeight: 'bold', color: 'var(--bg-primary)' }}>{peer.name} {peer.isLeader ? '👑' : ''}</span>
                        </Tooltip>
                        <Popup>
                            <div style={{ color: '#000', fontWeight: 'bold' }}>{peer.name} {peer.isLeader ? '👑' : ''}</div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
}
