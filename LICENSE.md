# Licensing

Copyright (c) 2026 WinyAndME

This repository uses multiple licenses depending on the type and origin of the material.

No single license applies to the repository as a whole.

## 1. MIT-Licensed Original Code

Unless specifically excluded below, source code originally written for this repository by WinyAndME is licensed under the MIT License.

The MIT License does **not** apply to:

* the Boss Battle Feature described in Section 2;
* the Long Wordle Feature described in Section 3;
* the Fresh Cup Tool Center described in Section 4;
* articles, personal writings, photographs, images, or other original non-code content described in Section 5;
* music, audio, images, software, or other material owned by third parties;
* files or portions of files carrying their own license notice;
* third-party code under `vendor/` or elsewhere in this repository.

### MIT License

Copyright (c) 2026 WinyAndME

Permission is hereby granted, free of charge, to any person obtaining a copy
of the MIT-licensed software and associated documentation files (the
"Software"), to deal in the Software without restriction, including without
limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom
the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 2. Boss Battle Feature

The original software implementation and copyrightable expression of the
Boss Battle Feature are expressly excluded from the MIT License.

This includes:

* `src/scripts/boss-battle.js`;
* Boss Battle-specific code in `src/scripts/game.js`;
* Boss Battle-specific markup in `src/site.html`;
* Boss Battle-specific styles in `src/styles/components.css`;
* other code, text, graphics, animation, interface elements, or documentation
  explicitly identified as part of the Boss Battle Feature.

The unrelated "Boss Key" / 老板键 functionality, including
`src/scripts/boss-key.js` and `boss-key-extension/`, is **not** part of this exception
unless otherwise stated.

The Boss Battle Feature is licensed separately under the terms described in
`BOSS-NONCOMMERCIAL-LICENSE.md`.

Commercial use of the copyrightable Boss Battle implementation is not
licensed without separate written permission from WinyAndME.

For clarity, this notice does not claim copyright ownership over abstract
ideas, general game mechanics, methods of play, concepts, or independently
created implementations that are not protected by applicable copyright law.

## 3. Long Wordle Feature

The original software implementation and copyrightable expression of the
Long Wordle Feature are expressly excluded from the MIT License.

This exception covers the long-word game mode in `src/scripts/wordle.js`, including its
variable-length answer flow, short-guess alignment integration, sliding-window
interaction, long-mode-specific interface elements and styles, and other code
or documentation explicitly identified as part of the Long Wordle Feature.
It does not relicense the classic five-letter mode, the exam five-letter mode,
or third-party dictionary data.

The Long Wordle Feature is licensed separately under the terms described in
`LONG-WORDLE-NONCOMMERCIAL-LICENSE.md` using the PolyForm Noncommercial
License 1.0.0. Commercial use is not licensed without a separate written,
paid commercial license from WinyAndME.

For clarity, this notice does not claim copyright ownership over abstract
ideas, general game mechanics, methods of play, concepts, or independently
created implementations that are not protected by applicable copyright law.

## 4. Fresh Cup Tool Center

The original copyrightable portions of the Fresh Cup Tool Center are expressly
excluded from the MIT License. This includes the score calculators, damage
calculator, tool navigation, Fresh Cup-specific interface and styling, the
retained C reference implementation, and related documentation in:

* `src/pages/freshcup/`;
* `src/scripts/freshcup/` and `src/scripts/freshcup-navigation.js`;
* `src/styles/freshcup/` and `src/styles/freshcup-native.css`;
* the Fresh Cup-specific portions of `scripts/build.cjs` and `src/site.html`;
* `main.c`, `CMakeLists.txt`, generated Fresh Cup routes, and legacy redirect files.

These original portions are licensed separately under
`FRESHCUP-NONCOMMERCIAL-LICENSE.md` using the PolyForm Noncommercial License
1.0.0. Commercial use is not licensed without separate written permission from
WinyAndME. Third-party names, game data, terminology, and other material remain
subject to their respective rights and are not relicensed by this restriction.

## 5. Original Articles, Photographs, Images, and Personal Content

Unless a particular work states otherwise, original articles, writings,
photographs, images, personal narratives, and other non-code content created
by WinyAndME are:

**Copyright © 2026 WinyAndME. All rights reserved.**

No permission is granted by this repository to reproduce, redistribute,
publish, modify, commercially exploit, train datasets on, or otherwise reuse
such material beyond rights that may independently exist under applicable law.

The public availability of such material in this repository or on the
associated website does not place it in the public domain and does not grant
an implied license for reuse.

Some of this material may contain personal experiences or other personal
information. Redistribution of such content is not authorized by this
repository.

## 6. Third-Party Software

Third-party software remains subject to its respective copyright and license
terms.

In particular, software under `vendor/` and any other file containing a
third-party license or attribution notice is not relicensed under the MIT
License by this repository.

See:

* `vendor/README.md`
* `vendor/CanvasUI-LICENSE.md`
* `THIRD_PARTY_AND_CONTENT_NOTICE.md`

and any license notices contained in individual source files.

## 7. Third-Party Music and Other Media

Music, recordings, images, or other media identified as third-party material
are not owned or licensed by WinyAndME merely because copies appear in this
repository.

The website may also request music search results, metadata, cover artwork,
lyrics, temporary playback URLs, audio streams, or related resources from the
third-party GD Music service (`music-api.gdstudio.xyz`) and from services or
rightsholders represented in its responses. Those externally loaded resources
are third-party material even when they are displayed or played through this
website.

The MIT License applies to the original integration code only. It does not
grant any right to the API service, its responses, the linked streams, musical
works, sound recordings, cover artwork, lyrics, trademarks, or other content.

No copyright license to such works is granted by this repository.

All copyrights and other rights in those works remain with their respective
rightsholders. Availability through an API or a temporary URL must not be
interpreted as public-domain status, an open-content license, or permission for
download, redistribution, public performance, or commercial use.

See `THIRD_PARTY_AND_CONTENT_NOTICE.md` for additional information.

## 8. No Implied Rights

Except for rights expressly granted under an applicable license, no license
or permission is granted by implication, estoppel, availability of source
code, access to the website, or otherwise.

Where a file-specific license conflicts with this document, the file-specific
license governs that file.
