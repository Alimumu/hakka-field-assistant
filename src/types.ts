export type Project = {
  id: string;
  name: string;
  location: string;
  dialectArea: string;
  createdAt: string;
  description?: string;
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
  hanzi?: string;
  word?: string;
  meaning?: string;
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
  audioMimeType?: string;
  audioSizeBytes?: number;
  audioPersisted: boolean;
  persistenceError?: string;
  durationMs?: number;
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
  source: 'local-fallback' | 'deepseek-adapter';
};

export type AppState = {
  projects: Project[];
  speakers: Speaker[];
  items: Item[];
  recordings: Recording[];
  aiSuggestions: AiSuggestionRecord[];
};
