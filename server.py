"""
BATTLEBOTx — AI FARM Combat Robotics
Local Development & Play HTTP Server
------------------------------------
- Serves 3D Autodesk Fusion CAD models, textures, audio, scripts & HTML locally.
- Integrated Native Windows XInput / DirectInput Controller Bridge (/__gamepads).
- Auto-opens default web browser to the game.
- Dynamic port allocation (tries 8080, falls back to 8081..8090 if port is busy).
- Disables caching on HTML/JS/CSS files for instant local refresh.
"""

import os
import sys
import json
import socket
import ctypes
import urllib.parse
import webbrowser
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8080

# ========================================================
# NATIVE WINDOWS XINPUT & DIRECTINPUT GAMEPAD BRIDGE
# ========================================================
xinput = None
if sys.platform == "win32":
    for dll_name in ("xinput1_4", "xinput1_3", "xinput9_1_0"):
        try:
            xinput = getattr(ctypes.windll, dll_name)
            break
        except Exception:
            pass

winmm = None
if sys.platform == "win32":
    try:
        winmm = ctypes.windll.winmm
    except Exception:
        pass

if sys.platform == "win32":
    from ctypes import wintypes

    class XINPUT_GAMEPAD(ctypes.Structure):
        _fields_ = [
            ("wButtons", wintypes.WORD),
            ("bLeftTrigger", wintypes.BYTE),
            ("bRightTrigger", wintypes.BYTE),
            ("sThumbLX", wintypes.SHORT),
            ("sThumbLY", wintypes.SHORT),
            ("sThumbRX", wintypes.SHORT),
            ("sThumbRY", wintypes.SHORT),
        ]

    class XINPUT_STATE(ctypes.Structure):
        _fields_ = [
            ("dwPacketNumber", wintypes.DWORD),
            ("Gamepad", XINPUT_GAMEPAD),
        ]

    class JOYINFOEX(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("dwFlags", wintypes.DWORD),
            ("dwXpos", wintypes.DWORD),
            ("dwYpos", wintypes.DWORD),
            ("dwZpos", wintypes.DWORD),
            ("dwRpos", wintypes.DWORD),
            ("dwUpos", wintypes.DWORD),
            ("dwVpos", wintypes.DWORD),
            ("dwButtons", wintypes.DWORD),
            ("dwButtonNumber", wintypes.DWORD),
            ("dwPOV", wintypes.DWORD),
            ("dwReserved1", wintypes.DWORD),
            ("dwReserved2", wintypes.DWORD),
        ]

def read_windows_gamepads():
    """Reads all connected physical Xbox and USB gamepads on Windows."""
    pads = []
    if sys.platform != "win32":
        return pads

    # 1. Poll XInput controllers (Xbox One, Series X, 360, compatible wireless)
    if xinput is not None:
        for slot in range(4):
            st = XINPUT_STATE()
            if xinput.XInputGetState(slot, ctypes.byref(st)) == 0:
                g = st.Gamepad
                w = g.wButtons
                lt = round(g.bLeftTrigger / 255.0, 4)
                rt = round(g.bRightTrigger / 255.0, 4)
                buttons = [
                    {"pressed": bool(w & 0x1000), "value": 1.0 if (w & 0x1000) else 0.0},  # 0: A
                    {"pressed": bool(w & 0x2000), "value": 1.0 if (w & 0x2000) else 0.0},  # 1: B
                    {"pressed": bool(w & 0x4000), "value": 1.0 if (w & 0x4000) else 0.0},  # 2: X
                    {"pressed": bool(w & 0x8000), "value": 1.0 if (w & 0x8000) else 0.0},  # 3: Y
                    {"pressed": bool(w & 0x0100), "value": 1.0 if (w & 0x0100) else 0.0},  # 4: LB
                    {"pressed": bool(w & 0x0200), "value": 1.0 if (w & 0x0200) else 0.0},  # 5: RB
                    {"pressed": lt > 0.12, "value": lt},                                   # 6: LT
                    {"pressed": rt > 0.12, "value": rt},                                   # 7: RT
                    {"pressed": bool(w & 0x0020), "value": 1.0 if (w & 0x0020) else 0.0},  # 8: Back/View
                    {"pressed": bool(w & 0x0010), "value": 1.0 if (w & 0x0010) else 0.0},  # 9: Start/Menu
                    {"pressed": bool(w & 0x0040), "value": 1.0 if (w & 0x0040) else 0.0},  # 10: L3
                    {"pressed": bool(w & 0x0080), "value": 1.0 if (w & 0x0080) else 0.0},  # 11: R3
                    {"pressed": bool(w & 0x0001), "value": 1.0 if (w & 0x0001) else 0.0},  # 12: D-Pad Up
                    {"pressed": bool(w & 0x0002), "value": 1.0 if (w & 0x0002) else 0.0},  # 13: D-Pad Down
                    {"pressed": bool(w & 0x0004), "value": 1.0 if (w & 0x0004) else 0.0},  # 14: D-Pad Left
                    {"pressed": bool(w & 0x0008), "value": 1.0 if (w & 0x0008) else 0.0},  # 15: D-Pad Right
                ]
                lx = round(max(-1.0, min(1.0, g.sThumbLX / 32767.0)), 4)
                ly = round(max(-1.0, min(1.0, -g.sThumbLY / 32767.0)), 4)
                rx = round(max(-1.0, min(1.0, g.sThumbRX / 32767.0)), 4)
                ry = round(max(-1.0, min(1.0, -g.sThumbRY / 32767.0)), 4)
                pads.append({
                    "index": slot,
                    "id": f"Xbox Controller #{slot + 1} (XInput)",
                    "connected": True,
                    "mapping": "standard",
                    "buttons": buttons,
                    "axes": [lx, ly, rx, ry],
                    "packet": st.dwPacketNumber,
                })

    # 2. Poll DirectInput joysticks/gamepads via WinMM if extra pads are plugged in
    if winmm is not None:
        winmm_pads = []
        for joy_id in range(8):
            info = JOYINFOEX()
            info.dwSize = ctypes.sizeof(JOYINFOEX)
            info.dwFlags = 0xFF
            if winmm.joyGetPosEx(joy_id, ctypes.byref(info)) == 0:
                winmm_pads.append((joy_id, info))
        if len(winmm_pads) > len(pads):
            for idx in range(len(pads), len(winmm_pads)):
                joy_id, info = winmm_pads[idx]
                bmask = info.dwButtons
                pov = info.dwPOV
                d_up = (pov != 65535) and (pov <= 4500 or pov >= 31500)
                d_right = (pov != 65535) and (4500 <= pov <= 13500)
                d_down = (pov != 65535) and (13500 <= pov <= 22500)
                d_left = (pov != 65535) and (22500 <= pov <= 31500)
                buttons = [
                    {"pressed": bool(bmask & (1 << i)), "value": 1.0 if (bmask & (1 << i)) else 0.0}
                    for i in range(12)
                ] + [
                    {"pressed": d_up, "value": 1.0 if d_up else 0.0},
                    {"pressed": d_down, "value": 1.0 if d_down else 0.0},
                    {"pressed": d_left, "value": 1.0 if d_left else 0.0},
                    {"pressed": d_right, "value": 1.0 if d_right else 0.0},
                ]
                lx = round((info.dwXpos - 32767.5) / 32767.5, 4)
                ly = round((info.dwYpos - 32767.5) / 32767.5, 4)
                rx = round((info.dwZpos - 32767.5) / 32767.5, 4)
                ry = round((info.dwRpos - 32767.5) / 32767.5, 4)
                pads.append({
                    "index": len(pads),
                    "id": f"USB Gamepad #{len(pads) + 1} (DirectInput)",
                    "connected": True,
                    "mapping": "standard",
                    "buttons": buttons,
                    "axes": [lx, ly, rx, ry],
                    "packet": 1,
                })

    return pads

