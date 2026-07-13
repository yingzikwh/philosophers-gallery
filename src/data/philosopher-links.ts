/**
 * 思想家外部参考链接解析器
 * ------------------------------------------------------------
 * 用途：为每位思想家生成准确的维基百科（中/英）、斯坦福哲学百科（SEP）、
 *       百度百科链接。对于默认名称无法直接命中的思想家，提供显式覆盖。
 */

export interface PhilosopherLinkOverride {
  /** 中文维基百科条目名（默认用 philosopher.name） */
  zhWiki?: string;
  /** 英文维基百科条目名（默认用 philosopher.nameEn） */
  enWiki?: string;
  /** SEP 直接条目 slug；若未提供或提供 null，则使用 SEP 搜索页 */
  sep?: string | null;
  /** 百度百科条目名（默认用 philosopher.name） */
  baidu?: string;
}

const OVERRIDES: Record<string, PhilosopherLinkOverride> = {
  // 集合/概念型思想家：默认名称不是真实条目
  upanishads: {
    zhWiki: '奥义书',
    enWiki: 'Upanishads',
    sep: null, // SEP 无直接条目，使用搜索
    baidu: '奥义书',
  },

  // 中文/东方思想家：部分需用完整名或英文名确保命中
  buddha: {
    zhWiki: '释迦牟尼',
    enWiki: 'Gautama_Buddha',
    sep: 'buddha',
    baidu: '释迦牟尼',
  },
  confucius: { zhWiki: '孔子', enWiki: 'Confucius', sep: 'confucius', baidu: '孔子' },
  laozi: { zhWiki: '老子', enWiki: 'Laozi', sep: 'laozi', baidu: '老子' },
  zhuangzi: { zhWiki: '庄子', enWiki: 'Zhuangzi', sep: 'zhuangzi', baidu: '庄子' },
  mencius: { zhWiki: '孟子', enWiki: 'Mencius', sep: 'mencius', baidu: '孟子' },
  xunzi: { zhWiki: '荀子', enWiki: 'Xunzi', sep: 'xunzi', baidu: '荀子' },
  mozi: { zhWiki: '墨子', enWiki: 'Mozi', sep: 'mohism', baidu: '墨子' },
  hanfei: { zhWiki: '韩非', enWiki: 'Han_Fei', sep: 'chinese-legalism', baidu: '韩非' },
  zhuxi: { zhWiki: '朱熹', enWiki: 'Zhu_Xi', sep: 'zhu-xi', baidu: '朱熹' },
  wangyangming: { zhWiki: '王阳明', enWiki: 'Wang_Yangming', sep: 'wang-yangming', baidu: '王阳明' },
  dong_zhongshu: { zhWiki: '董仲舒', enWiki: 'Dong_Zhongshu', sep: null, baidu: '董仲舒' },
  wang_fuzhi: { zhWiki: '王夫之', enWiki: 'Wang_Fuzhi', sep: null, baidu: '王夫之' },
  huineng: { zhWiki: '慧能', enWiki: 'Huineng', sep: null, baidu: '慧能' },

  // 印度哲学家
  nagarjuna: { zhWiki: '龙树', enWiki: 'Nagarjuna', sep: 'nagarjuna', baidu: '龙树' },
  shankara: { zhWiki: '商羯罗', enWiki: 'Adi_Shankara', sep: 'shankara', baidu: '商羯罗' },

  // 西方古代/中世纪
  socrates: { sep: 'socrates' },
  plato: { sep: 'plato' },
  aristotle: { sep: 'aristotle' },
  pyrrho: { sep: 'pyrrho', enWiki: 'Pyrrho' },
  epictetus: { sep: 'epictetus', enWiki: 'Epictetus' },
  marcus_aurelius: { enWiki: 'Marcus_Aurelius', sep: 'marcus-aurelius', baidu: '马可·奥勒留' },
  seneca: { enWiki: 'Seneca_the_Younger', sep: 'seneca', baidu: '塞内卡' },
  plotinus: { sep: 'plotinus', enWiki: 'Plotinus' },
  aquinas: { enWiki: 'Thomas_Aquinas', sep: 'aquinas' },
  augustine: { enWiki: 'Augustine_of_Hippo', sep: 'augustine' },

  // 西方近代/现代
  descartes: { enWiki: 'René_Descartes', sep: 'descartes' },
  locke: { enWiki: 'John_Locke', sep: 'locke' },
  hume: { enWiki: 'David_Hume', sep: 'hume' },
  spinoza: { enWiki: 'Baruch_Spinoza', sep: 'spinoza' },
  leibniz: { enWiki: 'Gottfried_Wilhelm_Leibniz', sep: 'leibniz' },
  kierkegaard: { enWiki: 'Søren_Kierkegaard', sep: 'kierkegaard' },
  mill: { enWiki: 'John_Stuart_Mill', sep: 'mill' },
  russell: { enWiki: 'Bertrand_Russell', sep: 'russell' },
  pascal: { enWiki: 'Blaise_Pascal', sep: 'pascal' },
  bentham: { enWiki: 'Jeremy_Bentham', sep: 'bentham' },
  berkeley: { enWiki: 'George_Berkeley', sep: 'berkeley' },
  rousseau: { enWiki: 'Jean-Jacques_Rousseau', sep: 'rousseau' },
  voltaire: { enWiki: 'Voltaire', sep: 'voltaire' },
  kant: { enWiki: 'Immanuel_Kant', sep: 'kant' },
  hegel: { enWiki: 'Georg_Wilhelm_Friedrich_Hegel', sep: 'hegel' },
  schopenhauer: { enWiki: 'Arthur_Schopenhauer', sep: 'schopenhauer' },
  nietzsche: { enWiki: 'Friedrich_Nietzsche', sep: 'nietzsche' },
  marx: { enWiki: 'Karl_Marx', sep: 'marx' },
  comte: { enWiki: 'Auguste_Comte', sep: 'comte' },
  feuerbach: { enWiki: 'Ludwig_Feuerbach', sep: 'ludwig-feuerbach' },
  bergson: { enWiki: 'Henri_Bergson', sep: 'bergson' },

  // 20 世纪
  heidegger: { enWiki: 'Martin_Heidegger', sep: 'heidegger' },
  wittgenstein: { enWiki: 'Ludwig_Wittgenstein', sep: 'wittgenstein' },
  camus: { enWiki: 'Albert_Camus', sep: 'camus' },
  foucault: { enWiki: 'Michel_Foucault', sep: 'foucault' },
  sartre: { enWiki: 'Jean-Paul_Sartre', sep: 'sartre' },
  beauvoir: { enWiki: 'Simone_de_Beauvoir', sep: 'beauvoir', baidu: '西蒙娜·德·波伏娃' },
  derrida: { enWiki: 'Jacques_Derrida', sep: 'derrida' },
  deleuze: { enWiki: 'Gilles_Deleuze', sep: 'deleuze' },
  adorno: { enWiki: 'Theodor_W._Adorno', sep: 'adorno' },
  arendt: { enWiki: 'Hannah_Arendt', sep: 'arendt', baidu: '汉娜·阿伦特' },
  rawls: { enWiki: 'John_Rawls', sep: 'rawls' },
  husserl: { enWiki: 'Edmund_Husserl', sep: 'husserl' },
};

