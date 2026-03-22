import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { BookOpen, Upload, FileText, FolderOpen, Printer, CheckCircle } from 'lucide-react';
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
  const [leftViewType, setLeftViewType] = useState('text'); // 'text' | 'pdf'
  const [provider, setProvider] = useState('gemini'); // 'gemini' | 'openai'
  const [imageCache, setImageCache] = useState({}); // Cache para visão
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

  const handleTranslateImage = async (imgPath) => {
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
            <Upload size={18} /> Novo Texto
          </div>
          <div className={`nav-item ${view === 'list' ? 'active' : ''}`} onClick={() => { setView('list'); fetchProjects(); }}>
            <FolderOpen size={18} /> Textos Traduzidos
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
          <div className="upload-container">
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
            {file && <button className="btn-primary" style={{marginTop: 20}} onClick={handleUpload} disabled={isLoading}>{isLoading ? "Processando..." : "Iniciar Tradução"}</button>}
          </div>
        )}

        {view === 'list' && (
          <div style={{display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto'}}>
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

            <div className="workspace-container">
              {leftViewType === 'pdf' ? (
                /* 📖 VISUALIZAÇÃO PDF DO DOCUMENTO ORIGINAL */
                <div className="workspace-row" style={{height: '100%'}}>
                  <div className="row-cell" style={{height: '100%', padding: 0, overflow: 'hidden'}}>
                     <embed 
                        src={`http://localhost:8000/api/static/${project}.pdf#page=${currentPage}`} 
                        type="application/pdf" 
                        width="100%" 
                        height="100%" 
                        style={{border: 'none', borderRadius: 12}}
                     />
                  </div>
                  <div className="row-cell" style={{overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12}}>
                     <button 
                        className="btn-primary" 
                        style={{marginBottom: 10, alignSelf: 'center'}}
                        onClick={() => {
                           currentSection?.text_blocks.forEach((block, i) => {
                             const text = block.map(b => b.text).join(' ');
                             handleTranslateBlock(text, i);
                           });
                        }}
                     >
                        Traduzir Página Toda
                     </button>
                     {currentSection?.text_blocks.map((block, i) => {
                         const trad = translatedCache[`${currentPage}-${i}`];
                         return (
                           <div key={i} className={`translated-block ${trad ? '' : 'placeholder'}`} style={{padding: 16, background: 'rgba(2, 132, 199, 0.04)', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.03)'}}>
                               <p className="text-item" style={{color: trad ? '#f8fafc' : '#94a3b8'}}>
                                 {trad || "Traduzindo..."}
                               </p>
                           </div>
                         );
                     })}
                  </div>
                </div>
              ) : (
                /* 📊 VISUALIZAÇÃO TABULAR POR BLOCOS (VETORIZAÇÃO) */
                currentSection?.text_blocks.map((block, i) => {
                  const originalText = block.map(b => b.text).join(' ');
                  const trad = translatedCache[`${currentPage}-${i}`];
                  
                  return (
                    <div key={i} className="workspace-row">
                      <div className="row-cell original" onClick={() => handleTranslateBlock(originalText, i)}>
                        {originalText}
                      </div>
                      <div className={`row-cell ${trad ? 'translated' : 'translated placeholder'}`}>
                        {trad || "Clique no bloco ao lado para traduzir..."}
                      </div>
                    </div>
                  );
                })
              )}

              {/* Imagens se não estiver no modo PDF */}
              {leftViewType === 'text' && currentSection?.images.map((img, i) => {
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
          </>
        )}
      </main>
    </div>
  );
}
