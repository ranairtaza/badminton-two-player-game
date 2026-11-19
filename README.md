# 🏸 FeatherLine | 2-Player Online Badminton

A responsive, cross-platform 2-player browser badminton game called **FeatherLine**, built cleanly in **modular ES6** (`index.html`, `style.css`, and `src/main.js`, `src/physics.js`, `src/entities.js`, `src/input.js`, `src/network.js`, `src/audio.js`) designed for two players across **two separate devices** (phones, tablets, or laptops) and ready for zero-config static deployment on **Vercel**.

---

## 🌟 Key Features

### 🪶 1. Feather Arrow Off-Screen Indicator (`src/physics.js` & `src/entities.js`)
- Whenever the shuttlecock soars high above the visible 1280x720 canvas during high lobs or clears ($y < 45$), a dynamic **Feather Arrow indicator** smoothly tracks its horizontal position along the top viewport margin.
- Features a glowing pill badge, mini feathered shuttlecock icon, and downward pulsing chevron arrow pointing directly toward the court.
- **Dynamic Color & Velocity Shifting**:
  - **Crisp Cyan / Pure White**: High lofted defensive clears and lobs.
  - **Amber / Fiery Orange**: Explosive downward smashes and high-velocity spikes.
- **Smooth Altitude Scaling**: Scales subtly with height above the screen and fades out smoothly as the shuttlecock descends back into clear view.

### 🎯 2. Guided Serve System (`src/main.js` & `src/entities.js`)
- **Dotted Trajectory Arc Preview**: During the `SERVE` state, a physical prediction arc is drawn in real time, projecting the exact flight path and landing target across the net before the shuttle is struck.
- **Dynamic Aiming**: Moving Left or Right adjusts the server's court angle, allowing players to aim short serves near the T-line or deep serves pushing opponents to the backcourt.
- **Subtle Timing Ring**: An animated timing ring pulses around the shuttlecock, granting bonus pace and a sweet-spot audio pop on clean timing, while remaining forgiving so beginners never fail a serve on mistimed taps.
- **First-Serve Hint**: A clean on-court hint (*"Tap HIT to serve • Move to aim"*) guides players immediately.

### 🌐 3. Two-Device Realtime Multiplayer (`src/network.js`)
- **5-Character Room Codes & Invite Links**:
  - **Player 1 (Host)**: Clicks **Generate Room Code** to create an instant 5-character room (e.g. `K9XP2`) with a one-click **📋 Copy Invite Link** button (`https://your-game.vercel.app/?room=K9XP2`).
  - **Player 2 (Guest)**: Joins by entering the 5-character code or by opening the invite link directly.
- **Pluggable Realtime Transport Layer**:
  - **WebRTC DataChannel (PeerJS cloud broker)**: Ultra low-latency P2P data transmission between two separate devices over mobile data or Wi-Fi without needing a custom Node.js server.
  - **BroadcastChannel Fallback**: Instant local fallback for opening two tabs side-by-side in the same browser during development or offline play.
  - **Live Connection & Ping Indicator**: Top HUD pill displays real-time connection status and round-trip ping (🟢 `ROOM: K9XP2 (24ms)`).
- **Game Modes**:
  - ⚔️ **VS Match (First to 11, win by 2)**: Competitive head-to-head match with rally scoring, match point banners, and winner statistics.
  - 🤝 **Co-Op Rally Mode**: Cooperate as a duo to build the highest rally streak without dropping the shuttlecock. Triumphant audio fanfares and confetti trigger at streaks of 5, 10, 15, 20, 25, 30+.
  - 🤖 **Solo Practice (Offline)**: Practice offline against an adaptive AI bot.
- **Customization & Partner Ergonomics**:
  - Custom display names saved to `localStorage`.
  - **🛡️ Reach Assist Toggle**: Extends racket reach by +45% with forgiving hit timing so players with different skill levels can enjoy balanced rallies.
  - **🔄 Rematch**: Restarts the match across both devices with one tap.
  - **⇄ Swap Sides**: Instantly swaps court sides and settings between both devices without switching physical seats.

---

## 📱 Full-Screen Per-Device Controls (`src/input.js`)