export interface PhilosopherLinks {
  zhWiki: string;
  enWiki: string;
  sep: string;
  baidu: string;
}

export function getPhilosopherLinks(p: {
  id: string;
  name: string;
  nameEn: string;
}): PhilosopherLinks {
  const o = OVERRIDES[p.id] || {};

  const zhWikiTitle = o.zhWiki ?? p.name;
  const enWikiTitle = o.enWiki ?? p.nameEn;
  const baiduTitle = o.baidu ?? p.name;

  let sepUrl: string;
  if (o.sep === null) {
    // 显式指定无 SEP 直接条目，使用搜索
    sepUrl = `https://plato.stanford.edu/search/search?query=${encodeURIComponent(p.nameEn)}`;
  } else if (o.sep) {
    sepUrl = `https://plato.stanford.edu/entries/${o.sep}/`;
  } else {
    // 默认：尝试根据英文名生成 slug，并回退搜索页
    const slug = p.nameEn
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    sepUrl = `https://plato.stanford.edu/entries/${slug}/`;
  }

  return {
    zhWiki: `https://zh.wikipedia.org/wiki/${encodeURIComponent(zhWikiTitle)}`,
    enWiki: `https://en.wikipedia.org/wiki/${enWikiTitle.replace(/\s+/g, '_')}`,
    sep: sepUrl,
    baidu: `https://baike.baidu.com/item/${encodeURIComponent(baiduTitle)}`,
  };
}
