#!/usr/bin/env python3
"""
Lumen offline Wikipedia pack builder
====================================

Turns a Wikipedia dump (the big .xml.bz2 file from dumps.wikimedia.org) into ONE small file that Lumen can import:

    lumen-wiki-pack.jsonl.gz

You run this on your own computer, once. It needs only Python 3 (nothing to install). Lumen itself never downloads Wikipedia.

Quick start (Mac, Terminal):

    cd path/to/lumen/tools
    python3 build_wiki_pack.py --download simple          # Simple English Wikipedia: about 350 MB to download, about 10 minutes
    # then in Lumen: Settings > Offline Wikipedia > Choose the pack file

Bigger pack from the full English Wikipedia (23 GB download, several hours; keeps the longest articles):

    python3 build_wiki_pack.py --download en --max-articles 100000

Already have a dump file?

    python3 build_wiki_pack.py --dump ~/Downloads/simplewiki-latest-pages-articles.xml.bz2

Check that this script works on your computer (no internet needed):

    python3 build_wiki_pack.py --selftest

What goes into the pack: for each article, its title and the first part of its text (the opening and early sections, cleaned to plain text).
Not included: redirects, disambiguation pages, lists, tables, pictures, references, and very short stubs.
The text of Wikipedia is available under the Creative Commons Attribution-ShareAlike 4.0 license (CC BY-SA 4.0).
"""
import argparse, bz2, gzip, heapq, html, io, json, os, re, sys, time, urllib.request
import xml.etree.ElementTree as ET

VERSION = 1
DUMPS = {
    'simple': ('https://dumps.wikimedia.org/simplewiki/latest/simplewiki-latest-pages-articles.xml.bz2', 'simplewiki-latest-pages-articles.xml.bz2', 'simple'),
    'en': ('https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-pages-articles.xml.bz2', 'enwiki-latest-pages-articles.xml.bz2', 'en'),
}

# ---------------------------------------------------------------- wikitext to plain text
CUT_SECTIONS = re.compile(r'^=+\s*(see also|references?|notes?|footnotes?|external links?|further reading|bibliography|sources|citations|gallery|works cited)\s*=+\s*$', re.I | re.M)
SKIP_TITLE = re.compile(r'^(?:lists? of|index of|outline of|timeline of|glossary of|bibliography of|category:|template:|file:|wikipedia:|portal:|help:|draft:)', re.I)
DISAMBIG = re.compile(r'\{\{\s*(?:disambig(?:uation)?|dab|hndis|geodis|set index|given name|surname|shipindex|school disambiguation)\b', re.I)
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

def _tpl_text(inner):
    """A few templates carry words that belong in the sentence. Everything else is dropped."""
    parts = [p.strip() for p in inner.split('|')]
    name = parts[0].lower().strip()
    args = [p for p in parts[1:] if p and '=' not in p.split(' ')[0]]
    named = {p.split('=', 1)[0].strip().lower(): p.split('=', 1)[1].strip() for p in parts[1:] if '=' in p}
    if name in ('convert', 'cvt') and len(args) >= 2:
        return f'{args[0]} {args[1]}'
    if name in ('lang', 'langx', 'transl', 'lang-en') and len(args) >= 2:
        return args[-1]
    if name in ('nowrap', 'nobr', 'small', 'smaller', 'larger', 'big', 'abbr', 'tooltip', 'sc', 'smallcaps', 'em', 'strong', 'unicode', 'noitalic', 'nobold', 'hlist-item') and args:
        return args[0]
    if name in ('birth date', 'birth date and age', 'death date', 'death date and age', 'start date', 'end date', 'birth-date', 'bda', 'dda') and len(args) >= 3:
        try:
            y, m, d = int(args[0]), int(args[1]), int(args[2])
            return f'{d} {MONTHS[m - 1]} {y}'
        except (ValueError, IndexError):
            return args[0] if args else ''
    if name in ('circa', 'c.', 'circa-', 'ca'):
        return 'c. ' + (args[0] if args else '')
    if name in ('nbsp', 'spaces'):
        return ' '
    if name in ('ndash', 'snd', 'spnd'):
        return ' – '
    if name in ('mdash',):
        return ' — '
    if name == 'frac' and args:
        return '/'.join(args[:2]) if len(args) >= 2 else args[0]
    if name in ('age', 'currentyear'):
        return ''
    if name in ('quote', 'blockquote', 'cquote') and args:
        return args[0]
    return ''

