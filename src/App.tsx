import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { getAiSuggestion, type AiSuggestion } from './lib/ai';
import { clearRecordingAudios, deleteRecordingAudio, getRecordingAudio, saveRecordingAudio } from './lib/audioStore';
import { clearAppState, loadAppState, persistAppState } from './lib/storage';
import type { AppState, Item, Project, Recording, Speaker } from './types';

const defaultProjectName = '新调查项目';
const requiredCsvHeaders = ['code', 'hanzi', 'word', 'meaning', 'phonetic', 'tone', 'notes'];

type RecordingMeta = { speakerId: string; itemId: string };
type CsvParseResult = { rows: string[][]; malformedRows: number };

type RecordingSession = {
  projectId: string;
  projectName: string;
  speakerId: string;
  itemId: string;
  notes: string;
  startedAt: number;
};

const csvEscape = (value: string | number | boolean | undefined): string => {
  const text = String(value ?? '');
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const normalizeHeader = (value: string): string => value.trim().toLowerCase();

const parseCsv = (input: string): CsvParseResult => {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let malformedRows = 0;
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(cell.trim());
      const hasData = row.some((entry) => entry.length > 0);
      if (hasData) {
        rows.push(row);
      }
      row = [];
      cell = '';
      continue;
    }

    if (!inQuotes && char === ',') {
      row.push(cell.trim());
      cell = '';
      continue;
    }

    cell += char;
  }

  if (inQuotes) {
    malformedRows += 1;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    const hasData = row.some((entry) => entry.length > 0);
    if (hasData) {
      rows.push(row);
    }
  }

  return { rows, malformedRows };
};

