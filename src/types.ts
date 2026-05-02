export type QuestionType = 'single' | 'multiple' | 'programming';

// 科目ID类型
export type SubjectId = 'chinese' | 'math' | 'english' | 'python' | string;

// 自定义科目ID前缀
export const CUSTOM_SUBJECT_PREFIX = 'custom_';

// 最大科目数量限制
export const MAX_OWN_SUBJECTS = 10;    // 自有科目最大数量
export const MAX_SHARED_SUBJECTS = 10;  // 共享科目最大数量
export const MAX_CUSTOM_SUBJECTS = MAX_OWN_SUBJECTS + MAX_SHARED_SUBJECTS; // 兼容旧代码

export interface Subject {
  id: SubjectId;
  name: string;
  icon: string;
  welcomeTitle: string;
  welcomeDesc: string;
  isCustom?: boolean;
  isEditable?: boolean;
  isShared?: boolean;
  shareScope?: 'none' | 'students' | 'all';
  isOwner?: boolean;
  isSubscribed?: boolean;
  subscriberCount?: number;
  shareCode?: string;
  creatorName?: string;
  subscriptionStatus?: 'pending' | 'approved' | 'rejected';
}

// 默认科目列表（所有科目统一管理，均可编辑/删除，但至少保留1个）
export const DEFAULT_SUBJECTS: Subject[] = [
  { 
    id: 'chinese', 
    name: '语文考试', 
    icon: '✍️', 
    welcomeTitle: '笔下生花，文以载道', 
    welcomeDesc: '涵盖古诗词鉴赏、现代文阅读、文学常识与语言运用' 
  },
  { 
    id: 'math', 
    name: '数学考试', 
    icon: '🧮', 
    welcomeTitle: '以数启智，以理明思', 
    welcomeDesc: '从基础运算到逻辑推理，在数字间锤炼思维力量' 
  },
  { 
    id: 'english', 
    name: '英语考试', 
    icon: '🌐', 
    welcomeTitle: '语通世界，桥连八方', 
    welcomeDesc: '词汇、语法、阅读与写作，全方位提升英语能力' 
  },
  { 
    id: 'python', 
    name: 'Python 考试',
    icon: '💻',
    welcomeTitle: '代码如诗，逻辑为基',
    welcomeDesc: '从语法基础到函数进阶，用代码构建解决问题的能力',
  },
];

// 可选的图标列表 - 按学科分类
export const SUBJECT_ICONS: Record<string, string[]> = {
  '📖 语言文学': ['📖', '📜', '✍️', '📝', '🖋️', '📚', '🔤', '🗣️'],
  '🔢 数学': ['🧮', '📐', '📏', '➕', '➖', '✖️', '➗', '🔢'],
  '💻 信息技术': ['💻', '🖥️', '🐍', '🤖', '🌐', '🔗', '⚙️', '💾'],
  '🔬 自然科学': ['🔬', '🧪', '⚗️', '🔭', '⚛️', '🧬', '🦠', '⚡'],
  '🌍 地理': ['🌍', '🗺️', '🏔️', '🌊', '🌋', '🏜️', '🌲', '🌸'],
  '🏛️ 历史政治': ['🏛️', '🗿', '⚔️', '🛡️', '👑', '⚖️', '📜', '🎖️'],
  '🎵 艺术体育': ['🎵', '🎶', '🎨', '🎭', '⚽', '🏀', '🏃', '🎾'],
  '🧠 社会科学': ['🧠', '💭', '💰', '📊', '📈', '🏥', '💊', '🔧'],
  '🎯 综合': ['🎯', '💡', '⭐', '🔥', '🏆', '🌟', '🎁', '✨'],
};

// 所有图标扁平列表（用于默认选择器）
export const SUBJECT_ICONS_ALL = Object.values(SUBJECT_ICONS).flat();

// 科目名称智能推荐映射
export interface SubjectSuggestion {
  icon: string;
  welcomeTitle: string;
  welcomeDesc: string;
}

