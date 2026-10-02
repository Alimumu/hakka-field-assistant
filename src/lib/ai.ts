export type AiSuggestion = {
  title: string;
  summary: string;
  tags: string[];
  recommendations: string[];
  source: 'local-fallback' | 'deepseek-adapter';
};

export type AiSuggestionInput = {
  projectName: string;
  dialectArea: string;
  item?: {
    code?: string;
    hanzi?: string;
    word?: string;
    meaning?: string;
    notes?: string;
  };
  noteText: string;
};

export type AiAdapterConfig = {
  provider: 'local-fallback' | 'deepseek-proxy';
  proxyEndpoint?: string;
};

const LOCAL_FALLBACK_SOURCE: AiSuggestion['source'] = 'local-fallback';

const localFallbackSuggestion = ({ projectName, dialectArea, item, noteText }: AiSuggestionInput): AiSuggestion => {
  const normalized = noteText.trim();
  const tags: string[] = [];

  if (normalized.length > 0) {
    tags.push('现场备注已记录');
  }
  if (normalized.includes('重录')) {
    tags.push('需重录');
  }
  if (normalized.includes('噪声') || normalized.includes('风')) {
    tags.push('环境噪声');
  }
  if (normalized.includes('拖长') || normalized.includes('延长')) {
    tags.push('连读或延音');
  }
  if (normalized.includes('普通话')) {
    tags.push('受普通话干扰');
  }

  if (tags.length === 0) {
    tags.push('待人工核验');
  }

  const title = item ? `${item.code || '条目'} 的整理建议（本地）` : `${projectName} 的整理建议（本地）`;
  const summary = `这是离线本地规则引擎给出的回退建议。根据 ${projectName}（${dialectArea}）的备注线索，建议重点关注：${tags.join('、')}。`;

  return {
    title,
    summary,
    tags,
    source: LOCAL_FALLBACK_SOURCE,
    recommendations: [
      '先人工试听该条录音，确认音质与条目对应关系。',
      '若存在噪声或受普通话影响，建议现场补录并标记版本。',
      '后续可在后端接入 DeepSeek 代理（服务端持有密钥），前端无需存放任何密钥。',
    ],
  };
};

export const getAiSuggestion = (input: AiSuggestionInput, config: AiAdapterConfig = { provider: 'local-fallback' }): AiSuggestion => {
  if (config.provider === 'deepseek-proxy' && config.proxyEndpoint) {
    return {
      ...localFallbackSuggestion(input),
      source: 'deepseek-adapter',
      tags: ['DeepSeek 代理待接入', '当前使用本地回退'],
      summary: `已预留 DeepSeek 代理边界（${config.proxyEndpoint}），当前仍使用本地回退策略，保证离线可用。`,
    };
  }

  return localFallbackSuggestion(input);
};
