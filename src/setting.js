// Narrative locations, not surveyed coordinates. See WORLD-REFERENCE.md for
// historical sources and the limits of these compressed, separately authored maps.
const CHAPTER_LOCATIONS = Object.freeze({
  1: '摩加迪沙 · Bakara 市场周边居民区',
  2: '摩加迪沙机场西端 · 特遣队基地',
  3: '摩加迪沙机场西端 · 行动简报与登机集合区',
  4: '摩加迪沙 · Olympic Hotel 附近的索降街区',
  5: 'Bakara 市场周边 · 目标建筑外的车队集合点',
  6: 'Olympic Hotel 东北方向 · 第一坠机点外围',
  7: 'Bakara 市场周边 · 通往第一坠机点的街巷',
  8: '摩加迪沙城内 · 受阻的车队撤离路线',
  9: '行动区南侧 · 第二坠机点',
  10: '行动区南侧 · 第二坠机点',
  11: '第一坠机点附近 · 伤员收容处',
  12: '第一坠机点附近 · 夜间防守街区',
  13: '摩加迪沙城内 · 联合救援车队进城路线',
  14: '第一坠机点 · 机组与伤员交接区',
  15: '第一坠机点外 · 通往接应车队的撤离路段',
  16: '摩加迪沙机场基地 · 人员清点与救护区',
});

export function chapterLocation(chapterId) {
  return CHAPTER_LOCATIONS[chapterId] || '索马里 · 摩加迪沙';
}
