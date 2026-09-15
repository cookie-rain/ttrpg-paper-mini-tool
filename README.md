# 🧙 TTRPG Paper-Mini Tool

Turn character and monster images into printable, foldable **paper miniatures** for tabletop RPGs —
right in your browser. Works for Daggerheart, D&D, Pathfinder or any other game played on a 1-inch grid.

Your images never leave your computer: everything runs locally in the browser.

## How a paper mini works

Each mini is printed as one strip that you cut out and fold at the top:

```
+-------------+  base strip (back)   ← text upside down, reads correctly from behind
|   image     |  mirrored image
+- - fold - - +
|   image     |  front image
+-------------+  base strip (front)  ← name + info, goes into the stand
```

After folding, the figure shows the artwork on both sides and the base strip clips into a small plastic stand.

No stands? Choose **Folded paper foot**: both base strips bend out 90° into a foot, and an extra flap
(twice the strip length) folds under it as reinforcement.

## Features

- **Drag & drop** images anywhere into the window, or use *Add images*.
- **Auto-trim**: transparent (or plain-coloured) borders are removed automatically; fine-tune with the crop tool.
- **Size by eye**: compare each figure with reference silhouettes (Small, Medium, Large, Huge, Gargantuan)
  and scale it with a slider. The aspect ratio is always kept.
- **Lineup view**: see all figures side by side on a battle map grid and match their sizes;
  toggle individual figures, silhouettes and height lines.
- **Copies with letters**: print *Goblin A, B, C…* so identical enemies are easy to tell apart.
- **Base colours**: blue, red, green, yellow or gray — filled or as side stripes. Text colour adapts for contrast.
- **Two text lines** (name + info) on both sides of the base.
- **Two layouts** on A5, A4, A3, US Letter, US Legal or Tabloid: *Easy to cut* (straight cuts only) or *Save paper* (tight packing).
- **In-game size** of every figure in metres and feet (Small 1 m, Medium 1.8 m, Large 3–5 m, Huge 5–10 m, Gargantuan 10 m+).
- **Base styles**: for plastic stands or as a folded paper foot.
- **Cut and fold line styles**: solid, dashed, corner marks, edge ticks or none.
- **PDF download or direct printing**, with a live preview and a calibration ruler.
- **mm or inches** throughout.
- **Projects** are saved automatically in the browser and can be exported/imported as a file.

## Tips

- Transparent PNGs give the best results.
- Always print at **100 % / “actual size”** and check the calibration ruler on the page.
- Heavier paper (160–250 g/m²) makes sturdier minis.

## Development

Requires [Node.js](https://nodejs.org/) 22.12 or newer (the test runner needs it).

```sh
npm install
npm run dev        # start the dev server at http://localhost:5173
npm test           # run unit tests
npm run build      # type-check and build static files into dist/
```

Tech stack: [Vite](https://vite.dev/), [React](https://react.dev/), TypeScript, [Zustand](https://github.com/pmndrs/zustand),
[pdf-lib](https://pdf-lib.js.org/) and [react-image-crop](https://github.com/dominictobias/react-image-crop).

### Project structure

```
src/
  lib/          framework-independent logic
    geometry.ts   card and figure dimensions
    layout.ts     packs cards onto pages
    render.ts     draws pages onto a canvas (used for preview, PDF and printing)
    output.ts     PDF export and browser printing
    image.ts      image import and auto-trim
  components/   React UI (editor, lineup, print view, ...)
  store.ts      application state and persistence
```

## Credits

Made by [cookie-rain](https://github.com/cookie-rain), built with [Claude Code](https://claude.com/claude-code).

## License

[MIT](LICENSE)
