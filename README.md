# 🤖 BATTLEBOTx — AI FARM Combat Simulator

A high-fidelity 3D robot combat simulator built with Three.js and the Web Audio API. Features authentic physics-based kinetic weapons, real-time procedural audio synthesis, modular armor tearing, flame & smoke damage effects, and intelligent opponent AI.

---

## 🌟 Features

### 1. Selectable Combat Robots (1 to 5)
- **Robot 1 — Kinetic Blade Spinner**: High-RPM front 4-blade anodized kinetic spinner with real axle rotation and dynamic overdrive lunge.
- **Robot 2 — Heavy Steel Drum Crusher**: Low-center dual-motor crusher chassis with rotating ribbed front drum.
- **Robot 3 — Low-Profile Wedge Lifter**: Slanted stealth wedge with pneumatic lifting spatula engineered to get underneath opponents.
- **Robot 4 — Dual-Disc Kinetic Saw**: High-speed twin vertical saw discs for severe armor puncture and spark showers.
- **Robot 5 — Monocoque Heavy Rammer**: High-mass welded armor plates built for devastating ramming power.

### 2. Multi-Layer Real-Time Audio Synthesis (Web Audio API)
- **Procedural Weapon Whine**: Dynamic RPM pitch-scaling that spools up smoothly as blades accelerate.
- **Kinetic Wind Rush**: Continuous white-noise aerodynamic rush reflecting weapon rotation speed.
- **Multi-Layer Resonant Metal Clashing**:
  - *Dual Anvil Clang*: Inharmonic metallic resonance (640 Hz / 920 Hz & 1560 Hz / 2180 Hz) with randomized frequency jitter so every collision rings distinctly.
  - *Chassis Shudder*: Low-frequency resonant body ring (210 Hz → 75 Hz) simulating hollow welded steel plate reverberation.
  - *Steel Gouge / Scraping Friction*: Bandpass-filtered abrasive noise simulating high-pressure metal scraping.
  - *Sub-Bass Shockwave*: Heavy 92 Hz → 24 Hz low-end impact punch.
- **Spark Crackle, Detachment Clatter, & Flip Alarm**: Audio cues for armor loss, wheel detachment, and count-outs.

### 3. Dynamic Visual & Particle Effects
- **80% Damage Heavy Flame & Smoke System**: When a robot's health drops to 20% or lower, internal battery/motor rupture sparks erupt with animated fire flames (layered yellow, orange, and red billows) and rising dark soot smoke clouds.
- **Modular Armor & Wheel Detachment**: Severe weapon impacts tear steel armor plates and wheels off the chassis, bouncing across the arena floor.
- **Sparks & Screen Vignette**: Directional spark showers erupt along contact normals on high-velocity strikes.

### 4. Fair-Play Opponent AI
- **Smart Sportsmanship**: When an opponent is flipped, disabled, or undergoing a 10-count knockout, the AI respects the rules by backing off to neutral corner distance and circling instead of repeatedly pummeling an incapacitated robot.
- **Dynamic Tactics**: Angles around wedge defenses, maneuvers to flank exposed rear armor, and activates weapon overdrive on closing dashes.

### 5. Desktop-Optimized Side UI & Camera
- **Side Panel Controls**: Camera and match info are cleanly placed on the side to give an unobstructed view of the combat arena.
- **Multi-Angle Camera**: Dynamic chase cam with mouse-wheel elevation zoom, plus overhead and arena spectator modes (`C` key).

---

## 🎮 Controls

| Action | Player 1 (Keyboard) | Player 2 (Local 1v1) | On-Screen UI |
|---|---|---|---|
| **Drive Forward / Reverse** | `W` / `S` | `↑` / `↓` | Left Slider |
| **Steer Left / Right** | `A` / `D` | `←` / `→` | Right Slider |
| **Attack / Weapon Overdrive** | `Space` | `Enter` | Overdrive Button |
| **Self-Right (When Flipped)** | `Space` (Mash repeatedly) | `Enter` (Mash repeatedly) | Flip Banner |
| **Camera Modes** | `C` | — | Camera Button |
| **Camera Zoom / Height** | Mouse Scroll Wheel | — | Elevation `+` / `-` |
| **Pause Game** | `Escape` / `P` | — | Pause Button |

---

## 🌐 Deploy to GitHub & Play Online

Because BATTLEBOTx is built with pure client-side HTML5, Three.js, and the Web Audio API, it can be hosted and played directly in any web browser via **GitHub Pages** with zero backend servers required!

### Step 1: Create a GitHub Repository
1. Log into your GitHub account and click **New Repository**.
2. Name the repository (for example: `battlebotx` or `battlebotx-game`).
3. Set the repository to **Public** and leave "Add a README" unchecked.
4. Click **Create repository**.

### Step 2: Push the Game Code
Open PowerShell in this folder (`C:\Users\Forsaken\Documents\BATTLEBOTx Game`) and run:
```bash
git init
git add .
git commit -m "feat: BATTLEBOTx combat simulator with real-time audio and metal clashing"
git branch -M main
git remote add origin https://github.com/<YOUR-USERNAME>/<YOUR-REPO-NAME>.git
git push -u origin main
```
*(Replace `<YOUR-USERNAME>` and `<YOUR-REPO-NAME>` with your GitHub account and repo name).*

### Step 3: Enable GitHub Pages
1. Go to your repository page on GitHub.
2. Click **Settings** (top tabs) → **Pages** (left navigation menu).
3. Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
4. Set Branch to **`main`** and folder to **`/(root)`**, then click **Save**.
5. Within 1–2 minutes, GitHub will generate your live playable URL:
   ```
   https://<YOUR-USERNAME>.github.io/<YOUR-REPO-NAME>/
   ```
Anyone can now visit that link on Chrome, Edge, Firefox, or Safari and play immediately with full graphics, physics, and sound effects!

---

## 💻 Local Play

### Method 1: Local Server (Recommended)
Open PowerShell in this folder and run:
```bash
python server.py
```
This launches a local web server at `http://localhost:8080/index.html` and opens your browser.

### Method 2: Direct Offline Launch
Double-click `index.html` or `battlebotx-desktop.html` in your file explorer. All 5 robot 3D models are embedded with offline base64 fallbacks for instant play without any setup.
