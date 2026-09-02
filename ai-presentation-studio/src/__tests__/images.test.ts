import { describe, expect, it } from 'vitest';
import { fitImageIntoSlide, pickImageFromFiles } from '../lib/images';

describe('拖放與貼上圖片', () => {
  it('大圖會等比例縮到投影片的七成以內', () => {
    expect(fitImageIntoSlide({ width: 4000, height: 3000 }, { width: 1920, height: 1080 })).toEqual({
      width: 1008,
      height: 756,
    });
  });

  it('很寬的圖以寬度為準縮放', () => {
    expect(fitImageIntoSlide({ width: 3000, height: 500 }, { width: 1920, height: 1080 })).toEqual({
      width: 1344,
      height: 224,
    });
  });

  it('小圖維持原尺寸，不會被放大', () => {
    expect(fitImageIntoSlide({ width: 400, height: 300 }, { width: 1920, height: 1080 })).toEqual({
      width: 400,
      height: 300,
    });
  });

  it('從拖放的檔案裡挑出第一個圖片', () => {
    const files = [
      { name: 'note.txt', type: 'text/plain' },
      { name: 'photo.png', type: 'image/png' },
      { name: 'other.jpg', type: 'image/jpeg' },
    ] as File[];

    expect(pickImageFromFiles(files)?.name).toBe('photo.png');
  });

  it('沒有圖片時回傳 null', () => {
    const files = [{ name: 'note.txt', type: 'text/plain' }] as File[];

    expect(pickImageFromFiles(files)).toBeNull();
  });
});
