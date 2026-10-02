import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { SCENARIO_DEFINITIONS, SCENARIOS, createItemsFromScenario } from './data/scenarios';
import { generateAiSuggestion, type AiSuggestion } from './lib/ai';
import { getAudioBlob, saveAudioBlob } from './lib/audioStore';
import { loadAppState, persistAppState } from './lib/storage';
import { encodePcm16Wav } from './lib/wav';
import type { AppState, Item, ItemStatus, Project, Recording, ScenarioId, Speaker } from './types';

const DEFAULT_SCENARIO_ID: ScenarioId = 'hakka_lian_du_bian_diao';
const defaultProjectName = '新调查项目';

type ResourceModuleId = 'scenes' | 'dialectPoints' | 'projects';

type MockScene = {
  id: string;
  title: string;
  kind: '内置场景' | '研发占位';
  status: '可用' | '原型占位';
  description: string;
};

type MockDialectPoint = {
  id: string;
  name: string;
  level: string;
  location: string;
  status: string;
  speakers: number;
};

type MockProjectCard = {
  id: string;
  name: string;
  dialectPoint: string;
  scenario: string;
  status: string;
  speakerCount: number;
  recordingProgress: string;
  wavStatus: string;
  praatStatus: string;
};

const MOCK_SCENES: MockScene[] = [
  {
    id: 'builtin-lian-du',
    title: '连读变调',
    kind: '内置场景',
    status: '可用',
    description: '主场景模板，展示引文调与连读语境的配对采录结构。',
  },
  {
    id: 'builtin-xiao-cheng',
    title: '小称变调',
    kind: '内置场景',
    status: '可用',
    description: '次场景模板，展示基础词与小称形式的对比采录结构。',
  },
  {
    id: 'builtin-dan-zi',
    title: '单字调',
    kind: '内置场景',
    status: '原型占位',
    description: '资源管理原型中的内置场景占位，用于后续补齐场景模板与条目结构。',
  },
];

const MOCK_DIALECT_POINTS: MockDialectPoint[] = [
  { id: 'dp-meixian', name: '梅县区（示例）', level: '核心点', location: '广东省梅州市梅县区', status: '调查中', speakers: 3 },
  { id: 'dp-xingning', name: '兴宁（示例）', level: '扩展点', location: '广东省梅州市兴宁市', status: '待启动', speakers: 0 },
  { id: 'dp-wuhua', name: '五华（示例）', level: '扩展点', location: '广东省梅州市五华县', status: '已建档', speakers: 1 },
];

const MOCK_PROJECT_CARDS: MockProjectCard[] = [
  {
    id: 'proj-001',
    name: '梅县连读变调首轮调查',
    dialectPoint: '梅县区（示例）',
    scenario: '连读变调',
    status: '进行中',
    speakerCount: 3,
    recordingProgress: '18 / 40',
    wavStatus: '已启用 WAV',
    praatStatus: '待补 TextGrid',
  },
  {
    id: 'proj-002',
    name: '兴宁小称变调摸底',
    dialectPoint: '兴宁（示例）',
    scenario: '小称变调',
    status: '准备中',
    speakerCount: 0,
    recordingProgress: '0 / 24',
    wavStatus: '未开始',
    praatStatus: '未开始',
  },
];

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [prefix, base64] = dataUrl.split(',');
  const mime = prefix.match(/data:(.*?);base64/)?.[1] ?? 'audio/webm';
  const binary = atob(base64 ?? '');
  const array = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }

  return new Blob([array], { type: mime });
};

