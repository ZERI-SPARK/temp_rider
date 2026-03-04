import { useState } from 'react';
import { Search, MapPin } from 'lucide-react';

interface DestinationSearchProps {
    onSelectDestination: (dest: { lat: number; lng: number; name: string }) => void;
}

export default function DestinationSearch({ onSelectDestination }: DestinationSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setIsSearching(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
            const data = await res.json();
            setResults(data);
        } catch (error) {
            console.error("Error fetching destination:", error);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelect = (place: any) => {
        onSelectDestination({
            lat: parseFloat(place.lat),
            lng: parseFloat(place.lon),
            name: place.display_name
        });
        setQuery('');
        setResults([]);
    };

    return (
        <div className="top-overlay" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <form onSubmit={handleSearch} className="glass-panel" style={{ padding: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search destination..."
                    className="input-elegant"
                    style={{ flexGrow: 1, padding: '10px 14px' }}
                />
                <button type="submit" disabled={isSearching} className="btn-primary" style={{ padding: '10px' }}>
                    <Search size={20} />
                </button>
            </form>

            {results.length > 0 && (
                <div className="glass-panel" style={{ padding: '8px', maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {results.map((place: any) => (
                        <div
                            key={place.place_id}
                            onClick={() => handleSelect(place)}
                            style={{
                                padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                                background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'flex-start', gap: '8px',
                                transition: 'var(--transition-smooth)'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        >
                            <MapPin size={16} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.4, margin: 0 }}>
                                {place.display_name}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
