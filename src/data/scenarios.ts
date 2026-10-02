import type { Item, ScenarioId } from '../types';

export type ScenarioTemplateItem = {
  code: string;
  prompt: string;
  hanzi: string;
  word: string;
  meaning: string;
  targetContext: string;
  changeType: string;
  phoneticPlaceholder: string;
  notes: string;
};

export type ScenarioDefinition = {
  id: ScenarioId;
  title: string;
  version: string;
  description: string;
  instructions: string[];
  templateLabel: string;
  items: ScenarioTemplateItem[];
};

export const SCENARIO_DEFINITIONS: Record<ScenarioId, ScenarioDefinition> = {
  hakka_lian_du_bian_diao: {
    id: 'hakka_lian_du_bian_diao',
    title: '客家话连读变调',
    version: '2026.10-v1',
    templateLabel: '研究模板（可编辑）',
    description: '主场景：围绕引文调与连读语流中的调值变化进行配对采录。以下为通用模板，不预设具体客家方言结论。',
    instructions: [
      '先录引文形式，再录连读语境形式，便于对比。',
      '每个条目建议至少两次录音，标记最佳一条为有效。',
      '音标与调值字段留作研究占位，请按实际材料补充。',
    ],
    items: [
      { code: 'LS01-CIT', prompt: '单说：天光', hanzi: '天光', word: '天光', meaning: '天亮/早晨', targetContext: '引文形式（单独说）', changeType: '引文调基线', phoneticPlaceholder: '[待填 IPA]', notes: '先慢读两次' },
      { code: 'LS01-CON', prompt: '句中：天光就出门', hanzi: '天光就出门', word: '天光就出门', meaning: '天亮就出门', targetContext: '连读语境（句中）', changeType: '连读变调对比 LS01-CIT', phoneticPlaceholder: '[待填 IPA]', notes: '自然语速再读两次' },
      { code: 'LS02-CIT', prompt: '单说：学生', hanzi: '学生', word: '学生', meaning: '学生', targetContext: '引文形式（单独说）', changeType: '引文调基线', phoneticPlaceholder: '[待填 IPA]', notes: '注意首音节' },
      { code: 'LS02-CON', prompt: '句中：学生都来了', hanzi: '学生都来了', word: '学生都来了', meaning: '学生都来了', targetContext: '连读语境（句中）', changeType: '连读变调对比 LS02-CIT', phoneticPlaceholder: '[待填 IPA]', notes: '保持同一说话风格' },
      { code: 'LS03-CIT', prompt: '单说：米粉', hanzi: '米粉', word: '米粉', meaning: '米粉', targetContext: '引文形式（单独说）', changeType: '引文调基线', phoneticPlaceholder: '[待填 IPA]', notes: '可先示范普通语速' },
      { code: 'LS03-CON', prompt: '短语：买米粉', hanzi: '买米粉', word: '买米粉', meaning: '买米粉', targetContext: '连读语境（短语）', changeType: '连读变调对比 LS03-CIT', phoneticPlaceholder: '[待填 IPA]', notes: '短语连续说' },
      { code: 'LS04-CIT', prompt: '单说：黄梨', hanzi: '黄梨', word: '黄梨', meaning: '菠萝', targetContext: '引文形式（单独说）', changeType: '引文调基线', phoneticPlaceholder: '[待填 IPA]', notes: '可多录一条备份' },
      { code: 'LS04-CON', prompt: '句中：黄梨真甜', hanzi: '黄梨真甜', word: '黄梨真甜', meaning: '菠萝很甜', targetContext: '连读语境（句中）', changeType: '连读变调对比 LS04-CIT', phoneticPlaceholder: '[待填 IPA]', notes: '自然语流，不要刻意断句' },
    ],
  },
  hakka_xiao_cheng_bian_diao: {
    id: 'hakka_xiao_cheng_bian_diao',
    title: '小称变调',
    version: '2026.10-v1',
    templateLabel: '研究模板（可编辑）',
    description: '次场景：围绕名词及小称结构中的音调变化采录。以下为通用模板，不预设具体客家方言结论。',
    instructions: [
      '先录基础词，再录带小称形式（如“X仔/小X”等本地常用形式）。',
      '记录语义与语用差异，避免只做机械重复。',
      '调类变化字段用于后续人工分析，当前不自动判断。',
    ],
    items: [
      { code: 'DIM01-BASE', prompt: '基础词：狗', hanzi: '狗', word: '狗', meaning: '狗（基础词）', targetContext: '基础形式', changeType: '基础调记录', phoneticPlaceholder: '[待填 IPA]', notes: '基础词先录两遍' },
      { code: 'DIM01-DIM', prompt: '小称：狗仔/小狗（按当地说法）', hanzi: '狗仔（示例）', word: '狗仔', meaning: '小狗（小称）', targetContext: '小称形式', changeType: '小称变调对比 DIM01-BASE', phoneticPlaceholder: '[待填 IPA]', notes: '按受访者自然说法' },
      { code: 'DIM02-BASE', prompt: '基础词：桌', hanzi: '桌', word: '桌', meaning: '桌子（基础词）', targetContext: '基础形式', changeType: '基础调记录', phoneticPlaceholder: '[待填 IPA]', notes: '确认词义一致' },
      { code: 'DIM02-DIM', prompt: '小称：桌仔/小桌（按当地说法）', hanzi: '桌仔（示例）', word: '桌仔', meaning: '小桌子（小称）', targetContext: '小称形式', changeType: '小称变调对比 DIM02-BASE', phoneticPlaceholder: '[待填 IPA]', notes: '可引导进句中表达' },
      { code: 'DIM03-BASE', prompt: '基础词：碗', hanzi: '碗', word: '碗', meaning: '碗（基础词）', targetContext: '基础形式', changeType: '基础调记录', phoneticPlaceholder: '[待填 IPA]', notes: '控制说话语速' },
      { code: 'DIM03-DIM', prompt: '小称：碗仔/小碗（按当地说法）', hanzi: '碗仔（示例）', word: '碗仔', meaning: '小碗（小称）', targetContext: '小称形式', changeType: '小称变调对比 DIM03-BASE', phoneticPlaceholder: '[待填 IPA]', notes: '若有变体可附注' },
      { code: 'DIM04-BASE', prompt: '基础词：妹', hanzi: '妹', word: '妹', meaning: '妹妹/女孩（基础词）', targetContext: '基础形式', changeType: '基础调记录', phoneticPlaceholder: '[待填 IPA]', notes: '注意亲昵称呼语境' },
      { code: 'DIM04-DIM', prompt: '小称：妹仔/小妹（按当地说法）', hanzi: '妹仔（示例）', word: '妹仔', meaning: '小妹（小称）', targetContext: '小称形式', changeType: '小称变调对比 DIM04-BASE', phoneticPlaceholder: '[待填 IPA]', notes: '建议句中再录一遍' },
    ],
  },
};

export const SCENARIOS = Object.values(SCENARIO_DEFINITIONS);

export const createItemsFromScenario = (projectId: string, scenario: ScenarioDefinition, now = new Date().toISOString()): Item[] =>
  scenario.items.map((entry) => ({
    id: crypto.randomUUID(),
    projectId,
    code: entry.code,
    templateCode: entry.code,
    scenarioId: scenario.id,
    isTemplateItem: true,
    hanzi: entry.hanzi,
    word: entry.word,
    prompt: entry.prompt,
    meaning: entry.meaning,
    targetContext: entry.targetContext,
    changeType: entry.changeType,
    phonetic: entry.phoneticPlaceholder,
    notes: entry.notes,
    status: 'pending',
    createdAt: now,
  }));
