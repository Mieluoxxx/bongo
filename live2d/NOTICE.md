# The character model

The Live2D model of 大肥鱼 in this folder, `c_0120`, its textures,
expressions and motions, are licensed under the Creative Commons
Attribution-NonCommercial-ShareAlike 4.0 International license, in
[LICENSE](LICENSE) (https://creativecommons.org/licenses/by-nc-sa/4.0/).
They are not under the MIT license of the rest of the project.

大肥鱼 is by, on bilibili:

- ZipZipPipe — https://space.bilibili.com/4168597
- 茶坤菜的 — https://space.bilibili.com/2505395
- 六青 — https://space.bilibili.com/11272072

## Changes made for Bongo

As BY-NC-SA asks, these changes are licensed under it too:

- The files, in one folder as VTube Studio laid them out, are sorted into
  `expressions/`, `gestures/`, `styles/<group>/` and `motions/`; VTube
  Studio's own files are in `vtube/`.
- Renamed: `aidale.motion3.json` → `motions/重锤出击.motion3.json`,
  `chuipaopao.motion3.json` → `motions/泡泡糖.motion3.json`,
  `love.exp3.json` → `expressions/冒爱心.exp3.json`,
  `喵喵手~喵~动画.exp3.json` → `gestures/喵喵手.exp3.json`,
  `巴菲.exp3.json` → `styles/装扮/隐藏巴菲.exp3.json`, and the stickers
  `猫猫贴纸`, `兔兔贴纸`, `蝴蝶结贴纸` → `styles/贴纸/猫猫`, `兔兔`, `蝴蝶结`.
- `c_0120.model3.json` lists every expression and motion at its new path.
- `styles.json` is new: it groups the styles for Bongo's 样式 menu.
- `expressions.json` is new: it sorts the expressions by kind for Bongo's
  表情 menu.
- `motions.json` is new: it names the animations for Bongo's 动作 menu
  after VTube Studio's hotkeys, and marks those its hotkeys hold on their
  last frame.

The moc, textures, physics, and the contents of every exp3 and motion3
file are unchanged.