function App() {
  const [appState, setAppState] = useState<AppState>(() => loadAppState());
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => loadAppState().projects[0]?.id ?? '');
  const [newProjectName, setNewProjectName] = useState(defaultProjectName);
  const [newProjectLocation, setNewProjectLocation] = useState('广东');
  const [newProjectDialect, setNewProjectDialect] = useState('客家话');
  const [newSpeaker, setNewSpeaker] = useState({
    code: 'SPK001',
    gender: '未知',
    birthplace: '',
    currentResidence: '',
    dialectPoint: '',
    notes: '',
  });
  const [newItem, setNewItem] = useState({
    code: 'ITEM001',
    hanzi: '',
    word: '',
    meaning: '',
    phonetic: '',
    tone: '',
    notes: '',
  });
  const [recordingNotes, setRecordingNotes] = useState('');
  const [aiSummary, setAiSummary] = useState<AiSuggestion | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activeMessage, setActiveMessage] = useState('');
  const [activeWarning, setActiveWarning] = useState('');
  const [recordingMeta, setRecordingMeta] = useState<RecordingMeta>({ speakerId: '', itemId: '' });
  const [audioUrls, setAudioUrls] = useState<Record<string, string>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingSessionRef = useRef<RecordingSession | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const result = persistAppState(appState);
    if (!result.ok) {
      setActiveWarning(`元数据保存失败：${result.message}。录音可能仍在浏览器会话中可用，请尽快导出。`);
    }
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

  useEffect(() => {
    setRecordingMeta((prev) => {
      const speakerId = projectSpeakers.some((speaker) => speaker.id === prev.speakerId)
        ? prev.speakerId
        : (projectSpeakers[0]?.id ?? '');
      const itemId = projectItems.some((item) => item.id === prev.itemId)
        ? prev.itemId
        : (projectItems[0]?.id ?? '');
      return { speakerId, itemId };
    });
  }, [selectedProject?.id, projectSpeakers, projectItems]);

  useEffect(() => {
    let cancelled = false;

    const loadAudioUrls = async () => {
      const nextUrls: Record<string, string> = {};

      for (const recording of projectRecordings) {
        if (!recording.audioBlobId) {
          continue;
        }
        try {
          const blob = await getRecordingAudio(recording.audioBlobId);
          if (blob) {
            nextUrls[recording.id] = URL.createObjectURL(blob);
          }
        } catch {
          // ignore single-item load failure
        }
      }

      if (cancelled) {
        Object.values(nextUrls).forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setAudioUrls((prev) => {
        const retained = Object.fromEntries(
          projectRecordings
            .filter((recording) => !recording.audioBlobId && prev[recording.id])
            .map((recording) => [recording.id, prev[recording.id]]),
        );

        Object.entries(prev).forEach(([recordingId, url]) => {
          if (!retained[recordingId]) {
            URL.revokeObjectURL(url);
          }
        });

        return { ...retained, ...nextUrls };
      });
    };

    void loadAudioUrls();

    return () => {
      cancelled = true;
    };
  }, [projectRecordings]);

  const selectedSpeakerId = recordingMeta.speakerId;
  const selectedItemId = recordingMeta.itemId;

  const createProject = () => {
    if (!newProjectName.trim()) {
      setActiveWarning('请输入项目名称。');
      return;
    }

    const project: Project = {
      id: crypto.randomUUID(),
      name: newProjectName.trim(),
      location: newProjectLocation.trim() || '未填写',
      dialectArea: newProjectDialect.trim() || '未填写',
      createdAt: new Date().toISOString(),
      description: '首次黑客松版田野调查项目',
    };

    setAppState((prev) => ({ ...prev, projects: [project, ...prev.projects] }));
    setSelectedProjectId(project.id);
    setNewProjectName(defaultProjectName);
    setNewProjectLocation('广东');
    setNewProjectDialect('客家话');
    setActiveWarning('');
    setActiveMessage(`已创建项目：${project.name}`);
  };

  const createSpeaker = () => {
    if (!selectedProject) {
      setActiveWarning('请先创建并选择项目。');
      return;
    }

    const speaker: Speaker = {
      id: crypto.randomUUID(),
      projectId: selectedProject.id,
      code: newSpeaker.code.trim() || `SPK${String(projectSpeakers.length + 1).padStart(3, '0')}`,
      gender: newSpeaker.gender,
      birthplace: newSpeaker.birthplace.trim(),
      currentResidence: newSpeaker.currentResidence.trim(),
      dialectPoint: newSpeaker.dialectPoint.trim(),
      notes: newSpeaker.notes.trim(),
      createdAt: new Date().toISOString(),
    };

    setAppState((prev) => ({ ...prev, speakers: [speaker, ...prev.speakers] }));
    setRecordingMeta((prev) => ({ speakerId: prev.speakerId || speaker.id, itemId: prev.itemId }));
    setNewSpeaker({
      code: `SPK${String(projectSpeakers.length + 2).padStart(3, '0')}`,
      gender: '未知',
      birthplace: '',
      currentResidence: '',
      dialectPoint: '',
      notes: '',
    });
    setActiveWarning('');
    setActiveMessage(`已新增发音人：${speaker.code}`);
  };

  const addItem = () => {
    if (!selectedProject) {
      setActiveWarning('请先创建并选择项目。');
      return;
    }

    const item: Item = {
      id: crypto.randomUUID(),
      projectId: selectedProject.id,
      code: newItem.code.trim() || `ITEM${String(projectItems.length + 1).padStart(3, '0')}`,
      hanzi: newItem.hanzi.trim(),
      word: newItem.word.trim(),
      meaning: newItem.meaning.trim(),
      phonetic: newItem.phonetic.trim(),
      tone: newItem.tone.trim(),
      notes: newItem.notes.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    setAppState((prev) => ({ ...prev, items: [item, ...prev.items] }));
    setRecordingMeta((prev) => ({ speakerId: prev.speakerId, itemId: prev.itemId || item.id }));
    setNewItem({
      code: `ITEM${String(projectItems.length + 2).padStart(3, '0')}`,
      hanzi: '',
      word: '',
      meaning: '',
      phonetic: '',
      tone: '',
      notes: '',
    });
    setActiveWarning('');
    setActiveMessage(`已新增调查条目：${item.code}`);
  };

  const handleCsvImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file || !selectedProject) {
      return;
    }

    try {
      const raw = await file.text();
      const { rows, malformedRows } = parseCsv(raw);

      if (rows.length < 1) {
        setActiveWarning('CSV 文件为空，未导入任何条目。');
        return;
      }

      const header = rows[0].map(normalizeHeader);
      const indexMap = {
        code: header.indexOf('code'),
        hanzi: header.indexOf('hanzi'),
        word: header.indexOf('word'),
        meaning: header.indexOf('meaning'),
        phonetic: header.indexOf('phonetic'),
        tone: header.indexOf('tone'),
        notes: header.indexOf('notes'),
      };

      const missing = requiredCsvHeaders.filter((key) => indexMap[key as keyof typeof indexMap] < 0);
      const importedItems: Item[] = [];
      let skippedRows = malformedRows;
      let autoIndex = projectItems.length + 1;

      for (const row of rows.slice(1)) {
        const hasAnyData = row.some((value) => value.trim().length > 0);
        if (!hasAnyData) {
          continue;
        }

        const getValue = (key: keyof typeof indexMap) => {
          const index = indexMap[key];
          return index >= 0 ? (row[index] ?? '').trim() : '';
        };

        const code = getValue('code') || `ITEM${String(autoIndex).padStart(3, '0')}`;
        autoIndex += 1;

        importedItems.push({
          id: crypto.randomUUID(),
          projectId: selectedProject.id,
          code,
          hanzi: getValue('hanzi'),
          word: getValue('word'),
          meaning: getValue('meaning'),
          phonetic: getValue('phonetic'),
          tone: getValue('tone'),
          notes: getValue('notes'),
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
      }

      if (importedItems.length === 0) {
        setActiveWarning('CSV 未解析到有效条目，请检查表头和内容。');
        return;
      }

      setAppState((prev) => ({ ...prev, items: [...importedItems, ...prev.items] }));

      const warningParts: string[] = [];
      if (missing.length > 0) {
        warningParts.push(`缺少列：${missing.join('、')}（已按空值导入）`);
      }
      if (skippedRows > 0) {
        warningParts.push(`疑似异常行：${skippedRows}`);
      }

      setActiveWarning(warningParts.join('；'));
      setActiveMessage(`CSV 导入完成：新增 ${importedItems.length} 条。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setActiveWarning(`CSV 导入失败：${message}`);
    }
  };

  const startRecording = async () => {
    if (!selectedProject || !selectedSpeakerId || !selectedItemId) {
      setActiveWarning('请先选择项目、发音人和条目，再开始录音。');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setActiveWarning('当前浏览器不支持麦克风采集。请使用最新版 Chrome、Edge 或 Firefox。');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedChunksRef.current = [];
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingSessionRef.current = {
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        speakerId: selectedSpeakerId,
        itemId: selectedItemId,
        notes: recordingNotes.trim(),
        startedAt: Date.now(),
      };

      recorder.ondataavailable = (dataEvent) => {
        if (dataEvent.data.size > 0) {
          recordedChunksRef.current.push(dataEvent.data);
        }
      };

      recorder.onstop = async () => {
        const session = recordingSessionRef.current;
        const chunks = recordedChunksRef.current;
        const streamToStop = streamRef.current;

        recordingSessionRef.current = null;
        mediaRecorderRef.current = null;
        streamRef.current = null;
        setIsRecording(false);

        streamToStop?.getTracks().forEach((track) => track.stop());

        if (!session || chunks.length === 0) {
          setActiveWarning('录音数据为空，可能是设备异常或权限被撤销。');
          return;
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const blobId = crypto.randomUUID();
        const stoppedAt = new Date();
        const durationMs = Math.max(1, Date.now() - session.startedAt);
        let audioPersisted = false;
        let persistenceError = '';

        try {
          await saveRecordingAudio(blobId, blob);
          audioPersisted = true;
        } catch (error) {
          persistenceError = error instanceof Error ? error.message : '未知存储错误';
          setActiveWarning(`音频未能持久化保存：${persistenceError}。请立即导出 ZIP 备份。`);
          const previewUrl = URL.createObjectURL(blob);
          setAudioUrls((prev) => ({ ...prev, [blobId]: previewUrl }));
        }

        const recording: Recording = {
          id: crypto.randomUUID(),
          projectId: session.projectId,
          speakerId: session.speakerId,
          itemId: session.itemId,
          fileName: `${session.projectName}-${session.speakerId}-${session.itemId}-${stoppedAt.getTime()}.webm`,
          audioBlobId: audioPersisted ? blobId : undefined,
          audioMimeType: blob.type || 'audio/webm',
          audioSizeBytes: blob.size,
          audioPersisted,
          persistenceError: persistenceError || undefined,
          durationMs,
          createdAt: stoppedAt.toISOString(),
          status: 'pending',
          notes: session.notes || '无备注',
        };

        if (!audioPersisted) {
          setAudioUrls((prev) => ({ ...prev, [recording.id]: prev[blobId] }));
        }

        setAppState((prev) => ({
          ...prev,
          recordings: [recording, ...prev.recordings],
          items: prev.items.map((item) =>
            item.id === session.itemId
              ? {
                ...item,
                status: 'recorded',
              }
              : item,
          ),
        }));

        setRecordingNotes('');
        setActiveMessage(audioPersisted
          ? `录音已保存：${recording.fileName}`
          : `录音已生成，但本地持久化失败：${recording.fileName}`);
      };

      recorder.start();
      setIsRecording(true);
      setActiveWarning('');
      setActiveMessage('正在录音… 请保持麦克风稳定并避免切换页面。');
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setActiveWarning('麦克风权限被拒绝。请点击地址栏麦克风图标允许访问后重试。');
      } else if (name === 'NotFoundError') {
        setActiveWarning('未检测到可用麦克风设备。请插入设备并刷新页面。');
      } else {
        const message = error instanceof Error ? error.message : '未知错误';
        setActiveWarning(`无法开始录音：${message}`);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const setAsValid = (recordingId: string) => {
    setAppState((prev) => {
      const target = prev.recordings.find((recording) => recording.id === recordingId);
      if (!target) {
        return prev;
      }

      const updatedRecordings = prev.recordings.map((recording) =>
        recording.id === recordingId ? { ...recording, status: 'valid' as const } : recording,
      );

      const hasValid = updatedRecordings.some((recording) => recording.itemId === target.itemId && recording.status === 'valid');

      return {
        ...prev,
        recordings: updatedRecordings,
        items: prev.items.map((item) =>
          item.id === target.itemId
            ? {
              ...item,
              status: hasValid ? 'completed' : 'review',
            }
            : item,
        ),
      };
    });

    setActiveMessage('已标记为有效录音。');
    setActiveWarning('');
  };

  const setAsRetake = (recordingId: string) => {
    setAppState((prev) => {
      const target = prev.recordings.find((recording) => recording.id === recordingId);
      if (!target) {
        return prev;
      }

      return {
        ...prev,
        recordings: prev.recordings.map((recording) =>
          recording.id === recordingId ? { ...recording, status: 'retake' as const } : recording,
        ),
        items: prev.items.map((item) =>
          item.id === target.itemId
            ? {
              ...item,
              status: 'review',
            }
            : item,
        ),
      };
    });
    setActiveMessage('已标记为需重录。');
  };

  const handleAiSuggestion = () => {
    if (!selectedProject || !selectedItemId) {
      setActiveWarning('请先选择项目与条目。');
      return;
    }

    const item = appState.items.find((entry) => entry.id === selectedItemId);
    const noteText = recordingNotes || item?.notes || '无现场备注';
    const suggestion = getAiSuggestion({
      projectName: selectedProject.name,
      item,
      noteText,
      dialectArea: selectedProject.dialectArea,
    });

    setAiSummary(suggestion);
    setActiveWarning('');
    setActiveMessage(suggestion.source === 'local-fallback'
      ? '已生成离线本地建议（非联网 AI）。'
      : '已通过 DeepSeek 适配边界返回本地回退建议。');
  };

  const exportProject = async () => {
    if (!selectedProject) {
      setActiveWarning('请先选择项目。');
      return;
    }

    setIsExporting(true);

    try {
      const zip = new JSZip();
      const speakers = appState.speakers.filter((speaker) => speaker.projectId === selectedProject.id);
      const items = appState.items.filter((item) => item.projectId === selectedProject.id);
      const recordings = appState.recordings.filter((recording) => recording.projectId === selectedProject.id);
      const aiSuggestions = appState.aiSuggestions.filter((suggestion) => suggestion.projectId === selectedProject.id);

      zip.file('project.json', JSON.stringify({
        project: selectedProject,
        exportedAt: new Date().toISOString(),
        counts: {
          speakers: speakers.length,
          items: items.length,
          recordings: recordings.length,
        },
        aiSuggestions,
      }, null, 2));

      const speakerCsv = [
        ['id', 'code', 'gender', 'birthplace', 'currentResidence', 'dialectPoint', 'notes', 'createdAt'],
        ...speakers.map((speaker) => [
          speaker.id,
          speaker.code,
          speaker.gender,
          speaker.birthplace,
          speaker.currentResidence,
          speaker.dialectPoint,
          speaker.notes,
          speaker.createdAt,
        ]),
      ]
        .map((row) => row.map(csvEscape).join(','))
        .join('\n');
      zip.file('speakers.csv', speakerCsv);

      const itemCsv = [
        ['id', 'code', 'hanzi', 'word', 'meaning', 'phonetic', 'tone', 'status', 'notes', 'createdAt'],
        ...items.map((item) => [
          item.id,
          item.code,
          item.hanzi,
          item.word,
          item.meaning,
          item.phonetic,
          item.tone,
          item.status,
          item.notes,
          item.createdAt,
        ]),
      ]
        .map((row) => row.map(csvEscape).join(','))
        .join('\n');
      zip.file('items.csv', itemCsv);

      const recordingCsvRows: Array<Array<string | number | boolean | undefined>> = [
        ['id', 'speakerId', 'itemId', 'fileName', 'status', 'createdAt', 'durationMs', 'audioPersisted', 'audioMimeType', 'audioSizeBytes', 'notes', 'persistenceError'],
      ];

      let missingAudioCount = 0;
      for (const recording of recordings) {
        recordingCsvRows.push([
          recording.id,
          recording.speakerId,
          recording.itemId,
          recording.fileName,
          recording.status,
          recording.createdAt,
          recording.durationMs,
          recording.audioPersisted,
          recording.audioMimeType,
          recording.audioSizeBytes,
          recording.notes,
          recording.persistenceError,
        ]);

        if (!recording.audioBlobId) {
          missingAudioCount += 1;
          continue;
        }

        const blob = await getRecordingAudio(recording.audioBlobId);
        if (!blob) {
          missingAudioCount += 1;
          continue;
        }

        zip.file(`audio/${recording.fileName}`, blob);
      }

      zip.file('recordings.csv', recordingCsvRows.map((row) => row.map(csvEscape).join(',')).join('\n'));

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${selectedProject.name.toLowerCase().replace(/\s+/g, '-')}-project.zip`;
      anchor.click();
      URL.revokeObjectURL(url);

      if (missingAudioCount > 0) {
        setActiveWarning(`导出完成，但有 ${missingAudioCount} 条录音缺失音频文件（已在 recordings.csv 标注）。`);
      } else {
        setActiveWarning('');
      }

      setActiveMessage('项目导出完成：已包含 project.json、speakers.csv、items.csv、recordings.csv 和 audio/。');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setActiveWarning(`导出失败：${message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const clearProject = async () => {
    if (!selectedProject) {
      setActiveWarning('当前没有可清空的项目。');
      return;
    }

    const confirmed = window.confirm(`确认清空项目“${selectedProject.name}”及其发音人、条目、录音吗？此操作不可撤销。`);
    if (!confirmed) {
      return;
    }

    const recordingsToDelete = appState.recordings.filter((recording) => recording.projectId === selectedProject.id);

    for (const recording of recordingsToDelete) {
      if (!recording.audioBlobId) {
        continue;
      }
      try {
        await deleteRecordingAudio(recording.audioBlobId);
      } catch {
        // ignore single-file delete failure
      }
    }

    setAppState((prev) => ({
      ...prev,
      projects: prev.projects.filter((project) => project.id !== selectedProject.id),
      speakers: prev.speakers.filter((speaker) => speaker.projectId !== selectedProject.id),
      items: prev.items.filter((item) => item.projectId !== selectedProject.id),
      recordings: prev.recordings.filter((recording) => recording.projectId !== selectedProject.id),
      aiSuggestions: prev.aiSuggestions.filter((suggestion) => suggestion.projectId !== selectedProject.id),
    }));

    setRecordingMeta({ speakerId: '', itemId: '' });
    setAiSummary(null);
    setRecordingNotes('');
    setActiveWarning('');
    setActiveMessage(`已清空项目：${selectedProject.name}`);
  };

  const clearAllLocalData = async () => {
    const confirmed = window.confirm('确认清空所有本地项目、条目和录音缓存吗？此操作不可恢复。');
    if (!confirmed) {
      return;
    }

    try {
      clearAppState();
      await clearRecordingAudios();
    } catch {
      // fallback to state reset even if IndexedDB clear fails
    }

    Object.values(audioUrls).forEach((url) => URL.revokeObjectURL(url));
    setAudioUrls({});
    setAppState({ projects: [], speakers: [], items: [], recordings: [], aiSuggestions: [] });
    setSelectedProjectId('');
    setRecordingMeta({ speakerId: '', itemId: '' });
    setActiveMessage('已清空全部本地数据。');
    setActiveWarning('');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>客家话田野调查助手</h1>
          <small>黑客松 MVP · 离线优先 · 本地回退 AI</small>
        </div>
        <div className="toolbar">
          <button className="secondary" onClick={createProject}>新建项目</button>
          <button className="ghost" onClick={exportProject} disabled={isExporting}>{isExporting ? '导出中…' : '导出项目'}</button>
          <button className="danger" onClick={clearProject}>清空当前项目</button>
          <button className="ghost" onClick={clearAllLocalData}>清空全部本地数据</button>
        </div>
      </header>

      {activeMessage && (
        <div className="section summary-box">
          <strong>{activeMessage}</strong>
        </div>
      )}

      {activeWarning && (
        <div className="section summary-box" style={{ background: '#fff7ed', borderColor: '#fdba74', color: '#9a3412' }}>
          <strong>{activeWarning}</strong>
        </div>
      )}

      <div className="grid">
        <section className="card primary">
          <div className="section">
            <h3>项目</h3>
            <div className="row">
              <label style={{ flex: '1 1 200px' }}>
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
            <div className="inline-actions" style={{ marginTop: 12 }}>
              <button onClick={createProject}>保存项目</button>
            </div>
          </div>

          <div className="section">
            <h3>项目选择</h3>
            <div className="row">
              <label style={{ flex: '1 1 260px' }}>
                当前项目
                <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                  {appState.projects.length === 0 && <option value="">暂无项目，请先创建</option>}
                  {appState.projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>
            </div>
            {selectedProject && (
              <div className="summary-box" style={{ marginTop: 12 }}>
                <strong>{selectedProject.name}</strong>
                <div>地点：{selectedProject.location}</div>
                <div>方言：{selectedProject.dialectArea}</div>
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
              <label style={{ flex: '1 1 160px' }}>
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
            <h3>调查条目</h3>
            <div className="row">
              <label style={{ flex: '1 1 160px' }}>
                编号
                <input value={newItem.code} onChange={(event) => setNewItem({ ...newItem, code: event.target.value })} />
              </label>
              <label style={{ flex: '1 1 160px' }}>
                汉字
                <input value={newItem.hanzi} onChange={(event) => setNewItem({ ...newItem, hanzi: event.target.value })} />
              </label>
              <label style={{ flex: '1 1 180px' }}>
                词语
                <input value={newItem.word} onChange={(event) => setNewItem({ ...newItem, word: event.target.value })} />
              </label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <label style={{ flex: '1 1 200px' }}>
                语义
                <input value={newItem.meaning} onChange={(event) => setNewItem({ ...newItem, meaning: event.target.value })} />
              </label>
              <label style={{ flex: '1 1 150px' }}>
                音标
                <input value={newItem.phonetic} onChange={(event) => setNewItem({ ...newItem, phonetic: event.target.value })} />
              </label>
              <label style={{ flex: '1 1 100px' }}>
                声调
                <input value={newItem.tone} onChange={(event) => setNewItem({ ...newItem, tone: event.target.value })} />
              </label>
            </div>
            <div style={{ marginTop: 12 }}>
              <label>
                备注
                <textarea value={newItem.notes} onChange={(event) => setNewItem({ ...newItem, notes: event.target.value })} />
              </label>
            </div>
            <div className="inline-actions" style={{ marginTop: 12 }}>
              <button onClick={addItem}>新增条目</button>
              <button className="secondary" onClick={() => csvInputRef.current?.click()}>导入 CSV 条目</button>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={handleCsvImport}
              />
            </div>
          </div>
        </section>

        <aside className="card secondary">
          <div className="section">
            <h3>发音人</h3>
            {projectSpeakers.length === 0 ? (
              <p className="empty">暂无发音人，请先新增。</p>
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
            <h3>条目列表</h3>
            {projectItems.length === 0 ? (
              <p className="empty">暂无条目，可手动新增或导入 CSV。</p>
            ) : (
              <ul className="list">
                {projectItems.map((item) => (
                  <li key={item.id} className="item-row">
                    <div>
                      <strong>{item.hanzi || item.word || item.code}</strong>
                      <small>{item.phonetic || '—'} · {item.status}</small>
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
        <h3>录音工作台</h3>
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
              <small>发音人</small>
              <strong>{projectSpeakers.find((speaker) => speaker.id === selectedSpeakerId)?.code || '未选择'}</strong>
            </div>
            <div className="metric">
              <small>条目</small>
              <strong>{projectItems.find((item) => item.id === selectedItemId)?.code || '未选择'}</strong>
            </div>
          </div>

          <p className="empty" style={{ marginTop: 0 }}>麦克风权限提示：若无法录音，请检查浏览器地址栏中的麦克风权限开关。</p>

          <div className="row">
            <label style={{ flex: '1 1 200px' }}>
              当前发音人
              <select value={selectedSpeakerId} onChange={(event) => setRecordingMeta((prev) => ({ ...prev, speakerId: event.target.value }))}>
                {projectSpeakers.length === 0 && <option value="">暂无发音人</option>}
                {projectSpeakers.map((speaker) => (
                  <option key={speaker.id} value={speaker.id}>{speaker.code}</option>
                ))}
              </select>
            </label>
            <label style={{ flex: '1 1 200px' }}>
              当前条目
              <select value={selectedItemId} onChange={(event) => setRecordingMeta((prev) => ({ ...prev, itemId: event.target.value }))}>
                {projectItems.length === 0 && <option value="">暂无条目</option>}
                {projectItems.map((item) => (
                  <option key={item.id} value={item.id}>{item.code}</option>
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
              <button className="warning" onClick={stopRecording}>停止录音并保存</button>
            )}
            <button className="secondary" onClick={handleAiSuggestion}>生成本地 AI 建议</button>
          </div>
        </div>
      </section>

      <div className="grid" style={{ marginTop: 20 }}>
        <section className="card primary">
          <h3>录音记录</h3>
          {projectRecordings.length === 0 ? (
            <p className="empty">暂无录音记录，开始录音后会显示在这里。</p>
          ) : (
            <ul className="list">
              {projectRecordings.map((recording) => {
                const speaker = appState.speakers.find((entry) => entry.id === recording.speakerId);
                const item = appState.items.find((entry) => entry.id === recording.itemId);
                return (
                  <li key={recording.id} className="item-row">
                    <div>
                      <strong>{item?.hanzi || item?.word || item?.code || '未命名条目'}</strong>
                      <small>
                        {speaker?.code || '未知发音人'} · {new Date(recording.createdAt).toLocaleString()}
                      </small>
                    </div>
                    <div className="status-line">
                      <span className={`badge ${recording.status}`}>{recording.status}</span>
                      {audioUrls[recording.id] ? (
                        <audio controls src={audioUrls[recording.id]} />
                      ) : (
                        <small>{recording.audioPersisted ? '加载音频中…' : '音频未持久化'}</small>
                      )}
                      <button className="ghost" onClick={() => setAsValid(recording.id)}>有效</button>
                      <button className="warning" onClick={() => setAsRetake(recording.id)}>重录</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="card secondary">
          <h3>AI 建议（离线安全）</h3>
          {aiSummary ? (
            <div className="summary-box">
              <h3>{aiSummary.title}</h3>
              <p>{aiSummary.summary}</p>
              <p><strong>来源：</strong>{aiSummary.source === 'local-fallback' ? '本地回退（离线）' : 'DeepSeek 适配边界（当前仍本地）'}</p>
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
            <p className="empty">尚未生成建议。此模块默认使用离线本地规则，不依赖联网。</p>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;
