# Third-Party and Content Notice

This document explains the ownership and licensing status of material in this
repository that is not covered by the repository's general MIT grant.

## 1. Third-Party Music and Audio

The following files currently included in the repository are not represented
as original works of M-E-L-S:

* `assets/audio/没有如果.mp3`

Copyright and related rights in these recordings and underlying musical
works belong to their respective rightsholders.

M-E-L-S does not claim authorship or ownership of those works.

No license, sublicense, or permission to reproduce, redistribute, perform,
adapt, commercially exploit, or otherwise use those works is granted by this
repository.

Their presence in this repository must not be interpreted as evidence that
the works are public domain, freely licensed, or available for reuse.

Where reliable authorship, source, and license information becomes
available, it should be recorded here.

If you are a rightsholder and believe material belonging to you is included
in this repository without appropriate authorization, please contact the
repository owner.

This notice is an attribution and rights-status notice only. It does not
create or substitute for any permission that may be required from a
rightsholder.

### Online music service and externally loaded content

The website includes original frontend integration code that sends requests
directly from the visitor's browser to the GD Music service:

* service website: `https://music.gdstudio.xyz/`;
* API endpoint currently used: `https://music-api.gdstudio.xyz/api.php`.

The integration can request search results, track and album metadata, cover
artwork, synchronized lyrics, temporary playback URLs, and audio streams. GD
Music has requested that applications using its public API credit the service;
the player therefore displays a link and attribution to GD音乐台.

GD Music, the music platforms represented by API responses, and the relevant
artists, labels, publishers, photographers, designers, and other rightsholders
are independent third parties. M-E-L-S does not claim ownership of, endorse,
or grant a license to their API data, music, recordings, lyrics, artwork,
trademarks, or linked resources. The availability of a result or playback URL
does not establish that it is public domain, openly licensed, or cleared for
download, redistribution, public performance, or commercial use.

The repository does not contain or operate the GD Music API and does not
guarantee its availability, accuracy, security, continued compatibility, or
the availability of any upstream content. The service operator may change,
restrict, or discontinue the service independently of this project. Users and
redistributors of this project remain responsible for complying with
applicable law and the terms and rights associated with each third-party
service and item of content.

### Browser-local music data

This static website has no project-operated backend for music accounts or
music-library synchronization. Playback history, favorites, favorite sorting,
playback mode, resolved playback URLs, and related metadata are stored in the
visitor's browser using `localStorage`. Clearing the website's browser data
removes those local records.

The browser nevertheless connects directly to GD Music and to hosts referenced
by API responses in order to search, load images and lyrics, or stream audio.
Those third parties may receive ordinary network request information and handle
it under their own terms and policies. This repository does not control their
data handling.

## 2. Third-Party Software

Third-party software is governed by its own license terms and is not
relicensed by M-E-L-S.

### Canvas UI and related adapted code

Some visual effects and frontend code in this project are based on or adapted
from the Canvas UI project by David Haz.

The applicable license and attribution information are retained in:

* `vendor/CanvasUI-LICENSE.md`
* `vendor/README.md`

Individual source files may contain additional provenance and attribution
information.

Where Canvas UI-derived code appears outside `vendor/`, the corresponding
third-party license continues to apply to the derived portions.

### Other third-party software

The favicon package generator includes JSZip 3.10.1 by Stuart Knightley and
contributors. JSZip is used under the MIT License; the bundled license text is
retained in `vendor/JSZIP-LICENSE.markdown`.

The site loads Three.js 0.180.0 and selected addons from jsDelivr for the
homepage particle renderer. Three.js is distributed under the MIT License by
the three.js authors: `https://github.com/mrdoob/three.js/blob/dev/LICENSE`.

The site loads Font Awesome Free 6.4.0 CSS and font/icon resources from cdnjs.
Font Awesome Free applies separate licenses to its code, fonts, and icons; see
`https://fontawesome.com/license/free/`. Brand names and marks remain the
property of their respective owners.

The “缩写转义” utility sends user-entered abbreviations directly from the
visitor's browser to the “能不能好好说话？” (`nbnhhsh`) public API at
`https://lab.magiconch.com/api/nbnhhsh/guess`. The upstream project is by
itorr and is distributed under the Apache License 2.0. API responses and
service availability remain controlled by that independent service.