const csvEscape = (value: string | number | undefined): string => {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const sanitizeAscii = (value: string) => {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || 'na';
};

const isoStamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const getItemStatus = (itemId: string, recordings: Recording[]): ItemStatus => {
  const itemRecordings = recordings.filter((entry) => entry.itemId === itemId);
  if (itemRecordings.some((entry) => entry.status === 'valid')) {
    return 'completed';
  }
  if (itemRecordings.some((entry) => entry.status === 'retake')) {
    return 'review';
  }
  if (itemRecordings.length > 0) {
    return 'recorded';
  }
  return 'pending';
};

const getPreferredBlob = async (recording: Recording): Promise<Blob | null> => {
  if (recording.audioBlobId) {
    const blob = await getAudioBlob(recording.audioBlobId);
    if (blob) {
      return blob;
    }
  }
  if (recording.audioDataUrl) {
    return dataUrlToBlob(recording.audioDataUrl);
  }
  return null;
};

const ensureProjectScenario = (project: Project): Project => {
  if (project.scenarioId && project.scenarioVersion && project.scenarioTitle) {
    return project;
  }
  const fallback = SCENARIO_DEFINITIONS[DEFAULT_SCENARIO_ID];
  return {
    ...project,
    scenarioId: fallback.id,
    scenarioTitle: fallback.title,
    scenarioVersion: fallback.version,
  };
};

function App() {
  const [appState, setAppState] = useState<AppState>(() => {
    const loaded = loadAppState();
    return {
      ...loaded,
      projects: loaded.projects.map(ensureProjectScenario),
    };
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => loadAppState().projects[0]?.id ?? '');
  const [newProjectName, setNewProjectName] = useState(defaultProjectName);
  const [newProjectLocation, setNewProjectLocation] = useState('广东');
  const [newProjectDialect, setNewProjectDialect] = useState('客家话');
  const [newProjectScenarioId, setNewProjectScenarioId] = useState<ScenarioId>(DEFAULT_SCENARIO_ID);
  const [newSpeaker, setNewSpeaker] = useState({
    code: 'SPK001',
    gender: '未知',
    birthplace: '',
    currentResidence: '',
    dialectPoint: '',
    notes: '',
  });
  const [recordingNotes, setRecordingNotes] = useState('');
  const [aiSummary, setAiSummary] = useState<AiSuggestion | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [activeMessage, setActiveMessage] = useState('');
  const [activeView, setActiveView] = useState<'survey' | 'resource'>('survey');
  const [activeResourceModule, setActiveResourceModule] = useState<ResourceModuleId>('scenes');
  const [showSceneDraft, setShowSceneDraft] = useState(false);
  const [recordingMeta, setRecordingMeta] = useState<{ speakerId: string; itemId: string }>({ speakerId: '', itemId: '' });
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sampleRateRef = useRef<number>(48000);
  const startedAtRef = useRef<number>(0);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const recordingContextRef = useRef<{ projectId: string; speakerId: string; itemId: string } | null>(null);

  useEffect(() => {
    persistAppState(appState);
  }, [appState]);

  useEffect(() => {
    if (!selectedProjectId && appState.projects[0]) {
      setSelectedProjectId(appState.projects[0].id);
    }
  }, [appState.projects, selectedProjectId]);

  const selectedProject = useMemo(
    () => appState.projects.find((project) => project.id === selectedProjectId) ?? appState.projects[0],
    [appState.projects, selectedProjectId],
  );

  const selectedScenario = useMemo(
    () => (selectedProject ? SCENARIO_DEFINITIONS[selectedProject.scenarioId] : null),
    [selectedProject],
  );

  const projectSpeakers = useMemo(
    () => appState.speakers.filter((speaker) => speaker.projectId === selectedProject?.id),
    [appState.speakers, selectedProject?.id],
  );

  const projectItems = useMemo(
    () => appState.items.filter((item) => item.projectId === selectedProject?.id),
    [appState.items, selectedProject?.id],
  );

  const projectRecordings = useMemo(
    () => appState.recordings.filter((recording) => recording.projectId === selectedProject?.id),
    [appState.recordings, selectedProject?.id],
  );

  const selectedSpeakerId = recordingMeta.speakerId || projectSpeakers[0]?.id || '';
  const selectedItemId = recordingMeta.itemId || projectItems[0]?.id || '';

  useEffect(() => {
    setRecordingMeta((prev) => ({
      speakerId: prev.speakerId || projectSpeakers[0]?.id || '',
      itemId: prev.itemId || projectItems[0]?.id || '',
    }));
  }, [selectedProject?.id, projectSpeakers, projectItems]);

  useEffect(() => {
    let cancelled = false;
    const currentUrls: string[] = [];

    const loadAudioUrls = async () => {
      const next: Record<string, string> = {};
      for (const recording of projectRecordings) {
        const blob = await getPreferredBlob(recording);
        if (!blob) {
          continue;
        }
        const url = URL.createObjectURL(blob);
        next[recording.id] = url;
        currentUrls.push(url);
      }
      if (!cancelled) {
        setAudioUrls(next);
      } else {
        currentUrls.forEach((url) => URL.revokeObjectURL(url));
      }
    };

    void loadAudioUrls();

    return () => {
      cancelled = true;
      currentUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [projectRecordings]);

  const progress = useMemo(() => {
    const total = projectItems.length;
    const recorded = projectItems.filter((item) => projectRecordings.some((entry) => entry.itemId === item.id)).length;
    const valid = projectItems.filter((item) => projectRecordings.some((entry) => entry.itemId === item.id && entry.status === 'valid')).length;
    const retake = projectItems.filter((item) => {
      const itemRecordings = projectRecordings.filter((entry) => entry.itemId === item.id);
      return itemRecordings.some((entry) => entry.status === 'retake') && !itemRecordings.some((entry) => entry.status === 'valid');
    }).length;
    const pending = total - recorded;
    return { total, recorded, valid, retake, pending };
  }, [projectItems, projectRecordings]);

  const selectedItemIndex = projectItems.findIndex((item) => item.id === selectedItemId);

  const createProject = () => {
    const scenario = SCENARIO_DEFINITIONS[newProjectScenarioId];
    if (!scenario) {
      setActiveMessage('调查场景模板缺失，请检查本地模板文件。');
      return;
    }
    if (!newProjectName.trim()) {
      setActiveMessage('请输入项目名称。');
      return;
    }

    const project: Project = {
      id: crypto.randomUUID(),
      name: newProjectName.trim(),
      location: newProjectLocation,
      dialectArea: newProjectDialect,
      createdAt: new Date().toISOString(),
      description: '田野调查项目（场景模板驱动）',
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      scenarioTitle: scenario.title,
    };

    const items = createItemsFromScenario(project.id, scenario);

    setAppState((prev) => ({
      ...prev,
      projects: [project, ...prev.projects],
      items: [...items, ...prev.items],
    }));
    setSelectedProjectId(project.id);
    setRecordingMeta({ speakerId: '', itemId: items[0]?.id ?? '' });
    setNewProjectName(defaultProjectName);
    setNewProjectLocation('广东');
    setNewProjectDialect('客家话');
    setActiveMessage(`已创建项目：${project.name}（${scenario.title}）`);
  };

  const createSpeaker = () => {
    if (!selectedProject) {
      setActiveMessage('请先创建一个项目。');
      return;
    }

    const speaker: Speaker = {
      id: crypto.randomUUID(),
      projectId: selectedProject.id,
      code: newSpeaker.code || `SPK${projectSpeakers.length + 1}`,
      gender: newSpeaker.gender,
      birthplace: newSpeaker.birthplace,
      currentResidence: newSpeaker.currentResidence,
      dialectPoint: newSpeaker.dialectPoint,
      notes: newSpeaker.notes,
      createdAt: new Date().toISOString(),
    };

    setAppState((prev) => ({ ...prev, speakers: [speaker, ...prev.speakers] }));
    setNewSpeaker({
      code: `SPK${projectSpeakers.length + 2}`,
      gender: '未知',
      birthplace: '',
      currentResidence: '',
      dialectPoint: '',
      notes: '',
    });
    setRecordingMeta((prev) => ({
      speakerId: prev.speakerId || speaker.id,
      itemId: prev.itemId || selectedItemId,
    }));
    setActiveMessage(`已新增发音人：${speaker.code}`);
  };

  const addCustomItem = () => {
    if (!selectedProject) {
      setActiveMessage('请先创建项目。');
      return;
    }
    const item: Item = {
      id: crypto.randomUUID(),
      projectId: selectedProject.id,
      code: `CUSTOM-${projectItems.length + 1}`,
      prompt: '开发者自定义条目',
      notes: '非标准流程手动新增',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    setAppState((prev) => ({ ...prev, items: [item, ...prev.items] }));
    setActiveMessage('已新增开发者自定义条目。');
  };

  const reloadScenarioTemplate = () => {
    if (!selectedProject) {
      return;
    }
    const scenario = SCENARIO_DEFINITIONS[selectedProject.scenarioId];
    if (!scenario) {
      setActiveMessage('未找到该项目对应的场景模板，无法重载。');
      return;
    }
    const accepted = window.confirm('重载场景模板将刷新条目内容，但不会删除已有录音。是否继续？');
    if (!accepted) {
      return;
    }

    setAppState((prev) => {
      const projectItemsCurrent = prev.items.filter((item) => item.projectId === selectedProject.id);
      const templateItemsCurrent = projectItemsCurrent.filter((item) => item.templateCode || item.isTemplateItem);
      const customItems = projectItemsCurrent.filter((item) => !item.templateCode && !item.isTemplateItem);
      const templateMap = new Map(templateItemsCurrent.map((item) => [item.templateCode || item.code, item]));
      const matchedCodes = new Set<string>();

      const refreshedTemplateItems = scenario.items.map((entry) => {
        const existing = templateMap.get(entry.code);
        matchedCodes.add(entry.code);
        if (existing) {
          return {
            ...existing,
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
          };
        }
        return {
          id: crypto.randomUUID(),
          projectId: selectedProject.id,
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
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        };
      });

      const legacyTemplateItems = templateItemsCurrent.filter((item) => !matchedCodes.has(item.templateCode || item.code));
      const otherProjectItems = prev.items.filter((item) => item.projectId !== selectedProject.id);

      return {
        ...prev,
        projects: prev.projects.map((project) =>
          project.id === selectedProject.id
            ? {
                ...project,
                scenarioVersion: scenario.version,
                scenarioTitle: scenario.title,
              }
            : project,
        ),
        items: [...otherProjectItems, ...refreshedTemplateItems, ...legacyTemplateItems, ...customItems],
      };
    });

    setActiveMessage('已重载场景模板，录音数据保持不变。');
  };

  const startRecording = async () => {
    if (!selectedProject || !selectedSpeakerId || !selectedItemId) {
      setActiveMessage('请选择项目、发音人和条目后再录音。');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext({ sampleRate: 48000 });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);

      sampleRateRef.current = context.sampleRate;
      pcmChunksRef.current = [];
      startedAtRef.current = Date.now();
      recordingContextRef.current = {
        projectId: selectedProject.id,
        speakerId: selectedSpeakerId,
        itemId: selectedItemId,
      };

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(input));
      };

      source.connect(processor);
      processor.connect(context.destination);

      streamRef.current = stream;
      audioContextRef.current = context;
      mediaSourceRef.current = source;
      processorRef.current = processor;
      setIsRecording(true);
      setActiveMessage('正在录音（WAV，单声道 PCM 16-bit）。');
    } catch (error) {
      console.error(error);
      setActiveMessage('无法访问麦克风，请检查浏览器麦克风权限与设备连接。');
    }
  };

  const stopRecording = async () => {
    if (!isRecording) {
      return;
    }

    processorRef.current?.disconnect();
    mediaSourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    await audioContextRef.current?.close();

    setIsRecording(false);

    const contextInfo = recordingContextRef.current;
    if (!contextInfo) {
      setActiveMessage('录音上下文缺失，未能保存。');
      return;
    }

    const selectedItem = appState.items.find((item) => item.id === contextInfo.itemId);
    const selectedSpeaker = appState.speakers.find((speaker) => speaker.id === contextInfo.speakerId);
    const selectedProjectNow = appState.projects.find((project) => project.id === contextInfo.projectId);

    if (!selectedProjectNow || !selectedItem || !selectedSpeaker) {
      setActiveMessage('录音保存失败：项目、发音人或条目信息缺失。');
      return;
    }

    const wavBlob = encodePcm16Wav(pcmChunksRef.current, sampleRateRef.current);
    const durationSec = (Date.now() - startedAtRef.current) / 1000;
    if (!wavBlob.type.includes('wav')) {
      setActiveMessage('录音保存失败：生成的音频不是有效 WAV 格式。');
      return;
    }
    if (wavBlob.size <= 44 || durationSec < 0.08) {
      setActiveMessage('录音保存失败：录音时长过短或音频数据无效，请重试。');
      return;
    }

    const takeNumber =
      appState.recordings.filter(
        (entry) => entry.projectId === contextInfo.projectId && entry.itemId === contextInfo.itemId && entry.speakerId === contextInfo.speakerId,
      ).length + 1;

    const timestamp = new Date();
    const fileName = [
      sanitizeAscii(selectedProjectNow.name),
      sanitizeAscii(selectedProjectNow.scenarioId),
      sanitizeAscii(selectedSpeaker.code),
      sanitizeAscii(selectedItem.code),
      `take${String(takeNumber).padStart(2, '0')}`,
      isoStamp(timestamp),
    ].join('__') + '.wav';

    const recordingId = crypto.randomUUID();

    try {
      await saveAudioBlob(recordingId, wavBlob);
    } catch (error) {
      console.error(error);
      setActiveMessage('录音保存失败：本地存储空间不足，请导出并清理后再试。');
      return;
    }

    const recording: Recording = {
      id: recordingId,
      projectId: contextInfo.projectId,
      speakerId: contextInfo.speakerId,
      itemId: contextInfo.itemId,
      fileName,
      audioBlobId: recordingId,
      createdAt: timestamp.toISOString(),
      status: 'pending',
      notes: recordingNotes.trim() || '无备注',
      mimeType: 'audio/wav',
      durationSec,
      sampleRate: sampleRateRef.current,
      channels: 1,
      bitDepth: 16,
      takeNumber,
      scenarioId: selectedProjectNow.scenarioId,
      itemCode: selectedItem.code,
    };

    setAppState((prev) => {
      const recordings = [recording, ...prev.recordings];
      return {
        ...prev,
        recordings,
        items: prev.items.map((item) =>
          item.id === contextInfo.itemId
            ? {
                ...item,
                status: getItemStatus(item.id, recordings),
              }
            : item,
        ),
      };
    });

    setRecordingNotes('');
    setActiveMessage(
      `已保存 WAV：${recording.fileName}（${recording.sampleRate}Hz, ${recording.channels}声道, ${recording.bitDepth}bit）`,
    );
  };

  const updateRecordingStatus = (recordingId: string, status: Recording['status']) => {
    setAppState((prev) => {
      const recordings = prev.recordings.map((recording) =>
        recording.id === recordingId ? { ...recording, status } : recording,
      );
      const changed = recordings.find((entry) => entry.id === recordingId);
      if (!changed) {
        return prev;
      }
      return {
        ...prev,
        recordings,
        items: prev.items.map((item) =>
          item.id === changed.itemId
            ? {
                ...item,
                status: getItemStatus(item.id, recordings),
              }
            : item,
        ),
      };
    });
    setActiveMessage(status === 'valid' ? '已标记为有效录音。' : '已标记为需重录。');
  };

  const goToRelativeItem = (step: number) => {
    if (projectItems.length === 0) {
      return;
    }
    const current = selectedItemIndex >= 0 ? selectedItemIndex : 0;
    const next = Math.max(0, Math.min(projectItems.length - 1, current + step));
    setRecordingMeta((prev) => ({ ...prev, itemId: projectItems[next].id }));
  };

  const handleAiSuggestion = () => {
    if (!selectedProject || !selectedItemId) {
      setActiveMessage('请先选择项目和调查条目。');
      return;
    }

    const item = appState.items.find((entry) => entry.id === selectedItemId);
    const noteText = recordingNotes || item?.notes || '无现场备注';
    const suggestion = generateAiSuggestion({
      projectName: selectedProject.name,
      item,
      noteText,
      dialectArea: selectedProject.dialectArea,
    });

    setAiSummary(suggestion);
    setActiveMessage('AI 建议已生成，可供复核（离线模板）。');
  };

  const exportProject = async () => {
    if (!selectedProject) {
      setActiveMessage('请先选择项目。');
      return;
    }

    const scenario = SCENARIO_DEFINITIONS[selectedProject.scenarioId];
    if (!scenario) {
      setActiveMessage('导出失败：项目场景模板不存在。');
      return;
    }

    const zip = new JSZip();
    const projectSpeakersData = appState.speakers.filter((speaker) => speaker.projectId === selectedProject.id);
    const projectItemsData = appState.items.filter((item) => item.projectId === selectedProject.id);
    const projectRecordingsData = appState.recordings.filter((recording) => recording.projectId === selectedProject.id);

    const exportRecordings = projectRecordingsData.map((recording) => ({
      ...recording,
      audioDataUrl: undefined,
    }));

    zip.file(
      'project.json',
      JSON.stringify(
        {
          project: selectedProject,
          scenario,
          speakers: projectSpeakersData,
          items: projectItemsData,
          recordings: exportRecordings,
        },
        null,
        2,
      ),
    );

    const recordingsCsv = [
      ['project', 'scenario', 'item_code', 'speaker', 'take', 'status', 'timestamp', 'filename', 'notes'],
    ];

    for (const recording of projectRecordingsData) {
      const blob = await getPreferredBlob(recording);
      if (blob) {
        zip.file(`audio/${recording.fileName}`, blob);
      }
      const speaker = projectSpeakersData.find((entry) => entry.id === recording.speakerId);
      const item = projectItemsData.find((entry) => entry.id === recording.itemId);
      recordingsCsv.push([
        selectedProject.name,
        selectedProject.scenarioTitle,
        item?.code || recording.itemCode || '',
        speaker?.code || '',
        String(recording.takeNumber ?? ''),
        recording.status,
        recording.createdAt,
        recording.fileName,
        recording.notes || '',
      ]);
    }

    zip.file('recordings.csv', recordingsCsv.map((row) => row.map(csvEscape).join(',')).join('\n'));

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeAscii(selectedProject.name)}-project.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
    setActiveMessage('项目已导出：包含 WAV、recordings.csv 与元数据。');
  };

  const showPrototypePlaceholder = (message: string) => {
    setActiveMessage(`原型占位：${message}`);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>客家话田野调查助手</h1>
          <small>黑客松 MVP · 场景模板驱动 · 离线优先</small>
        </div>
        <div className="toolbar">
          <button className={activeView === 'survey' ? '' : 'secondary'} onClick={() => setActiveView('survey')}>调查工作台</button>
          <button className={activeView === 'resource' ? '' : 'secondary'} onClick={() => setActiveView('resource')}>资源管理概览</button>
          {activeView === 'survey' && (
            <>
              <button className="secondary" onClick={createProject}>新建项目</button>
              <button className="ghost" onClick={exportProject}>导出项目</button>
            </>
          )}
        </div>
      </header>

      {activeMessage && (
        <div className="section summary-box">
          <strong>{activeMessage}</strong>
        </div>
      )}

      {activeView === 'survey' ? (
        <>
          <div className="grid">
        <section className="card primary">
          <div className="section">
            <h3>项目与调查场景</h3>
            <div className="row">
              <label style={{ flex: '1 1 220px' }}>
                项目名
                <input value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} />
              </label>
              <label style={{ flex: '1 1 180px' }}>
                调查地点
                <input value={newProjectLocation} onChange={(event) => setNewProjectLocation(event.target.value)} />
              </label>
              <label style={{ flex: '1 1 180px' }}>
                方言类型
                <input value={newProjectDialect} onChange={(event) => setNewProjectDialect(event.target.value)} />
              </label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <label style={{ flex: '1 1 280px' }}>
                调查场景（必选）
                <select value={newProjectScenarioId} onChange={(event) => setNewProjectScenarioId(event.target.value as ScenarioId)}>
                  {SCENARIOS.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>{scenario.title}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="inline-actions" style={{ marginTop: 12 }}>
              <button onClick={createProject}>保存项目并加载模板条目</button>
            </div>
          </div>

          <div className="section">
            <h3>项目选择</h3>
            <label style={{ maxWidth: 360 }}>
              当前项目
              <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                {appState.projects.length === 0 && <option value="">暂无项目</option>}
                {appState.projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </label>
            {selectedProject && (
              <div className="summary-box" style={{ marginTop: 12 }}>
                <strong>{selectedProject.name}</strong>
                <div>地点：{selectedProject.location}</div>
                <div>方言：{selectedProject.dialectArea}</div>
                <div>场景：{selectedProject.scenarioTitle}</div>
                <div>模板版本：{selectedProject.scenarioVersion}</div>
              </div>
            )}
          </div>

          <div className="section">
            <h3>发音人信息</h3>
            <div className="row">
              <label style={{ flex: '1 1 160px' }}>
                编号
                <input value={newSpeaker.code} onChange={(event) => setNewSpeaker({ ...newSpeaker, code: event.target.value })} />
              </label>
              <label style={{ flex: '1 1 140px' }}>
                性别
                <select value={newSpeaker.gender} onChange={(event) => setNewSpeaker({ ...newSpeaker, gender: event.target.value })}>
                  <option value="未知">未知</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </label>
              <label style={{ flex: '1 1 200px' }}>
                出生地
                <input value={newSpeaker.birthplace} onChange={(event) => setNewSpeaker({ ...newSpeaker, birthplace: event.target.value })} />
              </label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <label style={{ flex: '1 1 200px' }}>
                当前居住地
                <input value={newSpeaker.currentResidence} onChange={(event) => setNewSpeaker({ ...newSpeaker, currentResidence: event.target.value })} />
              </label>
              <label style={{ flex: '1 1 200px' }}>
                腔点
                <input value={newSpeaker.dialectPoint} onChange={(event) => setNewSpeaker({ ...newSpeaker, dialectPoint: event.target.value })} />
              </label>
            </div>
            <div style={{ marginTop: 12 }}>
              <label>
                备注
                <textarea value={newSpeaker.notes} onChange={(event) => setNewSpeaker({ ...newSpeaker, notes: event.target.value })} />
              </label>
            </div>
            <div className="inline-actions" style={{ marginTop: 12 }}>
              <button onClick={createSpeaker}>新增发音人</button>
            </div>
          </div>

          <div className="section">
            <h3>场景说明与进度</h3>
            {selectedScenario ? (
              <div className="summary-box">
                <strong>{selectedScenario.title}</strong>
                <p>{selectedScenario.description}</p>
                <ul>
                  {selectedScenario.instructions.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ul>
                <div className="metrics">
                  <div className="metric"><small>总条目</small><strong>{progress.total}</strong></div>
                  <div className="metric"><small>已录音</small><strong>{progress.recorded}</strong></div>
                  <div className="metric"><small>有效</small><strong>{progress.valid}</strong></div>
                  <div className="metric"><small>需重录</small><strong>{progress.retake}</strong></div>
                  <div className="metric"><small>待采录</small><strong>{progress.pending}</strong></div>
                </div>
                <div className="inline-actions">
                  <button className="warning" onClick={reloadScenarioTemplate}>重载模板（保留录音）</button>
                </div>
              </div>
            ) : (
              <p className="empty">当前项目缺少场景定义。</p>
            )}
            <details style={{ marginTop: 12 }}>
              <summary>开发者入口（非标准流程）</summary>
              <div style={{ marginTop: 8 }}>
                <button className="ghost" onClick={addCustomItem}>新增自定义条目</button>
              </div>
            </details>
          </div>
        </section>

        <aside className="card secondary">
          <div className="section">
            <h3>发音人</h3>
            {projectSpeakers.length === 0 ? (
              <p className="empty">暂无发音人。</p>
            ) : (
              <ul className="list">
                {projectSpeakers.map((speaker) => (
                  <li key={speaker.id} className="item-row">
                    <div>
                      <strong>{speaker.code}</strong>
                      <small>{speaker.gender} · {speaker.dialectPoint || '未知腔点'}</small>
                    </div>
                    <button className="ghost" onClick={() => setRecordingMeta((prev) => ({ ...prev, speakerId: speaker.id }))}>选择</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="section">
            <h3>条目队列（主工作区）</h3>
            {projectItems.length === 0 ? (
              <p className="empty">暂无条目，请先创建带场景的项目。</p>
            ) : (
              <ul className="list">
                {projectItems.map((item) => (
                  <li key={item.id} className="item-row">
                    <div>
                      <strong>{item.code} · {item.prompt || item.hanzi || item.word || '—'}</strong>
                      <small>{item.targetContext || '—'} · {item.changeType || '—'}</small>
                    </div>
                    <div className="status-line">
                      <span className={`badge ${item.status}`}>{item.status}</span>
                      <button className="ghost" onClick={() => setRecordingMeta((prev) => ({ ...prev, itemId: item.id }))}>选中</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

          <section className="card section" style={{ marginTop: 20 }}>
        <h3>录音工作台（WAV）</h3>
        <div className="recording-panel">
          <div className="recording-visual">
            <div className="recording-wave" />
          </div>

          <div className="metrics">
            <div className="metric">
              <small>项目</small>
              <strong>{selectedProject?.name || '未选择'}</strong>
            </div>
            <div className="metric">
              <small>场景</small>
              <strong>{selectedProject?.scenarioTitle || '未选择'}</strong>
            </div>
            <div className="metric">
              <small>发音人</small>
              <strong>{projectSpeakers.find((speaker) => speaker.id === selectedSpeakerId)?.code || '未选择'}</strong>
            </div>
            <div className="metric">
              <small>条目</small>
              <strong>{projectItems.find((item) => item.id === selectedItemId)?.code || '未选择'}</strong>
            </div>
          </div>

          <div className="row">
            <label style={{ flex: '1 1 200px' }}>
              当前发音人
              <select value={selectedSpeakerId} onChange={(event) => setRecordingMeta((prev) => ({ ...prev, speakerId: event.target.value }))}>
                {projectSpeakers.map((speaker) => (
                  <option key={speaker.id} value={speaker.id}>{speaker.code}</option>
                ))}
              </select>
            </label>
            <label style={{ flex: '1 1 200px' }}>
              当前条目
              <select value={selectedItemId} onChange={(event) => setRecordingMeta((prev) => ({ ...prev, itemId: event.target.value }))}>
                {projectItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.code} / {item.prompt || item.word || '—'}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ marginTop: 12 }}>
            <label>
              现场备注
              <textarea value={recordingNotes} onChange={(event) => setRecordingNotes(event.target.value)} />
            </label>
          </div>

          <div className="inline-actions" style={{ marginTop: 12 }}>
            {!isRecording ? (
              <button onClick={startRecording}>开始录音</button>
            ) : (
              <button className="warning" onClick={() => void stopRecording()}>停止录音并保存WAV</button>
            )}
            <button className="secondary" onClick={() => goToRelativeItem(-1)}>上一条</button>
            <button className="secondary" onClick={() => goToRelativeItem(1)}>下一条</button>
            <button className="ghost" onClick={handleAiSuggestion}>AI 整理备注</button>
          </div>
        </div>
      </section>

          <div className="grid" style={{ marginTop: 20 }}>
        <section className="card primary">
          <h3>录音记录</h3>
          {projectRecordings.length === 0 ? (
            <p className="empty">暂无录音记录。</p>
          ) : (
            <ul className="list">
              {projectRecordings.map((recording) => {
                const speaker = appState.speakers.find((entry) => entry.id === recording.speakerId);
                const item = appState.items.find((entry) => entry.id === recording.itemId);
                return (
                  <li key={recording.id} className="item-row">
                    <div>
                      <strong>{item?.code || '未命名条目'} · {item?.prompt || item?.hanzi || item?.word || '—'}</strong>
                      <small>
                        {speaker?.code || '未知发音人'} · {new Date(recording.createdAt).toLocaleString()} · {recording.fileName}
                      </small>
                    </div>
                    <div className="status-line">
                      <span className={`badge ${recording.status}`}>{recording.status}</span>
                      {audioUrls[recording.id] ? <audio controls src={audioUrls[recording.id]} /> : <span className="badge pending">音频缺失</span>}
                      <button className="ghost" onClick={() => updateRecordingStatus(recording.id, 'valid')}>有效</button>
                      <button className="warning" onClick={() => updateRecordingStatus(recording.id, 'retake')}>重录</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="card secondary">
          <h3>AI 建议</h3>
          {aiSummary ? (
            <div className="summary-box">
              <h3>{aiSummary.title}</h3>
              <p>{aiSummary.summary}</p>
              <div className="status-line">
                {aiSummary.tags.map((tag) => (
                  <span key={tag} className="badge pending">{tag}</span>
                ))}
              </div>
              {aiSummary.recommendations.length > 0 && (
                <ul>
                  {aiSummary.recommendations.map((recommendation) => (
                    <li key={recommendation}>{recommendation}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="empty">尚未生成建议。</p>
          )}
        </aside>
          </div>
        </>
      ) : (
        <section className="card section">
          <h3>资源管理概览（前端原型）</h3>
          <p className="empty">仅展示信息架构与交互占位，不接入后端、地图 SDK、DeepSeek 或完整业务逻辑。</p>

          <div className="inline-actions" style={{ marginTop: 12 }}>
            <button className={activeResourceModule === 'scenes' ? '' : 'secondary'} onClick={() => setActiveResourceModule('scenes')}>场景管理</button>
            <button className={activeResourceModule === 'dialectPoints' ? '' : 'secondary'} onClick={() => setActiveResourceModule('dialectPoints')}>方言点管理</button>
            <button className={activeResourceModule === 'projects' ? '' : 'secondary'} onClick={() => setActiveResourceModule('projects')}>项目管理</button>
          </div>

          {activeResourceModule === 'scenes' && (
            <div className="prototype-section">
              <p className="module-desc">内置场景展示：连读变调、小称变调、单字调；支持“新增调查场景”占位入口。</p>
              <ul className="list">
                {MOCK_SCENES.map((scene) => (
                  <li key={scene.id} className="item-row">
                    <div>
                      <strong>{scene.title}</strong>
                      <small>{scene.description}</small>
                    </div>
                    <div className="status-line">
                      <span className="badge">{scene.kind}</span>
                      <span className="badge pending">{scene.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="inline-actions" style={{ marginTop: 12 }}>
                <button onClick={() => setShowSceneDraft(true)}>新增调查场景（占位）</button>
              </div>
              {showSceneDraft && (
                <div className="summary-box" style={{ marginTop: 12 }}>
                  <strong>新增调查场景 · 草稿弹窗（原型）</strong>
                  <p>此处后续可接入“场景名称、说明、条目草案”编辑流程；当前仅演示入口，不会保存到本地数据。</p>
                  <button className="secondary" onClick={() => setShowSceneDraft(false)}>关闭草稿</button>
                </div>
              )}
            </div>
          )}

          {activeResourceModule === 'dialectPoints' && (
            <div className="prototype-section">
              <p className="module-desc">展示方言点名称、等级、位置、调查状态，并提供地图概览占位区域（非真实地图）。</p>
              {MOCK_DIALECT_POINTS.length === 0 ? (
                <p className="empty">暂无方言点数据（原型空状态）。</p>
              ) : (
                <ul className="list">
                  {MOCK_DIALECT_POINTS.map((point) => (
                    <li key={point.id} className="item-row">
                      <div>
                        <strong>{point.name}</strong>
                        <small>{point.level} · {point.location}</small>
                      </div>
                      <div className="status-line">
                        <span className="badge">{point.status}</span>
                        <span className="badge review">发音人 {point.speakers}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="map-placeholder">
                <strong>地图概览（原型占位）</strong>
                <small>仅为静态示意，避免误认为已接入真实地图服务。</small>
                <div className="map-dots">
                  {MOCK_DIALECT_POINTS.map((point) => (
                    <span key={point.id} className="map-dot">{point.name.replace('（示例）', '')}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeResourceModule === 'projects' && (
            <div className="prototype-section">
              <p className="module-desc">项目卡片 = 方言点 + 调查场景，展示状态、发音人数、录音进度、WAV/Praat 数据状态。</p>
              {MOCK_PROJECT_CARDS.length === 0 ? (
                <p className="empty">暂无项目数据（原型空状态）。</p>
              ) : (
                <div className="project-cards">
                  {MOCK_PROJECT_CARDS.map((project) => (
                    <article key={project.id} className="card project-card">
                      <strong>{project.name}</strong>
                      <small>{project.dialectPoint} + {project.scenario}</small>
                      <div className="status-line">
                        <span className="badge">{project.status}</span>
                        <span className="badge review">发音人 {project.speakerCount}</span>
                      </div>
                      <div className="status-line">
                        <span className="badge recorded">录音进度 {project.recordingProgress}</span>
                        <span className="badge pending">{project.wavStatus}</span>
                        <span className="badge pending">{project.praatStatus}</span>
                      </div>
                      <button className="ghost" onClick={() => showPrototypePlaceholder(`“${project.name}”导出项目功能待后续研发`)}>
                        导出项目（占位）
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default App;