def _sub_nested(text, open_, close, repl, limit=40):
    """Replace the innermost {{...}} or {|...|} first, again and again, so nesting works."""
    rx = re.compile(re.escape(open_) + r'((?:(?!' + re.escape(open_) + r'|' + re.escape(close) + r').)*)' + re.escape(close), re.S)
    for _ in range(limit):
        new = rx.sub(lambda m: repl(m.group(1)), text)
        if new == text:
            break
        text = new
    return text

def clean_wikitext(raw, max_chars=2000):
    t = raw
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    for tag in ('ref', 'math', 'gallery', 'timeline', 'imagemap', 'syntaxhighlight', 'source', 'score', 'chem', 'mapframe', 'maplink', 'noinclude', 'includeonly', 'references', 'poem', 'pre', 'code', 'blockquote'):
        t = re.sub(rf'<{tag}\b[^>]*?/\s*>', '', t, flags=re.I)
        t = re.sub(rf'<{tag}\b[^>]*>.*?</{tag}\s*>', '' if tag != 'blockquote' else ' ', t, flags=re.I | re.S)
    t = re.sub(r'</?nowiki\s*/?>', '', t, flags=re.I)
    t = re.sub(r'<br\s*/?>', ' ', t, flags=re.I)
    # cut the endings (see also, references, ...) before anything else is changed
    m = CUT_SECTIONS.search(t)
    if m:
        t = t[:m.start()]
    t = _sub_nested(t, '{|', '|}', lambda inner: '\n')                      # tables
    t = _sub_nested(t, '{{', '}}', _tpl_text)                                # templates
    t = re.sub(r'\{\{[^{}]*$', '', t, flags=re.M)                            # a broken template at the end
    # files, images, categories and other-language links (they can hold links inside their captions)
    for _ in range(6):
        new = re.sub(r'\[\[(?:File|Image|Media|Category):(?:[^\[\]]|\[\[[^\[\]]*\]\])*\]\]', '', t, flags=re.I)
        new = re.sub(r'\[\[[a-z]{2,3}(?:-[a-z]+)?:[^\[\]\n]*\]\]', '', new)
        if new == t:
            break
        t = new
    t = re.sub(r'\[\[:?([^\[\]|]*)\|([^\[\]]*)\]\]', r'\2', t)                # [[a|b]] -> b
    t = re.sub(r'\[\[:?([^\[\]|]*)\]\]', r'\1', t)                            # [[a]] -> a
    t = re.sub(r'\[(?:https?:)?//[^\s\]]+\s+([^\]]*)\]', r'\1', t)            # [http://x text] -> text
    t = re.sub(r'\[(?:https?:)?//[^\s\]]+\]', '', t)
    t = re.sub(r'https?://\S+', '', t)
    t = re.sub(r"'{2,5}", '', t)
    t = re.sub(r'</?[A-Za-z][^>]*>', '', t)
    t = html.unescape(t).replace('\xa0', ' ')
    lines = []
    for ln in t.split('\n'):
        s = ln.strip()
        if not s or s.startswith(('|', '!', '{', '}', '__')):
            continue
        if re.match(r'^=+.*=+$', s):                                          # a heading: keep a break, drop the words
            lines.append('')
            continue
        is_list = s[0] in '*#'
        s = re.sub(r'^[*#:;]+\s*', '', s)
        if is_list and len(s) < 60:                                           # scraps of lists are not useful as text
            continue
        lines.append(s)
    # paragraphs: keep real sentences, skip fragments and list scraps (the first paragraph is always kept)
    paras, cur = [], []
    for s in lines + ['']:
        if s:
            cur.append(s)
        elif cur:
            paras.append(' '.join(cur)); cur = []
    keep = [p for i, p in enumerate(paras) if i == 0 or len(p) >= 50 or (p.endswith('.') and len(p.split()) >= 6)]
    out = '\n'.join(keep)
    out = re.sub(r'\(\s*[;,]*\s*\)', '', out)
    out = re.sub(r'\(\s*[;,]\s*', '(', out)
    out = re.sub(r'\s+([,.;:!?)])', r'\1', out)
    out = re.sub(r'\(\s+', '(', out)
    out = re.sub(r'[ \t]{2,}', ' ', out)
    out = re.sub(r'\n{2,}', '\n', out).strip()
    if len(out) > max_chars:
        cut = out[:max_chars]
        end = max(cut.rfind('. '), cut.rfind('.\n'), cut.rfind('? '), cut.rfind('! '))
        out = cut[:end + 1] if end >= max_chars * 0.55 else cut.rsplit(' ', 1)[0] + '…'
    return out