Each player enjoys a full-screen view of the court on their own phone, tablet, or laptop.

### 💻 Laptop (Full Screen)
- **Move & Aim Serve**: <kbd>A</kbd> / <kbd>D</kbd> or <kbd>◀</kbd> / <kbd>▶</kbd>
- **Jump**: <kbd>W</kbd> or <kbd>▲</kbd>
- **Launch Serve / Drive / Jump Smash**: <kbd>S</kbd> or <kbd>▼</kbd> or <kbd>Space</kbd>
- **Defensive Lob**: <kbd>E</kbd> or <kbd>Shift</kbd> or <kbd>/</kbd>
- **Pause / Menu**: <kbd>Esc</kbd>

> **Jump Smash**: Strike while airborne above net height to trigger an explosive downward smash with an orange particle trail, 30ms hit-stop freeze frame, and gentle screen shake.

### 📱 Mobile / Tablet (Full Screen)
- **Landscape Guard**: Screen width/height check displays a clean *"Please rotate your device to landscape"* overlay if held vertically.
- **Left-Thumb**: Semi-transparent <kbd>◀</kbd> and <kbd>▶</kbd> movement and serve aiming buttons.
- **Right-Thumb**: Action buttons (<kbd>JUMP</kbd>, <kbd>HIT</kbd> for serve/smash, <kbd>LOB</kbd>).
- **Multi-Touch Engine**: Independent `touch.identifier` tracking allows players to hold movement while simultaneously jumping and smashing.

---

## ⚡ Physics, Juice & Web Audio

- **Realistic Aerodynamics (`src/physics.js`)**: Quadratic drag model ($F_d \propto v^2$) creates realistic badminton flight: fast launch speed followed by strong exponential drag deceleration near the apex and a steep drop. The shuttlecock dynamically rotates so its cork nose points along its velocity vector.
- **Net-Tape Collision**: Net cord clips roll forward; net mesh collisions cause realistic dampening rebounds.
- **IN / OUT Boundary Checking**: Full court boundary lines and service line detection.
- **Web Audio API Procedural Synthesizer (`src/audio.js`)**: Real-time sound effects (racket string pops, heavy smash booms, net clips, referee whistles, celebratory cheers, and streak milestone chimes) with a top HUD mute toggle.

---

## 📁 File Structure

```text
├── index.html         # Semantic HTML5 markup, lobby cards, HUD & PeerJS loader
├── style.css          # Responsive 16:9 canvas, glassmorphic UI & mobile touch deck
├── vercel.json        # Static deployment configuration with security & caching headers
├── README.md          # Project documentation & deployment guide
└── src/
    ├── main.js        # State machine, host authoritative simulation & client sync
    ├── network.js     # WebRTC DataChannel (PeerJS) & BroadcastChannel transport
    ├── physics.js     # Aerodynamic drag, Feather Arrow indicator, trajectory math
    ├── entities.js    # Player physics, guided serve preview arc, timing rings, court
    ├── input.js       # Full-screen laptop keyboard & mobile multi-touch engine
    └── audio.js       # Web Audio API procedural sound synthesizer
```

---

## 🚀 Publishing to Vercel (2 Minutes)

### Option 1: Drag & Drop (Fastest)
1. Go to [vercel.com/drop](https://vercel.com/drop).
2. Drag this project folder directly into the browser.
3. Your live `.vercel.app` URL will be generated immediately. Open it on two devices to play!

### Option 2: GitHub CI/CD (Recommended)
1. Initialize a git repository and push:
   ```bash
   git init
   git add .
   git commit -m "feat: FeatherLine online 2-player badminton game"
   git branch -M main
   git remote add origin https://github.com/<your-username>/featherline.git
   git push -u origin main
   ```
2. Log into [vercel.com](https://vercel.com), click **Add New → Project**, select your repository, leave the build command blank (Preset: **Other**), and click **Deploy**.

---

## 💻 Local Testing

Open with any local HTTP server:

```bash
# Node.js
npx serve .

# Python 3
python -m http.server 8000
```
Open two browser windows or tabs at `http://localhost:8000` to test two devices side by side.