# ========================================================
# HTTP REQUEST HANDLER
# ========================================================
class BattleBotRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Prevent browser from aggressively caching HTML/JS/CSS during local development
        path = self.path.split("?")[0].lower()
        if path.endswith((".html", ".js", ".css", "/")):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self):
        # Native Windows controller bridge endpoint polled by js/input.js
        if self.path.startswith("/__gamepads"):
            pads = read_windows_gamepads()
            payload = json.dumps({"pads": pads}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            try:
                self.wfile.write(payload)
            except Exception:
                pass
            return

        try:
            super().do_GET()
        except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
            pass

    def log_message(self, format, *args):
        # Suppress noisy periodic poll requests from console
        if args and isinstance(args[0], str) and ("/__gamepads" in args[0]):
            return
        super().log_message(format, *args)

# ========================================================
# DUAL-STACK SERVER & LAUNCHER
# ========================================================
class DualStackHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True
    address_family = socket.AF_INET6

    def server_bind(self):
        try:
            # Allow both IPv4 and IPv6 connections on the same port
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except Exception:
            pass
        return super().server_bind()

def find_available_server(start_port=DEFAULT_PORT, max_attempts=10):
    for port in range(start_port, start_port + max_attempts):
        try:
            server = DualStackHTTPServer(("::", port), BattleBotRequestHandler)
            return server, port
        except Exception:
            try:
                server = ThreadingHTTPServer(("", port), BattleBotRequestHandler)
                return server, port
            except OSError:
                continue
    return None, None

def open_browser_delayed(url, delay=1.0):
    def _open():
        try:
            webbrowser.open(url)
        except Exception:
            pass
    t = threading.Timer(delay, _open)
    t.daemon = True
    t.start()

if __name__ == "__main__":
    os.chdir(DIRECTORY)
    server, port = find_available_server(DEFAULT_PORT)

    if server is None:
        print(f"[ERROR] Could not bind to ports {DEFAULT_PORT}..{DEFAULT_PORT + 9}. Please close any busy server.")
        sys.exit(1)

    url = f"http://localhost:{port}/index.html"
    print("=" * 62)
    print("       BATTLEBOTx — AI FARM COMBAT ROBOTICS ARENA")
    print("               Local HTTP Game Server")
    print("=" * 62)
    print(f"  [STATUS]   : ONLINE (Active)")
    print(f"  [URL]      : {url}")
    print(f"  [CONTROLS] : Xbox / PS4 / USB Gamepads + Keyboard")
    if sys.platform == "win32":
        print(f"  [BRIDGE]   : Windows XInput / DirectInput Fallback Active")
    print("-" * 62)
    print("  Opening game in your default web browser...")
    print("  Keep this window open while playing!")
    print("  Press Ctrl+C to stop the server anytime.")
    print("=" * 62)

    open_browser_delayed(url, delay=0.8)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[SERVER] Stopping BATTLEBOTx server... Goodbye!")
        server.server_close()
        sys.exit(0)
