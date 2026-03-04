'use client';

import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Tooltip, Polyline } from 'react-leaflet';
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
}

// Map center tracking component
function RecenterAutomatically({ positions }: { positions: Position[] }) {
    const map = useMap();
    useEffect(() => {
        if (positions.length > 0) {
            if (positions.length === 1) {
                map.setView([positions[0].lat, positions[0].lng], 16, { animate: true });
            } else {
                const bounds = L.latLngBounds(positions.map(p => [p.lat, p.lng]));
                map.fitBounds(bounds, { padding: [50, 50], animate: true, maxZoom: 18 });
            }
        }
    }, [positions, map]);
    return null;
}

export default function MapComponent({ session, onPeersUpdate }: MapComponentProps) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [myPosition, setMyPosition] = useState<Position | null>(null);
    const [peers, setPeers] = useState<Record<string, RiderData>>({});

    // Routing state
    const [destination, setDestination] = useState<{ lat: number, lng: number, name: string } | null>(null);
    const [route, setRoute] = useState<[number, number][]>([]);

    // View state for Riders
    const [viewMode, setViewMode] = useState<'all' | 'leader' | 'destination'>('all');

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
            newSocket.emit('join_group', session.groupCode);
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

        return () => {
            newSocket.disconnect();
        };
    }, [session.groupCode]);

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

    const createCustomIcon = (isLeader: boolean, name: string) => {
        const colorStyle = !isLeader ? `style="--marker-color: ${getColorFromName(name)};"` : '';
        return L.divIcon({
            className: 'custom-div-icon',
            html: `<div class="arrow-marker ${isLeader ? 'leader-marker' : ''}" ${colorStyle}></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
    };

    const getPositionsToTrack = () => {
        const myLoc = myPosition ? [{ lat: myPosition.lat, lng: myPosition.lng }] : [];
        if (viewMode === 'all') {
            return [...myLoc, ...Object.values(peers), ...(destination ? [{ lat: destination.lat, lng: destination.lng }] : [])];
        } else if (viewMode === 'leader') {
            if (session.isLeader) return myLoc;
            const leader = Object.values(peers).find(p => p.isLeader);
            // Must return both My Location AND Leader Location so fitBounds has a box to trace
            return leader ? [...myLoc, { lat: leader.lat, lng: leader.lng }] : myLoc;
        } else if (viewMode === 'destination') {
            return destination ? [...myLoc, { lat: destination.lat, lng: destination.lng }] : myLoc;
        }
        return myLoc;
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
            {session.isLeader && (
                <DestinationSearch onSelectDestination={handleSelectDestination} />
            )}

            {!session.isLeader && destination && (
                <div className="top-overlay" style={{ display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div className="glass-panel" style={{ display: 'flex', padding: '6px', borderRadius: '30px', pointerEvents: 'auto', background: 'rgba(15, 23, 42, 0.95)' }}>
                        <button onClick={() => setViewMode('all')} style={{ padding: '8px 16px', borderRadius: '24px', fontSize: '0.85rem', fontWeight: 600, color: viewMode === 'all' ? '#fff' : 'var(--text-secondary)', background: viewMode === 'all' ? 'var(--accent-blue)' : 'transparent', transition: 'var(--transition-smooth)' }}>All</button>
                        <button onClick={() => setViewMode('leader')} style={{ padding: '8px 16px', borderRadius: '24px', fontSize: '0.85rem', fontWeight: 600, color: viewMode === 'leader' ? '#fff' : 'var(--text-secondary)', background: viewMode === 'leader' ? 'var(--accent-blue)' : 'transparent', transition: 'var(--transition-smooth)' }}>Leader</button>
                        <button onClick={() => setViewMode('destination')} style={{ padding: '8px 16px', borderRadius: '24px', fontSize: '0.85rem', fontWeight: 600, color: viewMode === 'destination' ? '#fff' : 'var(--text-secondary)', background: viewMode === 'destination' ? 'var(--accent-blue)' : 'transparent', transition: 'var(--transition-smooth)' }}>Dest</button>
                    </div>
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

                <RecenterAutomatically positions={getPositionsToTrack()} />

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
                <Marker position={[myPosition.lat, myPosition.lng]} icon={createCustomIcon(session.isLeader, session.name)} zIndexOffset={1000}>
                    <Tooltip direction="bottom" offset={[0, 12]} opacity={0.9} permanent>
                        <span style={{ fontWeight: 'bold', color: 'var(--bg-primary)' }}>{session.name} (You) {session.isLeader ? '👑' : ''}</span>
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
