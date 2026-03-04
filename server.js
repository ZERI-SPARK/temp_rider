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
    socket.on('join_group', (groupId) => {
      socket.join(groupId);
      console.log(`Socket ${socket.id} joined group ${groupId}`);

      // Alert existing members that a new peer joined, so they resync location
      socket.to(groupId).emit('peer_joined', socket.id);

      // If the group already has an active destination, sync it to the new joiner immediately
      if (groupDestinations[groupId]) {
        socket.emit('destination_updated', groupDestinations[groupId]);
      }
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

    socket.on('disconnect', () => {
      console.log('Client disconnected', socket.id);
      connectedSockets.delete(socket.id);
      // Note: We don't automatically delete groupDestinations on disconnect
      // because other users might still be in the group. We could clean them up
      // if the group becomes truly empty.
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
