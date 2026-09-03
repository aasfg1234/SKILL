import { describe, expect, it } from 'vitest';
import { changeIndent, formatListLines } from '../model/textList';

describe('多層項目符號', () => {
  it('行首的 Tab 會變成下一層，符號跟著換', () => {
    const lines = formatListLines('第一層\n\t第二層\n\t\t第三層', 'bullet');

    expect(lines.map((l) => l.level)).toEqual([0, 1, 2]);
    expect(lines.map((l) => l.marker)).toEqual(['•', '◦', '▪']);
  });

  it('縮排用的 Tab 不會顯示在文字裡', () => {
    const lines = formatListLines('\t縮排的字', 'bullet');

    expect(lines[0].text).toBe('縮排的字');
  });

  it('超過第三層仍然沿用第三層的符號', () => {
    const lines = formatListLines('\t\t\t\t很深', 'bullet');

    expect(lines[0].marker).toBe('▪');
  });

  it('編號清單第二層改用英文字母，回到第一層時接續原本的號碼', () => {
    const lines = formatListLines('一\n\t子項\n\t子項\n二', 'number');

    expect(lines.map((l) => l.marker)).toEqual(['1.', 'a.', 'b.', '2.']);
  });

  it('沒有條列樣式時，Tab 仍然算縮排層級', () => {
    const lines = formatListLines('\t縮排', 'none');

    expect(lines[0].level).toBe(1);
    expect(lines[0].marker).toBe('');
  });
});

describe('用 Tab 調整縮排', () => {
  it('Tab 會在游標所在行的行首加一層', () => {
    const next = changeIndent('第一行\n第二行', 4, 4, 1);

    expect(next.text).toBe('第一行\n\t第二行');
  });

  it('Shift+Tab 會把一層縮排拿掉', () => {
    const next = changeIndent('\t第一行', 3, 3, -1);

    expect(next.text).toBe('第一行');
  });

  it('已經在最外層時，Shift+Tab 不會改變文字', () => {
    const next = changeIndent('第一行', 1, 1, -1);

    expect(next.text).toBe('第一行');
  });

  it('選取多行時，每一行都會一起縮排', () => {
    const next = changeIndent('一\n二\n三', 0, 3, 1);

    expect(next.text).toBe('\t一\n\t二\n三');
  });

  it('縮排後游標會跟著往後移，不會跳到別的地方', () => {
    const next = changeIndent('一', 1, 1, 1);

    expect(next.selectionStart).toBe(2);
    expect(next.selectionEnd).toBe(2);
  });
});
