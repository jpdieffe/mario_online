# 🍄 Mario Online – Co-op

A browser-based 2-player co-operative Mario clone using peer-to-peer WebRTC (no server needed).

## Play

Open on **GitHub Pages** and share the code with a friend.

URL: `https://<your-username>.github.io/<repo-name>/`

## Controls

| Action | Player 1 (Mario) | Player 2 (Luigi) |
|--------|-----------------|-----------------|
| Move   | Arrow Keys / WASD | Same keys |
| Jump   | Space / Up / W  | Same |
| Run    | Shift / Z       | Same |
| Fire   | X (fire power)  | Same |

## How to Play Together

1. **Player 1** opens the page and clicks **"Host Game"**
2. A short code appears – share it with Player 2 (copy/paste)
3. **Player 2** opens the page, pastes the code, and clicks **"Join Game"**
4. Both players appear in the level. Work together to reach the goal flag!

## Features

- ✅ 2-player co-op via WebRTC (PeerJS free signaling)
- ✅ Mario (P1) & Luigi (P2) with pixel art sprites
- ✅ Platformer physics — jump, run, gravity
- ✅ Enemies: Goombas & Koopas (w/ shell kicks)
- ✅ Coins & question blocks
- ✅ Power-ups: Mushroom (grow) & Fire Flower (shoot fireballs)
- ✅ 2 levels (overworld + underground)
- ✅ Lives & score system

## Architecture

```
Host (P1)                      Client (P2)
  │                                  │
  │  ←── input snapshot ────────────│
  │                                  │
  │  ──── state sync (20fps) ───────→│
  │       (positions, enemies, etc.) │
```

- **Host** runs authoritative physics for all entities
- **Client** sends input and receives state corrections
- Both render their local view via canvas pixel art sprites

## Tech Stack

- Pure HTML5 + Canvas (no framework)
- ES6 Modules
- [PeerJS](https://peerjs.com/) for WebRTC peer-to-peer
- Pixel art sprites drawn programmatically via Canvas 2D

## Development (local)

Serve the folder with any static server to test locally:

```bash
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080` and use `?solo=1` to test without a peer:

```
http://localhost:8080?solo=1
```

## Deployment to GitHub Pages

1. Push this repository to GitHub
2. Go to **Settings → Pages → Source → Deploy from branch → main**
3. Site will be live at `https://<username>.github.io/<repo>/`