const SUBJECT_KEYWORD_MAP: Array<{ keywords: string[]; suggestion: SubjectSuggestion }> = [
  { keywords: ['语文', '中文', '文学', '古文', '作文', '阅读'], suggestion: { icon: '✍️', welcomeTitle: '笔下生花，文以载道', welcomeDesc: '涵盖古诗词鉴赏、现代文阅读、文学常识与语言运用' } },
  { keywords: ['数学', '算术', '代数', '几何', '概率', '统计'], suggestion: { icon: '🧮', welcomeTitle: '以数启智，以理明思', welcomeDesc: '从基础运算到逻辑推理，在数字间锤炼思维力量' } },
  { keywords: ['英语', '英文', '外语', '翻译'], suggestion: { icon: '🌐', welcomeTitle: '语通世界，桥连天下', welcomeDesc: '词汇、语法、阅读与写作，全方位提升英语能力' } },
  { keywords: ['python', 'Python', '编程', '程序', '代码', '计算机', '信息技术', 'IT'], suggestion: { icon: '💻', welcomeTitle: '代码如诗，逻辑为基', welcomeDesc: '从语法基础到函数进阶，用代码构建解决问题的能力' } },
  { keywords: ['java', 'Java', 'JAVA'], suggestion: { icon: '☕', welcomeTitle: '一次编写，到处运行', welcomeDesc: '从面向对象到多线程并发，深入Java核心技术' } },
  { keywords: ['物理', '力学', '电磁', '光学', '热学'], suggestion: { icon: '🔬', welcomeTitle: '格物致知，探究万物之理', welcomeDesc: '从力学到电磁学，揭开自然运行的底层规律' } },
  { keywords: ['化学', '元素', '有机', '无机', '反应'], suggestion: { icon: '🧪', welcomeTitle: '化万物之变，学元素之妙', welcomeDesc: '探索元素周期表、化学反应与物质变换的奥秘' } },
  { keywords: ['生物', '细胞', '基因', '生态', '遗传'], suggestion: { icon: '🧬', welcomeTitle: '探索生命，解读自然密码', welcomeDesc: '从微观细胞到宏观生态，理解生命的运行逻辑' } },
  { keywords: ['历史', '古代', '近代', '近代史', '现代史', '战争'], suggestion: { icon: '🏛️', welcomeTitle: '以史为鉴，可知兴替', welcomeDesc: '纵览古今中外重大事件，在历史中汲取智慧' } },
  { keywords: ['地理', '地形', '气候', '水文', '人口'], suggestion: { icon: '🌍', welcomeTitle: '胸怀天下，纵横山河', welcomeDesc: '从山川地貌到人文风物，认识脚下的这颗星球' } },
  { keywords: ['政治', '法律', '法治', '制度', '宪法'], suggestion: { icon: '⚖️', welcomeTitle: '明法崇德，治国安邦', welcomeDesc: '理解政治制度、法律体系与公民权利义务' } },
  { keywords: ['音乐', '乐理', '乐器', '唱歌'], suggestion: { icon: '🎵', welcomeTitle: '乐音流转，心声共鸣', welcomeDesc: '从乐理基础到名曲鉴赏，感受音符的魅力' } },
  { keywords: ['美术', '绘画', '素描', '色彩', '设计', '书法'], suggestion: { icon: '🎨', welcomeTitle: '丹青妙笔，以美育人', welcomeDesc: '探索绘画技法、色彩理论与艺术鉴赏' } },
  { keywords: ['体育', '运动', '健身', '球类', '田径'], suggestion: { icon: '🏃', welcomeTitle: '强健体魄，超越自我', welcomeDesc: '涵盖运动技能、体育常识与健康知识' } },
  { keywords: ['经济', '金融', '股票', '投资', '财政', '贸易'], suggestion: { icon: '💰', welcomeTitle: '经世济民，洞察市场', welcomeDesc: '理解经济运行规律、金融逻辑与商业思维' } },
  { keywords: ['心理', '行为', '认知', '情绪'], suggestion: { icon: '🧠', welcomeTitle: '读懂内心，理解行为', welcomeDesc: '探索认知机制、情绪管理与行为科学' } },
  { keywords: ['医学', '卫生', '护理', '药理', '临床', '健康'], suggestion: { icon: '🏥', welcomeTitle: '医者仁心，守护健康', welcomeDesc: '了解基础医学、常见疾病预防与健康常识' } },
  { keywords: ['哲学', '逻辑', '伦理', '思辨'], suggestion: { icon: '💭', welcomeTitle: '思辨万物，追问本源', welcomeDesc: '从苏格拉底到存在主义，在思辨中寻找答案' } },
  { keywords: ['天文', '宇宙', '星系', '行星'], suggestion: { icon: '🔭', welcomeTitle: '仰望星空，探索宇宙', welcomeDesc: '从太阳系到深空宇宙，揭开星辰的奥秘' } },
  { keywords: ['日语', '日本语', '日文'], suggestion: { icon: '🗾', welcomeTitle: '和风细语，日语之道', welcomeDesc: '从假名到会话，系统提升日语综合能力' } },
  { keywords: ['法语', '法文'], suggestion: { icon: '🗼', welcomeTitle: '浪漫之语，自由之声', welcomeDesc: '从发音到表达，走进法语的语言与文化世界' } },
  { keywords: ['韩语', '韩国语', '朝鲜语'], suggestion: { icon: '🇰🇷', welcomeTitle: '韩韵悠悠，语言启航', welcomeDesc: '从韩文拼写到日常会话，开启韩语学习之路' } },
  { keywords: ['会计', '财务', '审计', '税务'], suggestion: { icon: '📊', welcomeTitle: '账目分明，财务有据', welcomeDesc: '掌握财务会计、管理会计与审计核心要点' } },
  { keywords: ['管理', '运营', '项目', '领导'], suggestion: { icon: '📈', welcomeTitle: '运筹帷幄，卓越管理', welcomeDesc: '从组织行为到战略决策，构建管理体系' } },
  { keywords: ['机械', '工程', '制造', '设计图'], suggestion: { icon: '🔧', welcomeTitle: '精工巧制，匠心铸就', welcomeDesc: '涵盖机械原理、材料力学与工程制图' } },
  { keywords: ['电子', '电路', '信号', '嵌入式'], suggestion: { icon: '⚡', welcomeTitle: '电通万物，芯连未来', welcomeDesc: '从电路原理到信号处理，掌握电子技术核心' } },
  { keywords: ['建筑', '结构', '规划', '施工'], suggestion: { icon: '🏗️', welcomeTitle: '筑梦空间，结构之美', welcomeDesc: '涵盖建筑设计、结构力学与城市规划' } },
  { keywords: ['教育', '教学', '课程', '师范'], suggestion: { icon: '📚', welcomeTitle: '传道授业，启智润心', welcomeDesc: '理解教育理论、教学方法与育人理念' } },
];

