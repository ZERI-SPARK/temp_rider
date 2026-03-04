const { io } = require('socket.io-client');

async function runTest() {
    console.log('Starting local Socket.io broadcast test...');

    const serverUrl = 'http://localhost:3000';
    const groupCode = 'TEST12';

    // Client 1 (Leader)
    const client1 = io(serverUrl);
    // Client 2 (Member)
    const client2 = io(serverUrl);

    let client2ReceivedLocation = false;

    client1.on('connect', () => {
        console.log('[Client 1] Connected with ID:', client1.id);
        client1.emit('join_group', groupCode);
        console.log('[Client 1] Joined group:', groupCode);
    });

    client2.on('connect', () => {
        console.log('[Client 2] Connected with ID:', client2.id);
        client2.emit('join_group', groupCode);
        console.log('[Client 2] Joined group:', groupCode);

        // After joining, client 1 broadcasts a location
        setTimeout(() => {
            console.log('[Client 1] Broadcasting location update...');
            client1.emit('update_location', {
                groupId: groupCode,
                userId: 'LeaderClient',
                name: 'LeaderClient',
                lat: 40.7128,
                lng: -74.0060,
                isLeader: true
            });
        }, 1000);
    });

    client2.on('location_updated', (data) => {
        console.log('[Client 2] Received location update from peer:', data);
        if (data.name === 'LeaderClient' && data.lat === 40.7128) {
            client2ReceivedLocation = true;
            console.log('✅ TEST PASSED: Client 2 successfully received expected location data from Client 1.');

            // Cleanup
            client1.disconnect();
            client2.disconnect();
            process.exit(0);
        } else {
            console.error('❌ TEST FAILED: Received incorrect data format.');
            process.exit(1);
        }
    });

    // Timeout failure
    setTimeout(() => {
        if (!client2ReceivedLocation) {
            console.error('❌ TEST FAILED: Client 2 did not receive location update within timeout.');
            client1.disconnect();
            client2.disconnect();
            process.exit(1);
        }
    }, 5000);
}

runTest();
