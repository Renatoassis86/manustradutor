import React from 'react';
import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { BookOpen, Upload, FileText, FolderOpen, Printer, CheckCircle } from 'lucide-react';
import { supabase } from './supabase';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{color: '#fff', padding: 40, textAlign: 'center', background: '#090a0f', height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'}}>
          <h2 style={{color: '#ef4444', marginBottom: 12}}>🚨 Erro de Renderização Detectado</h2>
          <pre style={{background: 'rgba(239, 68, 68, 0.1)', padding: 16, borderRadius: 12, border: '1px solid rgba(239, 68, 68, 0.2)', maxWidth: 600, wordBreak: 'break-all', fontSize: 13, color: '#fca5a5', fontFamily: 'monospace'}}>
            {this.state.error ? this.state.error.stack || this.state.error.toString() : "Erro desconhecido de tela"}
          </pre>
          <button className="btn-primary" style={{marginTop: 20, padding: '10px 20px'}} onClick={() => window.location.reload()}>Recarregar Página</button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [project, setProject] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [sections, setSections] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [translatedCache, setTranslatedCache] = useState({});
  const [view, setView] = useState('upload'); // 'upload', 'list', 'translate'
  const [leftViewType, setLeftViewType] = useState('pdf'); // 'pdf' | 'text'
  const [provider, setProvider] = useState('gemini'); // 'gemini' | 'openai'
  const [imageCache, setImageCache] = useState({}); // Cache para visão
  const [pastProjects, setPastProjects] = useState([]);

  const [isTranslatingUnlocked, setIsTranslatingUnlocked] = useState(false); // Pergunta sobre iniciar tradução
  const currentSection = sections.find(s => s.page === currentPage);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      setPastProjects(data || []);
    } catch (e) {
      console.error(e);
    }
  }

  function handleFileChange(e) {
    setFile(e.target.files[0]);
  }

  async function handleUpload() {
    if (!file) return;
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:8000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const safeName = response.data.project;
      setProject(safeName);
      setSections(response.data.sections || []);
      
      const { data: projData, error } = await supabase
         .from('projects')
         .insert({ name: safeName, pdf_name: file.name })
         .select()
         .single();
         
      if (!error && projData) {
         setProjectId(projData.id);
         loadProjects();
      }

      setCurrentPage(1);
      setIsTranslatingUnlocked(false); 
      setLeftViewType('pdf');
      setView('translate');
      setIsLoading(false);
    } catch (error) {
      console.error("Upload error", error);
      setIsLoading(false);
      alert("Erro ao enviar PDF.");
    }
  }

  async function handleUploadAndSave() {
    if (!file) return;
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:8000/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const safeName = response.data.project;
      setProject(safeName);
      setSections(response.data.sections || []);
      
      const { data: projData, error } = await supabase
         .from('projects')
         .insert({ name: safeName, pdf_name: file.name })
         .select()
         .single();
         
      if (!error && projData) {
         setProjectId(projData.id);
         loadProjects();
      }

      setCurrentPage(1);
      setView('list'); 
      setIsLoading(false);
    } catch (error) {
       console.error("Error saving", error);
       setIsLoading(false);
    }
  }

  // Auto-traduzir blocos ao mudar de página se estiver no modo PDF
  useEffect(() => {
    if (view === 'translate' && isTranslatingUnlocked && currentSection?.text_blocks) {
      currentSection.text_blocks.forEach((block, i) => {
        const text = block.map(b => b.text).join(' ');
        if (!translatedCache[`${currentPage}-${i}`]) {
          handleTranslateBlock(text, i);
        }
      });
      // Ler imagens também se houver
      currentSection.images?.forEach(img => {
        if (!imageCache[img]) {
          handleTranslateImage(img);
        }
      });
    }
  }, [currentPage, currentSection, view, isTranslatingUnlocked]);

  // Buscar traduções salvas no Supabase para economizar API
  useEffect(() => {
    const fetchSavedPage = async () => {
      if (!projectId || !isTranslatingUnlocked) return;
      try {
        const { data } = await supabase.from('sections')
          .select('*')
          .eq('project_id', projectId)
          .eq('page_number', currentPage);
        
        if (data && data.length > 0) {
          setTranslatedCache(prev => {
            const next = { ...prev };
            data.forEach(sec => {
              next[`${sec.page_number}-${sec.block_index}`] = sec.translated_text;
            });
            return next;
          });
        }
      } catch (err) {
        console.error("Erro ao buscar cache do Supabase", err);
      }
    };
    fetchSavedPage();
  }, [currentPage, projectId, isTranslatingUnlocked]);

  async function handleTranslateBlock(text, index) {
    try {
      const cacheKey = `${currentPage}-${index}`;
      if (translatedCache[cacheKey]) return;

      const response = await axios.post('http://localhost:8000/api/translate_section', { text, provider });
      const translatedText = response.data.translated;

      setTranslatedCache(prev => ({
        ...prev,
        [cacheKey]: translatedText
      }));

      if (projectId) {
         await supabase.from('sections').upsert({
             project_id: projectId,
             page_number: currentPage,
             block_index: index,
             original_text: text,
             translated_text: translatedText,
             is_approved: true
         }, { onConflict: 'project_id, page_number, block_index' });
      }
    } catch (error) {
      console.error("Translate error", error);
    }
  }

  async function handleTranslateImage(imgPath) {
    try {
      if (imageCache[imgPath]) return;
      
      const response = await axios.post('http://localhost:8000/api/translate_image', { 
        img_path: `${project}/${imgPath}`, 
        provider 
      });
      
      setImageCache(prev => ({
        ...prev,
        [imgPath]: response.data.translated
      }));
    } catch (error) {
      console.error("Erro Visão:", error);
    }
  }

  async function loadPastProject(proj) {
      setProject(proj.name);
      setProjectId(proj.id);
      setIsLoading(true);
      
      const { data: savedSections } = await supabase
         .from('sections')
         .select('*')
         .eq('project_id', proj.id);
         
      const cache = {};
      savedSections?.forEach(sec => {
          cache[`${sec.page_number}-${sec.block_index}`] = sec.translated_text;
      });
      setTranslatedCache(cache);
      
      try {
         const response = await axios.get(`http://localhost:8000/api/load_project/${proj.name}`);
         setSections(response.data.sections);
      } catch (err) {
         console.error("Erro ao carregar estrutura original do projeto", err);
      }
      
      setView('translate');
      setIsLoading(false);
  }


  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="logo">
          <BookOpen /> Manus <span>Tradutor</span>
        </div>
        <div className="sidebar-content">
          <div className={`nav-item ${view === 'upload' ? 'active' : ''}`} onClick={() => setView('upload')}>
            <Upload size={18} /> Novo Texto
          </div>
          <div className={`nav-item ${view === 'list' ? 'active' : ''}`} onClick={() => { setView('list'); loadProjects(); }}>
            <FolderOpen size={18} /> Textos Originais
          </div>
          <div className="nav-item">
            <CheckCircle size={18} style={{color: '#10b981'}} /> Textos Traduzidos
          </div>
          {view === 'translate' && project && (
            <div className={`nav-item active`}>
              <FileText size={18} /> {project.substring(0, 15)}...
            </div>
          )}
        </div>
      </aside>

      <main className="main-workspace">
        <header className="header">
          <h1>
            {view === 'upload' && "Novo Projeto"}
            {view === 'list' && "Coleção de Acervo"}
            {view === 'translate' && `Dashboard: ${project}`}
          </h1>
          {view === 'translate' && (
            <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
              <select 
                  value={provider} 
                  onChange={(e) => setProvider(e.target.value)} 
                  style={{padding: '8px 12px', border: '1px solid var(--glass-border)', background: 'rgba(3, 4, 8, 0.8)', color: '#fff', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 500}}
               >
                  <option value="gemini">Gemini 2.5 Flash ⚡</option>
                  <option value="openai">ChatGPT GPT-4o 🧠</option>
               </select>
              <button className="btn-primary" onClick={() => window.print()}>
                <Printer size={16} /> Imprimir / PDF
              </button>
            </div>
          )}
        </header>

        {view === 'upload' && (
          <div key="upload-view" className="upload-container">
            <div className="upload-area" onClick={() => document.getElementById('file-input').click()}>
              <Upload className="upload-icon" size={48} />
              <p className="upload-title">Arraste ou clique para carregar o seu arquivo até 100MB</p>
              <p className="upload-subtitle">Ideal para artigos científicos e livros de Administração</p>
              <input 
                id="file-input" 
                type="file" 
                accept="application/pdf" 
                onChange={handleFileChange} 
                style={{ display: 'none' }} 
              />
              {file && <p style={{color: 'var(--primary)', fontWeight: 600}}>{file.name}</p>}
            </div>
            {file && (
              <div style={{display: 'flex', gap: 12, marginTop: 20}}>
                <button className="btn-primary" onClick={handleUpload} disabled={isLoading}>
                  {isLoading ? "Processando..." : "Iniciar Tradução"}
                </button>
                <button className="btn-secondary" onClick={handleUploadAndSave} disabled={isLoading}>
                  Guardar para Depois
                </button>
              </div>
            )}
          </div>
        )}

        {view === 'list' && (
          <div key="list-view" style={{display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto'}}>
            {pastProjects?.map(proj => (
              <div key={proj.id} className="content-block" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}} onClick={() => loadPastProject(proj)}>
                <div>
                  <h3 style={{margin: '0 0 4px 0', fontSize: 16}}>{proj.name}</h3>
                  <p style={{margin: 0, fontSize: 12, color: 'var(--text-muted)'}}>Original: {proj.pdf_name} | Criado em: {new Date(proj.created_at).toLocaleDateString()}</p>
                </div>
                <CheckCircle size={20} style={{color: 'var(--accent)'}} />
              </div>
            ))}
            {(!pastProjects || pastProjects.length === 0) && <p style={{color: 'var(--text-muted)'}}>Nenhum texto traduzido até o momento.</p>}
          </div>
        )}

        {view === 'translate' && (
          <div key="translate-view" style={{display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden'}}>
            <div className="page-selector">
              {sections?.map(s => (
                <button 
                  key={s.page} 
                  className={`page-btn ${s.page === currentPage ? 'active' : ''}`}
                  onClick={() => setCurrentPage(s.page)}
                >
                  Pág {s.page}
                </button>
              ))}
            </div>

            <div className="grid-headers">
              <div className="grid-header-title" style={{display: 'flex', gap: 10, alignItems: 'center'}}>
                📜 {leftViewType === 'pdf' ? "PDF Original" : "Texto Original"} (Pág {currentPage})
                <button 
                  className="page-btn" 
                  style={{padding: '2px 8px', fontSize: 11}} 
                  onClick={() => setLeftViewType(leftViewType === 'text' ? 'pdf' : 'text')}
                >
                  {leftViewType === 'pdf' ? "Ver Blocos" : "Ver PDF"}
                </button>
              </div>
              <div className="grid-header-title">🇧🇷 Tradução Manus-Alizada</div>
            </div>

            <div className="workspace-container" style={{position: 'relative', flex: 1, display: 'flex', flexDirection: 'column'}}>
              
              {!isTranslatingUnlocked ? (
                /* 📖 APENAS VISUALIZAÇÃO PDF (Tela Cheia) */
                <div key="full-pdf" style={{position: 'relative', flex: 1, display: 'flex'}}>
                  <embed 
                    key="embed-full"
                    src={`http://localhost:8000/api/static/${project}/documento.pdf#page=${currentPage}`} 
                    type="application/pdf" 
                    width="100%" 
                    height="100%" 
                    style={{border: 'none', background: '#090a0f', flex: 1}}
                  />
                  
                  {/* Overlay interativo com pergunta */}
                  <div style={{
                    position: 'absolute', top: '20px', right: '20px', 
                    background: 'rgba(3, 7, 18, 0.85)', backdropFilter: 'blur(12px)',
                    padding: 24, borderRadius: 16, border: '1px solid var(--glass-border)',
                    maxWidth: 320, boxShadow: '0 20px 40px rgba(0,0,0,0.5)', zIndex: 10
                  }}>
                    <h3 style={{color: '#fff', marginBottom: 8, fontSize: 16, fontWeight: 600}}>Vamos Iniciar a Tradução?</h3>
                    <p style={{color: 'var(--text-muted)', fontSize: 13, marginBottom: 16}}>
                      Você está visualizando o documento original. Escolha o motor de IA acima e clique para traduzir esta página no modo split.
                    </p>
                    <button className="btn-primary" style={{width: '100%'}} onClick={() => setIsTranslatingUnlocked(true)}>
                      Traduzir Página agora
                    </button>
                  </div>
                </div>
              ) : (
                /* 📊 VISUALIZAÇÃO SPLIT (Original vs Traduzida) */
                <div key="split-workspace" className="workspace-row" style={{height: '100% '}}>
                  <div className="row-cell" style={{height: '100%', padding: 0, overflow: 'hidden', borderRight: '1px solid var(--glass-border)'}}>
                     <embed 
                        key="embed-split"
                        src={`http://localhost:8000/api/static/${project}/documento.pdf#page=${currentPage}`} 
                        type="application/pdf" 
                        width="100%" 
                        height="100%" 
                        style={{border: 'none'}}
                     />
                  </div>
                   <div className="row-cell" style={{overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 20px'}}>
                        <>
                          {currentSection?.text_blocks?.map((block, i) => {
                              const trad = translatedCache[`${currentPage}-${i}`];
                              return (
                                <div key={i} className={`translated-block ${trad ? '' : 'placeholder'}`} style={{padding: 16, background: 'rgba(255, 255, 255, 0.02)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.04)'}}>
                                    <p className="text-item" style={{color: trad ? '#f8fafc' : '#94a3b8', lineHeight: 1.6}}>
                                      {trad || "Traduzindo conteúdo automaticamente..."}
                                    </p>
                                </div>
                              );
                          })}

                          {currentSection?.images?.map((img, i) => {
                            const tradImg = imageCache[img];
                            return (
                              <div key={`img-${i}`} className="translated-block" style={{padding: 16, background: 'rgba(255, 255, 255, 0.02)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.04)'}}>
                                <img src={`http://localhost:8000/api/static/${project}/${img}`} alt="Figura" className="image-preview" style={{width: '100%', borderRadius: 8}} />
                                <div className="text-item" style={{marginTop: 12, color: '#f1f5f9', fontStyle: 'italic', background: 'rgba(2, 132, 199, 0.1)', padding: 12, borderRadius: 6}}>
                                  {tradImg || "👁️ Lendo conteúdo e texto da figura..."}
                                </div>
                              </div>
                            );
                          })}
                        </>
                  </div>
                </div>
              )}

              {/* Imagens se não estiver no modo PDF */}
              {leftViewType === 'text' && currentSection?.images?.map((img, i) => {
                const tradImg = imageCache[img];
                return (
                  <div key={i} className="workspace-row">
                    <div className="row-cell" onClick={() => handleTranslateImage(img)} style={{cursor: 'pointer'}}>
                      <img src={`http://localhost:8000/api/static/${img}`} alt="Figura extraída" className="image-preview" />
                      <p style={{fontSize: 11, color: 'var(--accent)', marginTop: 4, textAlign: 'center'}}>👁️ Clique na imagem para ler seu texto com IA</p>
                    </div>
                    <div className={`row-cell ${tradImg ? '' : 'translated placeholder'}`} style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                      {tradImg || "Aguardando leitura de imagem..."}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