export function suggestSubject(name: string): SubjectSuggestion | null {
  if (!name.trim()) return null;
  const trimmed = name.trim();
  // 精确匹配优先
  for (const entry of SUBJECT_KEYWORD_MAP) {
    if (entry.keywords.some(k => trimmed.toLowerCase() === k.toLowerCase())) {
      return entry.suggestion;
    }
  }
  // 模糊匹配
  for (const entry of SUBJECT_KEYWORD_MAP) {
    if (entry.keywords.some(k => trimmed.includes(k) || k.includes(trimmed))) {
      return entry.suggestion;
    }
  }
  // 通用默认
  return {
    icon: '📝',
    welcomeTitle: `${trimmed}知识测试`,
    welcomeDesc: `全面练习${trimmed}的核心知识点`,
  };
}

export interface Question {
  id: number;
  subject: SubjectId;
  type: QuestionType;
  title: string;
  code?: string;
  options?: string[];
  answer: string | string[];
  explanation?: string;
  points: number;
  input?: string; // For questions that mention specific input
}

export interface ExamResult {
  score: number;
  totalPoints: number;
  answers: Record<number, string | string[]>;
  correctness: Record<number, boolean>;
}

export interface AISettings {
  geminiKey?: string;
  deepseekKey?: string;
  qwenKey?: string;
  zhipuKey?: string;
  moonshotKey?: string;
  baichuanKey?: string;
  hunyuanKey?: string;
  ernieKey?: string;
  openrouterKey?: string;
  openrouterModel?: string; // 新增：OpenRouter动态模型
  customEndpoint?: string;
  customKey?: string;
}