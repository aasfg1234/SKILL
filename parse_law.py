"""
parse_law.py — 修正版
覆蓋原檔：reg_bankonly/parse_law.py（原始版本反組譯自 parse_law_cpython-312.pyc）

本次修正的 4 個問題：
  1. [致命] 續行 key 重複：原版 else 分支只清空 sub，k 沒清，導致同一款/目下
     每一條續行都撞同一個 key。已改為「非新單位就併回上一筆」。
  2. [連帶] 上述 bug 同時把但書從主文腰斬成獨立列，法律語意被切斷。
     併列後但書會留在同一筆 t 裡，交給後續 CSV 判讀階段照 prompt 規則拆列。
  3. 抓不到條文（HTML 改版/來源不完整）原本會靜默回傳空 list，改為直接 raise。
  4. 新增：章節結構擷取、條號序列輸出（供跳號/缺條檢查用）。
"""

import re
import json
import html
from pathlib import Path


CHAPTER_RE = re.compile(r'第([一二三四五六七八九十百]+)章[　\s]*([^<\n]{0,40})')
ARTICLE_RE = re.compile(
    r'<a href="LawSingle.aspx\?pcode=[^" ]+" name="([\d-]+)">.*?</a>'
    r'</div><div class="col-data"><div class="law-article">(.*?)</div>\s*</div></div>',
    re.S,
)
LINE_RE = re.compile(r'<div class="(line-\d+)[^"]*">(.*?)(?=</div>|$)', re.S)
KUAN_RE = re.compile(r'^[一二三四五六七八九十百]+、')
MU_RE = re.compile(r'^（[一二三四五六七八九十]+）')


def _chapter_index(text):
    return [(m.start(), f"第{m.group(1)}章 {m.group(2).strip()}") for m in CHAPTER_RE.finditer(text)]


def _chapter_for(chapters, pos):
    cur = ''
    for cpos, label in chapters:
        if cpos <= pos:
            cur = label
        else:
            break
    return cur


def _article_sort_key(a):
    # 條號格式如 "35" 或 "35-1"，用數字序排序，非數字格式排到最後
    parts = a.split('-')
    if all(p.isdigit() for p in parts):
        return (0, tuple(int(p) for p in parts))
    return (1, a)


def parse(path):
    text = Path(path).read_text(encoding='utf-8-sig')

    chapters = _chapter_index(text)

    matches = list(ARTICLE_RE.finditer(text))
    if not matches:
        raise ValueError(
            f'抓不到任何條文：{path} 的 HTML 結構與預期 pattern 不符，'
            f'可能是網站改版、存檔不完整，或根本存錯檔案。請重新確認來源，不要靜默放行。'
        )

    arts = []
    for m in matches:
        a, body = m.groups()
        units = []
        p = 0
        k = ''

        for line in LINE_RE.finditer(body):
            cls, raw = line.groups()
            t = re.sub('<[^>]+>', '', html.unescape(raw)).strip()

            if cls == 'line-0000':
                p += 1
                k = ''
                sub = ''
                is_new_unit = True
            elif KUAN_RE.match(t):
                k = t.split('、')[0]
                sub = ''
                is_new_unit = True
            elif MU_RE.match(t):
                sub = t.split('）')[0][1:]
                is_new_unit = True
            else:
                # 續行：不是款、不是目、也不是新條號起點 -> 併回上一筆，不新增列
                is_new_unit = False

            if is_new_unit or not units:
                units.append(dict(
                    a=a, p=p, k=k, sub=sub, t=t, cls=cls,
                    key=f'{a}.{p}.{k}.{sub}',
                ))
            else:
                units[-1]['t'] = (units[-1]['t'] + t).strip()

        arts.append(dict(a=a, chapter=_chapter_for(chapters, m.start()), units=units))

    return arts


if __name__ == '__main__':
    arts = parse('law_source.html')

    all_units = [u for a in arts for u in a['units']]
    all_keys = [u['key'] for u in all_units]

    art_numbers = sorted({a['a'] for a in arts}, key=_article_sort_key)

    Path('law_units.json').write_text(
        json.dumps(
            dict(ARTICLES=arts, ARTICLE_COUNT=len(arts), UNIT_COUNT=len(all_units),
                 ARTICLE_NUMBERS=art_numbers),
            ensure_ascii=False, indent=2,
        ),
        encoding='utf-8',
    )

    for a in arts:
        for u in a['units']:
            print(u['key'] + ' ' + u['t'])

    print()
    print('ARTICLES', len(arts), 'UNITS', len(all_units))
    print('條號序列:', art_numbers)

    dup_keys = {k for k in all_keys if all_keys.count(k) > 1}
    if dup_keys:
        print('⚠ 仍有重複 key（理論上不該發生，出現代表併列邏輯漏了某種續行樣式）:', dup_keys)
    else:
        print('key 唯一性檢查: 通過')
