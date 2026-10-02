export type AiSuggestion = {
  title: string;
  summary: string;
  tags: string[];
  recommendations: string[];
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

export const generateAiSuggestion = ({ projectName, dialectArea, item, noteText }: AiSuggestionInput): AiSuggestion => {
  const normalized = noteText.trim();
  const tags: string[] = [];

  if (normalized.length > 0) {
    tags.push('现场备注已记录');
  }
  if (normalized.toLowerCase().includes('重录') || normalized.toLowerCase().includes('重录')) {
    tags.push('需重录');
  }
  if (normalized.toLowerCase().includes('噪声') || normalized.toLowerCase().includes('风')) {
    tags.push('环境噪声');
  }
  if (normalized.toLowerCase().includes('拖长') || normalized.toLowerCase().includes('延长')) {
    tags.push('连读或延音');
  }
  if (normalized.toLowerCase().includes('普通话')) {
    tags.push('受普通话干扰');
  }

  if (tags.length === 0) {
    tags.push('待人工核验');
  }

  const title = item ? `${item.code || '条目'} 的调查建议` : `${projectName} 的AI整理建议`;
  const summary = `根据 ${projectName} 中${dialectArea}的现场记录，建议优先检查该条目的语音稳定性与发音环境。当前备注中存在 ${tags.join('、')} 这样的线索，适合进一步核验。`;

  return {
    title,
    summary,
    tags,
    recommendations: [
      '确认该采录是否为最佳版本，必要时补录一遍。',
      '检查备注中是否存在环境噪声、普通话干扰或语流音变特征。',
      '如果该条目重要且存在明显重音/延音，建议再做一次人工核验。',
    ],
  };
};
