# WatchTogether - Private 2-Person P2P Watch Room

A lightweight, private 2-person watch-together web application. Watch movies, YouTube, or browser tabs together with direct WebRTC peer-to-peer screen sharing, synchronized cameras, high-fidelity microphones, and instant realtime chat.

## Features

- **Direct WebRTC P2P Screen Sharing**: Share any browser tab (with audio), application window, or full screen using `navigator.mediaDevices.getDisplayMedia()`.
- **Live Camera & Microphone**: Synchronized camera previews and unmuted remote audio playback.
- **Private 2-Person Rooms**: Unique room IDs with 1-click invite link copying. Third participants are automatically rejected.
- **Realtime Chat**: Instant peer-to-peer messaging with timestamps, auto-scroll, and connection status indicator.
- **Zero Server Storage & Zero Restreaming**: Media streams pass directly peer-to-peer via WebRTC. No video files or streams are stored or proxied on the server.
- **Configurable STUN/TURN**: Configured for local STUN with full support for production TURN servers via environment variables.

---

## Quick Start

### 1. Install Dependencies
```bash
npm run install:all
```
*(or run `npm install` in root, `client/`, and `server/`)*

### 2. Start Development Servers
```bash
npm run dev
```
This runs both:
- **Signaling Server**: `http://localhost:3001` (WebSocket: `ws://localhost:3001`)
- **Vite Web Client**: `http://localhost:5173`

---

## Environment Variables

Copy `.env.example` to `.env` or set in your environment:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Signaling server port | `3001` |
| `VITE_SIGNALING_SERVER_URL` | Signaling WebSocket URL | `ws://localhost:3001` |
| `VITE_STUN_SERVER` | Public STUN server(s) | `stun:stun.l.google.com:19302` |
| `VITE_TURN_SERVER` | Optional TURN server URL | *(empty)* |
| `VITE_TURN_USERNAME` | Optional TURN username | *(empty)* |
| `VITE_TURN_CREDENTIAL` | Optional TURN password/credential | *(empty)* |

---

## Testing & Verification

Run the automated signaling and room isolation test suite:
```bash
npm run dev --prefix server
npx tsx server/test-signaling.ts
npx tsx server/test-advanced-scenarios.ts
```
