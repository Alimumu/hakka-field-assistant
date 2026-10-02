export type ScenarioId = 'hakka_lian_du_bian_diao' | 'hakka_xiao_cheng_bian_diao';

export type Project = {
  id: string;
  name: string;
  location: string;
  dialectArea: string;
  createdAt: string;
  description?: string;
  scenarioId: ScenarioId;
  scenarioVersion: string;
  scenarioTitle: string;
};

export type Speaker = {
  id: string;
  projectId: string;
  code: string;
  gender?: string;
  birthplace?: string;
  currentResidence?: string;
  dialectPoint?: string;
  notes?: string;
  createdAt: string;
};

export type ItemStatus = 'pending' | 'recorded' | 'review' | 'completed';

export type Item = {
  id: string;
  projectId: string;
  code: string;
  templateCode?: string;
  scenarioId?: ScenarioId;
  isTemplateItem?: boolean;
  hanzi?: string;
  word?: string;
  prompt?: string;
  meaning?: string;
  targetContext?: string;
  changeType?: string;
  phonetic?: string;
  tone?: string;
  notes?: string;
  status: ItemStatus;
  createdAt: string;
};

export type RecordingStatus = 'pending' | 'valid' | 'retake';

export type Recording = {
  id: string;
  projectId: string;
  speakerId: string;
  itemId: string;
  fileName: string;
  audioBlobId?: string;
  audioDataUrl?: string;
  mimeType?: string;
  durationSec?: number;
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
  takeNumber?: number;
  scenarioId?: ScenarioId;
  itemCode?: string;
  createdAt: string;
  status: RecordingStatus;
  notes?: string;
};

export type AiSuggestionRecord = {
  id: string;
  projectId: string;
  createdAt: string;
  title: string;
  summary: string;
  tags: string[];
  recommendations: string[];
};

export type AppState = {
  projects: Project[];
  speakers: Speaker[];
  items: Item[];
  recordings: Recording[];
  aiSuggestions: AiSuggestionRecord[];
};
