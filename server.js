const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = dev ? 'localhost' : '0.0.0.0';
const port = process.env.PORT || 3000;
// Store standard active connections
const connectedSockets = new Set();
// Store destination per group: { lat, lng, name }
const groupDestinations = {};
// Store navigation state per group: boolean
const groupNavigationState = {};
// Track active groups and their members/leaders to manage session lifecycle
const activeGroups = {};
const app = next({ dev, hostname, port: Number(port) });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    connectedSockets.add(socket.id);

    // Handle joining a group
    socket.on('join_group', (payload) => {
      // payload can be string (legacy) or object { groupId, isLeader, name }
      const groupId = typeof payload === 'string' ? payload : payload.groupId;
      const isLeader = typeof payload === 'object' ? payload.isLeader : false;

      // Validate session existence for non-leaders
      if (!isLeader && !activeGroups[groupId]) {
        socket.emit('session_error', 'Session expired or closed by the leader.');
        return;
      }

      // Initialize group if leader creates it
      if (isLeader) {
        activeGroups[groupId] = { leaderId: socket.id, members: new Set([socket.id]) };
      } else if (activeGroups[groupId]) {
        activeGroups[groupId].members.add(socket.id);
      }

      socket.join(groupId);
      console.log(`Socket ${socket.id} joined group ${groupId}. Role: ${isLeader ? 'Leader' : 'Rider'}`);

      // Alert existing members that a new peer joined, so they resync location
      socket.to(groupId).emit('peer_joined', socket.id);

      // If the group has an active destination/navigation, sync it
      if (groupDestinations[groupId]) socket.emit('destination_updated', groupDestinations[groupId]);
      if (groupNavigationState[groupId]) socket.emit('navigation_started', true);
    });

    // Handle location streaming
    socket.on('update_location', (data) => {
      // data: { groupId, userId, name, lat, lng, isLeader }
      const { groupId } = data;
      // Broadcast to everyone else in the group
      socket.to(groupId).emit('location_updated', {
        socketId: socket.id,
        ...data
      });
    });

    // Handle setting a destination
    socket.on('set_destination', (data) => {
      // data: { groupId, lat, lng, name }
      const { groupId } = data;
      groupDestinations[groupId] = data;
      // Broadcast to everyone in the group, including the sender if desired,
      // but typically we broadcast to '.to(groupId)' because sender sets it locally.
      // However, sending to everyone is fine too. We'll use io.to to update all just in case.
      io.to(groupId).emit('destination_updated', data);
    });

    // Handle start navigation trigger
    socket.on('start_navigation', (groupId) => {
      groupNavigationState[groupId] = true;
      io.to(groupId).emit('navigation_started', true);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected', socket.id);
      connectedSockets.delete(socket.id);

      // Find which group this socket belonged to and handle session teardown
      for (const [groupId, groupData] of Object.entries(activeGroups)) {
        if (groupData.members.has(socket.id)) {
          groupData.members.delete(socket.id);

          if (groupData.leaderId === socket.id) {
            // Leader disconnected -> Destroy the entire session
            console.log(`Leader left. Destroying session ${groupId}`);
            socket.to(groupId).emit('session_closed', 'The leader has ended the session.');
            io.socketsLeave(groupId); // Force everyone out of the socket.io room
            delete activeGroups[groupId];
            delete groupDestinations[groupId];
            delete groupNavigationState[groupId];
          } else if (groupData.members.size === 0) {
            // Group is completely empty -> Cleanup
            console.log(`Session ${groupId} is empty. Cleaning up.`);
            delete activeGroups[groupId];
            delete groupDestinations[groupId];
            delete groupNavigationState[groupId];
          }
        }
      }
    });
  });

  server
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
