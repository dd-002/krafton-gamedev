# Multiplayer Arena - Realtime Node.js Game Engine

**Author:** Dipayan Das (DD)  
**Tech Stack:** Node.js (Pure), WebSockets, Redis, HTML5 Canvas

---

## 📖 Project Overview

This project is a high-performance, authoritative multiplayer game engine developed as a technical demonstration for **Krafton**. It is built entirely from scratch using **Pure Node.js**  to maximize performance and control over the networking layer.

The engine demonstrates advanced "Netcode" concepts used in professional multiplayer games, ensuring smooth gameplay even under varying network conditions. It features a custom **Client-Side Prediction** architecture with **Server Reconciliation**, decoupled via a dual-port setup.

---

## 🚀 Key Features & Technical Architecture

### 1. Networking Strategy (Dual-Port)
To ensure separation of concerns, the application runs two distinct servers simultaneously:
* **Frontend (HTTP - Port 8082):** A custom-written Node.js HTTP server that manages static assets (`.html`, `.js`, `.css`) and routing. It implements secure file serving without external dependencies like Nginx or Express.
* **Game Loop (WebSocket - Port 8080):** A dedicated, binary-optimized WebSocket server that handles game state, input processing, and broadcasting.

### 2. Client-Side Prediction (CSP) & Reconciliation
This is the core of the engine's responsiveness:
* **Prediction:** When a player presses a key, the client moves the entity *immediately* based on shared physics logic ($0.15px/ms$). It does not wait for the server.
* **Trust Zone Reconciliation:**
    * The client continuously compares its local position with the server's authoritative state.
    * **The "Trust Zone":** If the difference is $< 40px$, the client ignores the server update, preventing "rubber-banding" or jitter caused by natural latency.
    * **Hard Snap:** If the difference exceeds $> 100px$ (e.g., packet loss or collisions), the client forcibly snaps to the server's position.

### 3. Server-Side Timesteps
* The server runs a fixed physics loop at **30 Ticks Per Second**.
* Every `GAME_STATE` packet includes a `serverTick` (Frame Count) and a `timestamp`.
* The client uses these ticks to discard out-of-order packets, ensuring strictly linear state updates.

### 4. Modes & Debugging
The engine includes a launcher (`index.html`) that allows seamless switching between two distinct client engines:
* **Physics Client:** The standard game mode with prediction, interpolation, and smoothing enabled.
* **Debug Client:** A "dumb" terminal that renders *exactly* what the server sees. It has no physics logic and is used to visualize network delay and server-side recoil.

### 5. Data Persistence
* **Redis** is used to store active room states, player lists, and session metadata, enabling potential horizontal scaling.

---

## ⚙️ Configuration & Environment

Redis is required, it was used for simplicity just for saving game stats, and testing it can be however replaced by any database

The project is controlled via a `.env` file in the root directory.

**Configuration:**
```env
# Networking Ports
WS_PORT=8080         # The WebSocket Game Server (Logic)
HTTP_PORT=8081       # The Web Server (Frontend Assets)

# Simulation Settings
LAG_MS=200           # Simulated Server-Side Processing Delay
ENABLE_LAG=true           # to toggle lag


## ⚙️ Running the engine
npm i
npm run dev
