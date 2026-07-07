# Egomasina album site

Static Cloudflare Pages-ready album experience.

Replace these before production:

- `index.html`: `[ALBUM TITLE]`
- `index.html`: `[BANDCAMP URL]`
- `main.js` and `index.html`: `./assets/ALBUM_AUDIO_FILE.mp3`

Local preview:

```sh
npm run preview
```

Deploy after Cloudflare auth is configured:

```sh
npm run deploy
```
