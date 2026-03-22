import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { BookOpen, Upload, FileText, List, CheckCircle, FolderOpen } from 'lucide-react';
import { supabase } from './supabase';

export default function App() {
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [project, setProject] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [sections, setSections] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [translatedCache, setTranslatedCache] = useState({});
  const [view, setView] = useState('upload'); // 'upload', 'list', 'translate'
  const [pastProjects, setPastProjects] = useState([]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setPastProjects(data);
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
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
      setSections(response.data.sections);
      
      // Salvar projeto no Supabase
      const { data: projData, error } = await supabase
         .from('projects')
         .insert({ name: safeName, pdf_name: file.name })
         .select()
         .single();
         
      if (!error && projData) {
         setProjectId(projData.id);
         fetchProjects();
      }

      setView('translate');
      setIsLoading(false);
    } catch (error) {
      console.error("Upload error", error);
      setIsLoading(false);
      alert("Erro ao enviar PDF.");
    }
  };

  const handleTranslateBlock = async (text, blockIndex) => {
    try {
      const cacheKey = `${currentPage}-${blockIndex}`;
      if (translatedCache[cacheKey]) return;

      const response = await axios.post('http://localhost:8000/api/translate_section', { text });
      const translatedText = response.data.translated;

      setTranslatedCache(prev => ({
        ...prev,
        [cacheKey]: translatedText
      }));

      // Salva o bloco no Supabase
      if (projectId) {
         await supabase.from('sections').upsert({
             project_id: projectId,
             page_number: currentPage,
             block_index: blockIndex,
             original_text: text,
             translated_text: translatedText,
             is_approved: true
         }, { onConflict: 'project_id, page_number, block_index' });
      }
    } catch (error) {
      console.error("Translate error", error);
    }
  };

  const loadPastProject = async (proj) => {
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
  };

  const currentSection = sections.find(s => s.page === currentPage);

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="logo">
          <BookOpen /> Manus <span>Tradutor</span>
        </div>
        <div className="sidebar-content">
          <div className={`nav-item ${view === 'upload' ? 'active' : ''}`} onClick={() => setView('upload')}>
            <Upload size={18} /> Upload Novo
          </div>
          <div className={`nav-item ${view === 'list' ? 'active' : ''}`} onClick={() => { setView('list'); fetchProjects(); }}>
            <FolderOpen size={18} /> Textos Traduzidos
          </div>
          {view === 'translate' && project && (
            <div className={`nav-item active`}>
              <FileText size={18} /> {project}
            </div>
          )}
        </div>
      </aside>

      <main className="main-workspace">
        <header className="header">
          <h1>
            {view === 'upload' && "Novo Projeto"}
            {view === 'list' && "Textos Traduzidos"}
            {view === 'translate' && `Traduzindo: ${project}`}
          </h1>
          {view === 'translate' && <button className="btn-primary">Exportar .TEX / PDF</button>}
        </header>

        {view === 'upload' && (
          <div className="upload-container">
            <div className="upload-area" onClick={() => document.getElementById('file-input').click()}>
              <Upload className="upload-icon" size={48} />
              <p className="upload-title">Clique para fazer upload do seu PDF acadêmico (Max 100MB)</p>
              <p className="upload-subtitle">Formatos suportados: .pdf</p>
              <input 
                id="file-input" 
                type="file" 
                accept="application/pdf" 
                onChange={handleFileChange} 
                style={{ display: 'none' }} 
              />
              {file && <p style={{color: '#6366f1', fontWeight: 600}}>{file.name}</p>}
            </div>
            {file && <button className="btn-primary" style={{marginTop: 20}} onClick={handleUpload} disabled={isLoading}>{isLoading ? "Processando..." : "Iniciar Tradução"}</button>}
          </div>
        )}

        {view === 'list' && (
          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            {pastProjects.map(proj => (
              <div key={proj.id} className="content-block" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}} onClick={() => loadPastProject(proj)}>
                <div>
                  <h3 style={{margin: '0 0 4px 0', fontSize: 16}}>{proj.name}</h3>
                  <p style={{margin: 0, fontSize: 12, color: 'var(--text-muted)'}}>Original: {proj.pdf_name} | Criado em: {new Date(proj.created_at).toLocaleDateString()}</p>
                </div>
                <CheckCircle size={20} style={{color: 'var(--accent)'}} />
              </div>
            ))}
            {pastProjects.length === 0 && <p style={{color: 'var(--text-muted)'}}>Nenhum texto traduzido até o momento.</p>}
          </div>
        )}

        {view === 'translate' && (
          <>
            <div className="page-selector">
              {sections.map(s => (
                <button 
                  key={s.page} 
                  className={`page-btn ${s.page === currentPage ? 'active' : ''}`}
                  onClick={() => setCurrentPage(s.page)}
                >
                  Pág {s.page}
                </button>
              ))}
            </div>

            <div className="grid-workspace">
              <div className="panel">
                <div className="panel-header">Original (Página {currentPage})</div>
                <div style={{overflowY: 'auto', flex: 1}}>
                  {currentSection?.text_blocks.map((block, i) => (
                    <div 
                      key={i} 
                      className={`content-block ${translatedCache[`${currentPage}-${i}`] ? 'active' : ''}`}
                      onClick={() => handleTranslateBlock(
                        block.map(b => b.text).join(' '), i
                      )}
                    >
                      <p className="text-item">{block.map(b => b.text).join(' ')}</p>
                    </div>
                  ))}
                  {currentSection?.images.map((img, i) => (
                    <div key={i} className="content-block">
                        <img src={`http://localhost:8000/api/static/${img}`} alt="Figura" className="image-preview"/>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">Tradução</div>
                <div style={{overflowY: 'auto', flex: 1}}>
                   {currentSection?.text_blocks.map((block, i) => {
                     const trad = translatedCache[`${currentPage}-${i}`];
                     return (
                       <div key={i} className="content-block">
                         <p className="text-item" style={{color: trad ? '#f8fafc' : '#94a3b8'}}>
                           {trad || "Clique no bloco ao lado..."}
                         </p>
                       </div>
                     );
                   })}
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
