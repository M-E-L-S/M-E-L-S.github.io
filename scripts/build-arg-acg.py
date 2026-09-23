"""Build the opt-in ARG character lexicon from bangumi/Archive.

Usage: python scripts/build-arg-acg.py [--archive path/to/dump.zip]
Without --archive, aux/latest.json selects the current release and its SHA-256
is verified before extraction. Only character.jsonlines is read from the ZIP.
"""

import argparse
import hashlib
import html
import json
import re
import tempfile
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LATEST = 'https://raw.githubusercontent.com/bangumi/Archive/master/aux/latest.json'
CHINESE = re.compile(r'^[ \t]*\|[ \t]*简体中文名[ \t]*=[ \t]*([^\r\n]*)', re.M)
CHINESE_ALIAS = re.compile(r'\[[ \t]*(?:第二中文名|中文名)[ \t]*\|([^\]\r\n]*)\]')
ROMAN_ALIAS = re.compile(r'\[[ \t]*(?:罗马字|罗马音|罗马拼音|英文名|英文名称|英語名|英语名)(?:[一二三四五六七八九十0-9])?[ \t]*\|([^\]\r\n]*)\]', re.I)
ROMAN_FIELD = re.compile(r'^[ \t]*\|[ \t]*(?:罗马字|罗马音|罗马拼音|英文名|英文名称)[ \t]*=[ \t]*([^\r\n]*)', re.M)
HAN = re.compile(r'[\u3400-\u9fff]')


def get_latest():
    with urllib.request.urlopen(LATEST, timeout=30) as response:
        return json.load(response)


def download(latest, path):
    request = urllib.request.Request(latest['browser_download_url'], headers={'User-Agent': 'MELS-ARG-name-builder'})
    digest = hashlib.sha256()
    with urllib.request.urlopen(request, timeout=600) as response, path.open('wb') as output:
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
            digest.update(chunk)
    expected = latest['digest'].removeprefix('sha256:')
    if digest.hexdigest() != expected:
        raise ValueError('Bangumi Archive SHA-256 mismatch')


def chinese_name(infobox):
    found = CHINESE.search(infobox)
    candidates = ([found.group(1)] if found else []) + CHINESE_ALIAS.findall(infobox)
    for candidate in candidates:
        value = html.unescape(candidate).strip()
        value = re.sub(r'<[^>]+>|\[[^\]]+\]|\{[^{}]+\}', '', value)
        value = ' '.join(value.split())
        if HAN.search(value) and len(value) <= 60:
            return value
    return None


def roman_name(value):
    value = html.unescape(value)
    value = re.sub(r'<[^>]+>|\([^)]*\)|（[^）]*）|\[[^\]]+\]|\{[^{}]+\}', ' ', value)
    value = ''.join(char for char in unicodedata.normalize('NFKD', value) if not unicodedata.combining(char))
    value = re.sub(r'[^A-Za-z]+', ' ', value).strip()
    parts = value.split()
    if not parts or len(parts) > 6 or len(value) > 70 or sum(map(len, parts)) < 3:
        return None
    return value


def extract(archive):
    records = {}
    total = 0
    with zipfile.ZipFile(archive) as zipped:
        member = next((name for name in zipped.namelist() if name.rsplit('/', 1)[-1] == 'character.jsonlines'), None)
        if not member:
            raise ValueError('Archive has no character.jsonlines')
        with zipped.open(member) as lines:
            for raw in lines:
                total += 1
                character = json.loads(raw)
                if character.get('role') != 1:
                    continue
                infobox = character.get('infobox') or ''
                chinese = chinese_name(infobox)
                if not chinese:
                    continue
                candidates = [character.get('name') or '']
                candidates.extend(ROMAN_ALIAS.findall(infobox))
                candidates.extend(ROMAN_FIELD.findall(infobox))
                for raw_name in candidates:
                    for variant in re.split(r'\s*(?:/|、|;|；)\s*', raw_name):
                        roman = roman_name(variant)
                        if not roman:
                            continue
                        key = ''.join(roman.lower().split())
                        ident = character['id']
                        records.setdefault((key, ident), {'roman': roman, 'chinese': chinese,
                                                           'url': f'https://bangumi.tv/character/{ident}'})
    entries = [records[key] for key in sorted(records)]
    full = set()
    parts = set()
    for entry in entries:
        tokens = entry['roman'].lower().split()
        full.add(''.join(tokens))
        if len(tokens) > 1:
            # Two-letter parts create too many accidental matches in cipher text.
            parts.update(token for token in tokens if len(token) >= 3)
    parts.difference_update(full)
    return total, entries, full, parts


def write_data(archive):
    total, entries, full, parts = extract(archive)
    if not entries or not full:
        raise ValueError('No character names extracted')
    data = ROOT / 'assets' / 'data'
    (data / 'arg-acg-names.json').write_text(json.dumps(entries, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    words = ''.join(f'full\t{word}\n' for word in sorted(full))
    words += ''.join(f'part\t{word}\n' for word in sorted(parts))
    (data / 'arg-acg-words.txt').write_text(words, encoding='utf-8')
    print(f'Archive characters: {total}; name entries: {len(entries)}; full names: {len(full)}; parts: {len(parts)}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, help='Existing Bangumi Archive ZIP')
    args = parser.parse_args()
    if args.archive:
        write_data(args.archive)
        return
    latest = get_latest()
    with tempfile.TemporaryDirectory(prefix='bangumi-arg-') as directory:
        archive = Path(directory) / latest['name']
        print(f"Downloading {latest['name']} ({latest['size']} bytes)")
        download(latest, archive)
        write_data(archive)


if __name__ == '__main__':
    main()