def keep_title(title):
    return bool(title) and not SKIP_TITLE.search(title) and not re.search(r'\(disambiguation\)$', title, re.I) and len(title) <= 160

# ---------------------------------------------------------------- dump reader
def open_dump(path):
    if path.endswith('.bz2'):
        return bz2.open(path, 'rb')
    if path.endswith('.gz'):
        return gzip.open(path, 'rb')
    return open(path, 'rb')

def pages(path):
    """Yield (title, namespace, is_redirect, wikitext) for every page, without loading the whole file."""
    with open_dump(path) as f:
        root = None
        title = ns = text = None
        redirect = False
        for event, el in ET.iterparse(f, events=('start', 'end')):
            if root is None:
                root = el          # the first event is the start of the root element
                continue
            if event == 'start':
                continue
            tag = el.tag.rsplit('}', 1)[-1]
            if tag == 'title':
                title = el.text or ''
            elif tag == 'ns':
                ns = el.text
            elif tag == 'redirect':
                redirect = True
            elif tag == 'text':
                text = el.text or ''
            elif tag == 'page':
                yield title, ns, redirect, text or ''
                title = ns = text = None
                redirect = False
                root.clear()       # forget the page we just read, so memory stays small

def build(dump, out, max_articles, max_chars, min_chars, keep_lists, only_titles, log=print, source_name=None, lang='en'):
    t0 = time.time()
    heap = []                       # (raw length, counter, record): keeps the N longest articles
    seen = kept = skipped = 0
    only = None
    if only_titles:
        with open(only_titles, encoding='utf-8') as f:
            only = {ln.strip().lower() for ln in f if ln.strip()}
    for title, ns, redirect, text in pages(dump):
        seen += 1
        if seen % 20000 == 0:
            log(f'  looked at {seen:,} pages, kept {len(heap):,} so far ({int(time.time() - t0)} s)')
        if ns != '0' or redirect or text[:9].lower().startswith('#redirect'):
            continue
        if not keep_lists and not keep_title(title):
            skipped += 1; continue
        if only is not None and title.lower() not in only:
            continue
        if DISAMBIG.search(text[:4000]):
            skipped += 1; continue
        raw_len = len(text)
        if raw_len < min_chars:                     # even before cleaning, too short
            skipped += 1; continue
        if max_articles and len(heap) >= max_articles and raw_len <= heap[0][0]:
            continue
        body = clean_wikitext(text, max_chars)
        if len(body) < min_chars or re.search(r'\b(?:may|can) (?:also )?refer to\b', body[:300]):
            skipped += 1; continue
        item = (raw_len, seen, {'t': title, 'x': body})
        if max_articles and len(heap) >= max_articles:
            heapq.heapreplace(heap, item)
        else:
            heapq.heappush(heap, item)
    recs = [r for _, _, r in sorted(heap, key=lambda x: x[1])]
    header = {'lumenWiki': VERSION, 'lang': lang, 'source': source_name or os.path.basename(dump), 'built': time.strftime('%Y-%m-%d'), 'count': len(recs),
              'maxChars': max_chars, 'license': 'CC BY-SA 4.0', 'credit': 'Text from Wikipedia, available under the Creative Commons Attribution-ShareAlike 4.0 license.'}
    tmp = out + '.part'
    with gzip.open(tmp, 'wt', encoding='utf-8', compresslevel=6) as f:
        f.write(json.dumps(header, ensure_ascii=False) + '\n')
        for r in recs:
            f.write(json.dumps(r, ensure_ascii=False, separators=(',', ':')) + '\n')
    os.replace(tmp, out)
    log(f'Done. {len(recs):,} articles from {seen:,} pages ({skipped:,} skipped) in {int(time.time() - t0)} s.')
    log(f'File: {out} ({os.path.getsize(out) / 1e6:.1f} MB). In Lumen: Settings > Offline Wikipedia > Choose the pack file.')
    return header

