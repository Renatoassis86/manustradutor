import { useState } from 'react';
import axios from 'axios';
import './App.css';
import { BookOpen, Upload, FileText, CheckCircle, ArrowRight } from 'lucide-react';

export default function App() {
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [project, setProject] = useState(null);
  const [sections, setSections] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [translatedCache, setTranslatedCache] = useState({});

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
      setProject(response.data.project);
      setSections(response.data.sections);
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
      if (translatedCache[cacheKey]) return; // usar cache

      const response = await axios.post('http://localhost:8000/api/translate_section', { text });
      setTranslatedCache(prev => ({
        ...prev,
        [cacheKey]: response.data.translated
      }));
    } catch (error) {
      console.error("Translate error", error);
    }
  };

  const currentSection = sections.find(s => s.page === currentPage);

  return (
    <div className="dashboard-container">
      <aside className="sidebar">
        <div className="logo">
          <BookOpen /> Manus <span>Tradutor</span>
        </div>
        <div className="sidebar-content">
          <div className={`nav-item ${!project ? 'active' : ''}`}>
            <Upload size={18} /> Upload
          </div>
          {project && (
            <div className={`nav-item active`}>
              <FileText size={18} /> {project}
            </div>
          )}
        </div>
      </aside>

      <main className="main-workspace">
        <header className="header">
          <h1>{project ? `Traduzindo: ${project}` : "Novo Projeto"}</h1>
          {project && <button className="btn-primary">Exportar .TEX / PDF</button>}
        </header>

        {!project ? (
          <div className="upload-container">
            <div className="upload-area" onClick={() => document.getElementById('file-input').click()}>
              <Upload className="upload-icon" size={48} />
              <p className="upload-title">Clique para fazer upload do seu PDF acadêmico</p>
              <p className="upload-subtitle">Formatos suportados: .pdf (Máx 50MB)</p>
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
        ) : (
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
                <div className="panel-header">Documento Original (Página {currentPage})</div>
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
                        <img src={`http://localhost:8000/api/static/${img}`} alt="Figura extraída" className="image-preview"/>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">Tradução Manus-Alizada</div>
                <div style={{overflowY: 'auto', flex: 1}}>
                   {currentSection?.text_blocks.map((block, i) => {
                     const trad = translatedCache[`${currentPage}-${i}`];
                     return (
                       <div key={i} className="content-block">
                         <p className="text-item" style={{color: trad ? '#f8fafc' : '#94a3b8'}}>
                           {trad || "Clique no bloco da esquerda para iniciar a tradução..."}
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