The Wordle guess dictionary at `assets/data/wordle-words.txt` is derived from
the `word-list` npm package by Sindre Sorhus, filtered to lowercase alphabetic
words of 5–9 letters. It is distributed under the MIT License; the retained
license is available at `assets/data/wordle-words-LICENSE.txt`.

The ARG assistant uses a separate dictionary at
`assets/data/arg-english-words.txt`: the complete `words.txt` from Sindre
Sorhus's `word-list` npm package, version 4.1.0. It is not limited by the
Wordle game's word lengths. The package is distributed under the MIT License;
its license is retained at `assets/data/arg-english-words-LICENSE.txt`.

The optional ARG ACG Name data at `assets/data/arg-acg-names.json` and
`assets/data/arg-acg-words.txt` is extracted from the public
[`bangumi/Archive`](https://github.com/bangumi/Archive) character wiki dump.
The data contains contributed character names, Chinese names, and links to
Bangumi character pages. M-E-L-S does not claim authorship or ownership of
these contributed records. See `scripts/build-arg-acg.py` for extraction and
`DEVELOPMENT.md` for updates.

The classic-mode answer data at `assets/data/wordle-classic-answers.txt`
reproduces the 2,315-word answer set embedded in the original pre-NYT Wordle
web application. The checked copy was obtained from
`github.com/dbraginskiy/wordle/blob/master/wordle-answers.txt`; it is kept as
game-compatibility data and is not represented as original website content.

The filtered CET-4, CET-6, IELTS, TOEFL, GRE, and postgraduate-entrance-English
answer lists named `assets/data/wordle-{cet4,cet6,ielts,toefl,gre,kaoyan}.txt` are derived from the
corresponding dictionaries in the Qwerty Learner project by RealKai42 and its
contributors. Qwerty Learner identifies its dictionary data as originating
from the kajweb dictionary project and distributes the repository under GNU
GPL v3. The retained license is available at
`assets/data/exam-wordlists-LICENSE.txt`. These local files contain only
unique lowercase alphabetic entries of 5–9 letters; translations,
pronunciations, phrases, and other metadata were removed from the answer-list
files. Concise Chinese definitions retained from those dictionaries are stored
separately in `assets/data/wordle-exam-definitions.json`.

Parts of speech in `assets/data/wordle-exam-definitions.json` were matched
against the lexical indexes from Princeton WordNet 3.0, distributed through
the `wordnet-db` npm package. The WordNet license and copyright notice are
retained at `assets/data/wordnet-LICENSE.txt`.

Any other third-party library, component, source file, snippet, or adapted
work remains subject to the license stated by its original author or included
with that material.

A third-party license takes precedence over the repository's MIT license for
the material to which that third-party license applies.

### F.V. cup tools and game-related references

The F.V. cup Tool Center is an unofficial fan-made collection of score and
damage-calculation tools. It refers to third-party game names, terminology,
characters, items, mechanics, and numerical information, including material
associated with *Arknights* / 《明日方舟》. Those names, trademarks, creative
works, and other third-party material remain with their respective owners.
Their appearance does not imply sponsorship, endorsement, affiliation, or a
license from M-E-L-S.

The damage-calculation documentation credits the explanatory video
“万物汇集#13《青年大学集》——集成战略收藏品当中的加减乘除” at
`https://www.bilibili.com/video/BV1qnUWY4E59`. Referencing its calculation
methodology does not relicense the video or any third-party material in it.

M-E-L-S's original copyrightable implementation of the F.V. cup tools is
licensed for noncommercial use under `FRESHCUP-NONCOMMERCIAL-LICENSE.md`.
That restriction applies only to material M-E-L-S has the right to license;
it does not supersede third-party licenses or claim ownership of facts, game
mechanics, methods, names, or trademarks.

## 3. Mixed-Licensing Summary

In summary:

* original general-purpose website code: **MIT License**;
* original Boss Battle implementation: **PolyForm Noncommercial 1.0.0**;
* original Long Wordle implementation: **PolyForm Noncommercial 1.0.0**;
* original F.V. cup Tool Center implementation: **PolyForm Noncommercial
  1.0.0**;
* third-party music and media: **no license granted by M-E-L-S; rights remain
  with their respective owners**;
* GD Music integration code: **MIT License**, while API responses and externally
  loaded content remain governed by their respective providers and
  rightsholders;
* third-party software: **the original third-party license applies**.

See `LICENSE.md` for the authoritative repository-level scope description.