# ---------------------------------------------------------------- download (with resume)
def download(url, dest, log=print):
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    have = os.path.getsize(dest) if os.path.exists(dest) else 0
    req = urllib.request.Request(url, headers={'User-Agent': 'LumenWikiPackBuilder/1.0 (personal offline copy; contact: the person running it)'})
    if have:
        req.add_header('Range', f'bytes={have}-')
    try:
        resp = urllib.request.urlopen(req, timeout=60)
    except urllib.error.HTTPError as e:
        if e.code == 416:      # already complete
            log('The file is already downloaded.'); return dest
        raise
    total = int(resp.headers.get('Content-Length') or 0) + (have if resp.status == 206 else 0)
    if resp.status != 206:
        have = 0
    mode = 'ab' if resp.status == 206 else 'wb'
    log(f'Downloading {url}\n  to {dest}' + (f' (resuming at {have / 1e6:.0f} MB)' if have else ''))
    t0 = time.time(); got = have
    with open(dest, mode) as f:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            f.write(chunk); got += len(chunk)
            if total:
                sys.stdout.write(f'\r  {got / 1e6:,.0f} of {total / 1e6:,.0f} MB ({100 * got / total:.0f}%)')
                sys.stdout.flush()
    sys.stdout.write('\n')
    if total and got < total:
        raise RuntimeError('The download stopped early. Run the same command again and it will carry on.')
    return dest

# ---------------------------------------------------------------- self test
SAMPLES = [
    ("'''Albert Einstein''' ({{IPAc-en|ˈ|aɪ|n|s|t|aɪ|n}}; 14 March 1879 – 18 April 1955) was a German-born [[theoretical physics|theoretical physicist]].<ref name=a>Pais 1982</ref> He developed the [[theory of relativity]].{{cite web|url=http://x|title=y}}\n[[File:Einstein 1921.jpg|thumb|Einstein in [[1921]]]]\n== Life ==\nHe was born in the German city of [[Ulm]] in 1879.\n== References ==\n{{reflist}}", ['Albert Einstein', 'theoretical physicist', 'theory of relativity', 'He was born in the German city of Ulm in 1879.'], ['cite web', 'File:', 'Pais', 'reflist', "'''", 'IPAc']),
    ("{{Infobox planet\n| name = Mars\n| radius = {{convert|3389.5|km|mi}}\n}}\n'''Mars''' is the fourth [[planet]] from the [[Sun]], about {{convert|228|e6km|e6mi}} away.\n{| class=\"wikitable\"\n|-\n! A !! B\n|}\n", ['Mars is the fourth planet from the Sun, about 228 e6km away.'], ['Infobox', 'wikitable', '|-', 'radius']),
    ("'''Marie Curie''' (born {{birth date|1867|11|7}}) was a physicist. See [http://example.org the site] too.[http://a.org]\n* A list item that is quite long and has many words in it for the test to keep it here.\n* short\n\n== External links ==\n* [http://zzz.org z]", ['born 7 November 1867', 'was a physicist', 'the site'], ['http', 'External', 'short', 'zzz']),
]

