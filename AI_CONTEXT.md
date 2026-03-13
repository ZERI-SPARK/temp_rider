# Rider Tracker - AI Agent Context Document

## 🏁 Overview
**Rider Tracker** is a real-time GPS tracking web application built for groups of motorcycle riders and car travelers. The core objective is to allow a "Leader" to create a temporary session which "Riders" can join using a 5-letter group code. The platform synchronizes the live GPS coordinates of all members in the group onto a shared dark-themed map layer.

## 🛠 Tech Stack
- **Frontend Framework**: Next.js (App Router) with React 18
- **Map Engine**: `react-leaflet` with Leaflet.js
- **Routing API**: OSRM (Open Source Routing Machine)
- **Geocoding API**: Nominatim API (OpenStreetMap)
- **Real-Time Communication**: Socket.IO
- **Backend / WebSockets**: Custom Node.js HTTP Server (`server.js`) running Next.js under the hood.
- **Styling**: Vanilla CSS (`globals.css`) emphasizing dark mode, glassmorphism, and neon accents.

## 🔑 Core Features & Behaviors
1. **Role-Based Sessions**: Users start at `JoinModal.tsx` and pick "Create" (Leader) or "Join" (Rider).
2. **Real-Time Tracking**: Uses `navigator.geolocation.watchPosition` to broadcast live GPS coordinates via WebSockets.
3. **Session Persistence**: App state (`name`, `groupCode`, `isLeader`) is safely written to `localStorage`. If a user refreshes the page, they seamlessly auto-rejoin the socket room.
4. **Session Lifecycle Restrictions**: The backend server explicitly monitors leader socket disconnects. When a Leader disconnects, the room is destroyed and all riders are kicked to the home screen. Joining a non-existent or expired code throws a `session_error`.
5. **Navigation & Map Camera**: 
   - **Free Mode**: Users can manually pan and zoom without the camera fighting them. 
   - **Nav Mode**: Leaders can search a destination and click "Start Navigation", which triggers a Google Maps-style locked camera (`zoom=18`) for all users, tracking their position perfectly.
   - **Recenter Tool**: If navigation is active but a user manually drags the map, the camera unlocks, and a floating "🎯 Recenter" button appears.
6. **Device Compass**: The app actively pulls from the `deviceorientation` API. It passes the hardware heading degrees to a CSS variable (`--heading`) that dynamically rotates the individual's arrowhead marker to point North, South, East, etc.

## 📁 Critical File Architecture
- `server.js` 
  - The lifeblood of the application. It boots the Next.js app but hijacks the HTTP module to attach an active Socket.IO server. 
  - Maintains `activeGroups`, `groupDestinations`, and `groupNavigationState` in Node memory.
  - **Note**: The `package.json` explicitly runs `node server.js` instead of `next start`.

- `src/components/MapComponent.tsx`
  - The heavy lifter for the UI. Manages the `Leaflet` context.
  - Controls Socket.IO connections, manages the fallback mechanism (`transports: ['websocket', 'polling']`), maps all `peers` array to map markers, and runs the OSRM fetching logic.
  - Sub-components include: `NavigationCamera` (tracks GPS) and `MapEventTracker` (detects manual drags).

- `src/app/page.tsx`
  - The entry point. Handles the mount effect that reads the `localStorage` and determines whether to show `JoinModal` or the `TrackingView`.

## 🔋 Deployment Environment Caveats
- **Hosting Platform**: App is currently deployed to **Render**.
- **WebSockets on Render**: Because of Render's proxy architecture, raw WebSockets drop often. The Socket.IO client in `MapComponent.tsx` forces `secure: true` and defines explicit fallbacks.
- **Android Porting**: The App is loosely configured for Capacitor (`output: export` in `next.config.ts`), but full native conversion was deprioritized in favor of a robust Mobile PWA experience.

## 🚨 Guidelines for AI Agents editing this repo:
- **Do not** add aggressive auto-zooming rules like `map.fitBounds` dynamically to `MapComponent`. The user specifically requested a Google-Maps style camera that holds the user directly in the center while moving, or allows manual panning without snapping back constantly.
- **Do not** modify the `start` script away from `node server.js`. Vercel/Serverless hosts will inherently break the Socket.IO setup. Focus backend fixes purely on `server.js`.
- Respect the custom device orientation implementation (`--heading`), which applies CSS transformations directly to the `custom-div-icon` class.
