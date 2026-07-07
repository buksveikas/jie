# JIE

Static Cloudflare Pages-ready album experience for Egomasina's `JIE`.

The site is a single scroll-scrubbed canvas/audio release. The 13 album tracks live in `assets/` and are wired into `main.js` with real durations.

Bandcamp: https://egomasina.bandcamp.com/

Local preview:

```sh
python3 -m http.server 8788 --bind 127.0.0.1
```

Cloudflare Pages settings:

- Framework preset: `None`
- Build command: leave empty, or use `exit 0`
- Build output directory: `/`
- Root directory: `/`