def selftest():
    for raw, must, mustnot in SAMPLES:
        out = clean_wikitext(raw)
        for m in must:
            assert m in out, f'missing {m!r} in {out!r}'
        for m in mustnot:
            assert m not in out, f'unexpected {m!r} in {out!r}'
    assert not keep_title('List of rivers') and not keep_title('Foo (disambiguation)') and keep_title('Photosynthesis')
    long = 'Word. ' * 1000
    assert len(clean_wikitext(long, 500)) <= 520
    import tempfile
    d = tempfile.mkdtemp()
    redir = '<redirect title="Mars" />'
    items = [
        ('Mars', 0, False, SAMPLES[1][0] + ' ' + 'Mars has two small moons, Phobos and Deimos, and a thin atmosphere. ' * 5),
        ('Old name', 0, True, '#REDIRECT [[Mars]]'),
        ('Talk:Mars', 1, False, 'x' * 800),
        ('Mercury', 0, False, "{{disambiguation}} \'\'\'Mercury\'\'\' may refer to: " + 'x ' * 400),
        ('Tiny', 0, False, 'Short.'),
    ]
    parts = []
    for i, (t, ns, red, tx) in enumerate(items):
        parts.append('<page><title>%s</title><ns>%d</ns><id>%d</id>%s<revision><text>%s</text></revision></page>' % (t, ns, i, redir if red else '', html.escape(tx)))
    xml = '<mediawiki xmlns="http://www.mediawiki.org/xml/export-0.11/">' + ''.join(parts) + '</mediawiki>'
    p = os.path.join(d, 'x.xml')
    open(p, 'w', encoding='utf-8').write(xml)
    out = os.path.join(d, 'pack.jsonl.gz')
    quiet = lambda *a: None
    hdr = build(p, out, 0, 2000, 100, False, None, log=quiet)
    with gzip.open(out, 'rt', encoding='utf-8') as f:
        rows = [json.loads(x) for x in f]
    assert rows[0]['lumenWiki'] == 1 and rows[0]['count'] == 1 and rows[1]['t'] == 'Mars', rows[:2]
    print('selftest ok: the page cleaner and the pack writer work on this computer.')

def main():
    ap = argparse.ArgumentParser(description='Build the offline Wikipedia pack for Lumen.', formatter_class=argparse.ArgumentDefaultsHelpFormatter)
    ap.add_argument('--download', choices=sorted(DUMPS), help='download a dump first (simple = Simple English Wikipedia, about 350 MB; en = English Wikipedia, about 23 GB)')
    ap.add_argument('--dump', help='a dump file you already have (.xml.bz2, .xml.gz or .xml)')
    ap.add_argument('--out', default='lumen-wiki-pack.jsonl.gz', help='the file to write')
    ap.add_argument('--max-articles', type=int, default=0, help='keep only the N longest articles (0 = keep all; for the full English dump use 100000)')
    ap.add_argument('--max-chars', type=int, default=2000, help='text kept per article')
    ap.add_argument('--min-chars', type=int, default=250, help='skip articles with less text than this')
    ap.add_argument('--keep-lists', action='store_true', help='also keep "List of ..." pages')
    ap.add_argument('--only-titles', help='a text file with one article title per line: keep only these')
    ap.add_argument('--selftest', action='store_true', help='check the script on built-in samples (no internet needed)')
    a = ap.parse_args()
    if a.selftest:
        selftest(); return
    dump, lang = a.dump, 'en'
    if a.download:
        url, name, lang = DUMPS[a.download]
        dump = download(url, os.path.join('wikipack-work', name))
    if not dump:
        ap.error('give --download simple, or --dump FILE')
    if not os.path.exists(dump):
        ap.error(f'no such file: {dump}')
    print(f'Reading {dump}. This takes a while; you can stop with Ctrl+C and nothing is changed.')
    build(dump, a.out, a.max_articles, a.max_chars, a.min_chars, a.keep_lists, a.only_titles, lang=('simple' if 'simplewiki' in dump else lang))

if __name__ == '__main__':
    main()
