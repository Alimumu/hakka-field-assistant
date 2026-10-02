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
  status: 'pending' | 'recorded' | 'review' | 'completed';
  createdAt: string;
};

export type Recording = {
  id: string;
  projectId: string;
  speakerId: string;
  itemId: string;
  fileName: string;
  audioDataUrl: string;
  createdAt: string;
  status: 'pending' | 'valid' | 'retake';
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
