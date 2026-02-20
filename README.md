# Mixed Worlds

Ein First-Person Multiplayer-Prototyp mit:

- prozeduralem Noise-Terrain,
- generierten Höhlentunneln,
- Positions-Sync via Socket.IO,
- Google Login via Firebase Auth.

## Start

```bash
npm install
npm start
```

App läuft auf `http://localhost:3000`.

## Google Login einrichten

1. In Firebase ein Projekt erzeugen.
2. Authentication aktivieren und `Google` als Provider einschalten.
3. Web-App anlegen und Werte in `public/firebase-config.js` eintragen.

> Ohne gültige Firebase-Daten funktioniert nur die Oberfläche, nicht der Login.
