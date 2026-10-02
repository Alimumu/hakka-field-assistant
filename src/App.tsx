import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { generateAiSuggestion, type AiSuggestion } from './lib/ai';
import { loadAppState, persistAppState } from './lib/storage';
import type { AppState, Item, Project, Recording, Speaker } from './types';

const defaultProjectName = '新调查项目';

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result ?? ''));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

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
  const [activeMessage, setActiveMessage] = useState('');
  const [recordingMeta, setRecordingMeta] = useState<{ speakerId: string; itemId: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

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

  const selectedSpeakerId = recordingMeta?.speakerId ?? projectSpeakers[0]?.id ?? '';
  const selectedItemId = recordingMeta?.itemId ?? projectItems[0]?.id ?? '';

  const createProject = () => {
    if (!newProjectName.trim()) {
      setActiveMessage('请输入项目名称。');
      return;
    }

    const project: Project = {
      id: crypto.randomUUID(),
      name: newProjectName,
      location: newProjectLocation,
      dialectArea: newProjectDialect,
      createdAt: new Date().toISOString(),
      description: '首次黑客松版田野调查项目',
    };

    setAppState((prev) => ({ ...prev, projects: [project, ...prev.projects] }));
    setSelectedProjectId(project.id);
    setNewProjectName(defaultProjectName);
    setNewProjectLocation('广东');
    setNewProjectDialect('客家话');
    setActiveMessage(`已创建项目：${project.name}`);
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
      speakerId: prev?.speakerId ?? speaker.id,
      itemId: prev?.itemId ?? selectedItemId,
    }));
    setActiveMessage(`已新增发音人：${speaker.code}`);
  };

  const addItem = () => {
    if (!selectedProject) {
      setActiveMessage('请先创建一个项目。');
      return;
    }

    const item: Item = {
      id: crypto.randomUUID(),
      projectId: selectedProject.id,
      code: newItem.code || `ITEM${projectItems.length + 1}`,
      hanzi: newItem.hanzi,
      word: newItem.word,
      meaning: newItem.meaning,
      phonetic: newItem.phonetic,
      tone: newItem.tone,
      notes: newItem.notes,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    setAppState((prev) => ({ ...prev, items: [item, ...prev.items] }));
    setNewItem({
      code: `ITEM${projectItems.length + 2}`,
      hanzi: '',
      word: '',
      meaning: '',
      phonetic: '',
      tone: '',
      notes: '',
    });
    setRecordingMeta((prev) => ({
      speakerId: prev?.speakerId ?? selectedSpeakerId,
      itemId: prev?.itemId ?? item.id,
    }));
    setActiveMessage(`已新增调查条目：${item.code}`);
  };

  const startRecording = async () => {
    if (!selectedProject || !selectedSpeakerId || !selectedItemId) {
      setActiveMessage('请选择项目、发音人和条目后再录音。');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined;
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedChunksRef.current = [];
      streamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const audioDataUrl = await blobToDataUrl(blob);
        const recording: Recording = {
          id: crypto.randomUUID(),
          projectId: selectedProject.id,
          speakerId: selectedSpeakerId,
          itemId: selectedItemId,
          fileName: `${selectedProject.name}-${selectedSpeakerId}-${selectedItemId}-${Date.now()}.webm`,
          audioDataUrl,
          createdAt: new Date().toISOString(),
          status: 'pending',
          notes: recordingNotes.trim() || '无备注',
        };

        setAppState((prev) => ({
          ...prev,
          recordings: [recording, ...prev.recordings],
        }));

        setAppState((prev) => ({
          ...prev,
          items: prev.items.map((item) =>
            item.id === selectedItemId ? { ...item, status: 'recorded' } : item,
          ),
        }));

        setRecordingNotes('');
        setIsRecording(false);
        setActiveMessage(`已保存录音：${recording.fileName}`);

        stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        streamRef.current = null;
      };

      recorder.start();
      setIsRecording(true);
      setActiveMessage('正在录音…');
    } catch (error) {
      console.error(error);
      setActiveMessage('无法访问麦克风，请检查设备权限。');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const setAsValid = (recordingId: string) => {
    setAppState((prev) => ({
      ...prev,
      recordings: prev.recordings.map((recording) =>
        recording.id === recordingId ? { ...recording, status: 'valid' } : recording,
      ),
      items: prev.items.map((item) => {
        const hasValid = prev.recordings.some(
          (recording) => recording.itemId === item.id && recording.status === 'valid',
        );
        if (item.id === prev.recordings.find((recording) => recording.id === recordingId)?.itemId) {
          return { ...item, status: hasValid ? 'completed' : 'review' };
        }
        return item;
      }),
    }));
    setActiveMessage('已标记为有效录音。');
  };

  const setAsRetake = (recordingId: string) => {
    setAppState((prev) => ({
      ...prev,
      recordings: prev.recordings.map((recording) =>
        recording.id === recordingId ? { ...recording, status: 'retake' } : recording,
      ),
    }));
    setActiveMessage('已标记为需重录。');
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
    setActiveMessage('AI 建议已生成，可供复核。');
  };

  const exportProject = async () => {
    if (!selectedProject) {
      setActiveMessage('请先选择项目。');
      return;
    }

    const zip = new JSZip();
    const projectData = {
      project: selectedProject,
      speakers: appState.speakers.filter((speaker) => speaker.projectId === selectedProject.id),
      items: appState.items.filter((item) => item.projectId === selectedProject.id),
      recordings: appState.recordings.filter((recording) => recording.projectId === selectedProject.id),
      aiSuggestions: appState.aiSuggestions.filter((suggestion) => suggestion.projectId === selectedProject.id),
    };

    zip.file('project.json', JSON.stringify(projectData, null, 2));

    const speakerCsv = [
      ['id', 'code', 'gender', 'birthplace', 'currentResidence', 'dialectPoint', 'notes'],
      ...projectData.speakers.map((speaker) => [
        speaker.id,
        speaker.code,
        speaker.gender,
        speaker.birthplace,
        speaker.currentResidence,
        speaker.dialectPoint,
        speaker.notes,
      ]),
    ]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');

    zip.file('speakers.csv', speakerCsv);

    const itemCsv = [
      ['id', 'code', 'hanzi', 'word', 'meaning', 'phonetic', 'tone', 'status', 'notes'],
      ...projectData.items.map((item) => [
        item.id,
        item.code,
        item.hanzi,
        item.word,
        item.meaning,
        item.phonetic,
        item.tone,
        item.status,
        item.notes,
      ]),
    ]
      .map((row) => row.map(csvEscape).join(','))
      .join('\n');

    zip.file('items.csv', itemCsv);

    for (const recording of projectData.recordings) {
      if (recording.audioDataUrl) {
        const blob = dataUrlToBlob(recording.audioDataUrl);
        zip.file(`audio/${recording.fileName}`, blob);
      }
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selectedProject.name.toLowerCase().replace(/\s+/g, '-')}-project.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
    setActiveMessage('项目已导出为ZIP包。');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>客家话田野调查助手</h1>
          <small>黑客松 MVP · 离线优先 · AI 辅助整理</small>
        </div>
        <div className="toolbar">
          <button className="secondary" onClick={createProject}>新建项目</button>
          <button className="ghost" onClick={exportProject}>导出项目</button>
        </div>
      </header>

      {activeMessage && (
        <div className="section summary-box">
          <strong>{activeMessage}</strong>
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
                  {appState.projects.length === 0 && <option value="">暂无项目</option>}
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
            </div>
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
            <h3>条目列表</h3>
            {projectItems.length === 0 ? (
              <p className="empty">暂无条目。</p>
            ) : (
              <ul className="list">
                {projectItems.map((item) => (
                  <li key={item.id} className="item-row">
                    <div>
                      <strong>{item.hanzi || item.word || item.code}</strong>
                      <small>{item.phone || item.phonetic || '—'} · {item.status}</small>
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
              <button className="warning" onClick={stopRecording}>停止录音</button>
            )}
            <button className="secondary" onClick={handleAiSuggestion}>AI 整理备注</button>
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
                      <strong>{item?.hanzi || item?.word || item?.code || '未命名条目'}</strong>
                      <small>
                        {speaker?.code || '未知发音人'} · {new Date(recording.createdAt).toLocaleString()}
                      </small>
                    </div>
                    <div className="status-line">
                      <span className={`badge ${recording.status}`}>{recording.status}</span>
                      {recording.audioDataUrl && (
                        <audio controls src={recording.audioDataUrl} />
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
              {aiSummary.recommendations && aiSummary.recommendations.length > 0 && (
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
    </div>
  );
}

export default App;
