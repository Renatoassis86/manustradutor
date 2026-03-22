from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import shutil
from utils.pdf_processor import extract_content
from utils.translator import translate_text, format_latex

app = FastAPI(title="Manus Tradutor API")

# Configurar CORS para permitir que o frontend acesse o backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOCUMENTS_DIR = os.path.join(BASE_DIR, "documentos")
os.makedirs(DOCUMENTS_DIR, exist_ok=True)

# Mount static files to serve images loaded in frontend
app.mount("/api/static", StaticFiles(directory=DOCUMENTS_DIR), name="static")

@app.get("/")
def read_root():
    return {"status": "success", "message": "Academic Translator API está rodando!"}

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Somente arquivos PDF são suportados atualmente.")
        
    try:
        # Salvar o arquivo PDF carregado
        doc_name = os.path.splitext(file.filename)[0]
        # Sanitizar nome
        safe_name = "".join(c for c in doc_name if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
        upload_path = os.path.join(DOCUMENTS_DIR, f"{safe_name}.pdf")
        
        with open(upload_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
            
        # Processar e Extrair Conteúdo
        # Passaremos o BASE_DIR para criar a pasta de documentos lá dentro
        extraction_result = extract_content(upload_path, DOCUMENTS_DIR, safe_name)
        
        if "error" in extraction_result:
             raise HTTPException(status_code=500, detail=extraction_result["error"])
             
        import json
        with open(os.path.join(extraction_result["project_dir"], "structure.json"), "w", encoding="utf-8") as f:
            json.dump(extraction_result["sections"], f, ensure_ascii=False)
             
        return {
            "status": "success",
            "message": "Upload e extração concluídos com sucesso.",
            "project": safe_name,
            "project_dir": extraction_result["project_dir"],
            "sections": extraction_result["sections"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no processamento: {str(e)}")

@app.get("/api/load_project/{project}")
async def load_project(project: str):
    # Sanitizar nome
    safe_name = "".join(c for c in project if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
    structure_path = os.path.join(DOCUMENTS_DIR, safe_name, "structure.json")
    
    if not os.path.exists(structure_path):
        raise HTTPException(status_code=404, detail="Estrutura do projeto não encontrada localmente.")
        
    import json
    with open(structure_path, "r", encoding="utf-8") as f:
        sections = json.load(f)
        
    return {"sections": sections}

@app.post("/api/translate_section")
async def translate_section(data: dict):
    # Espera JSON com {"text": "Texto original"}
    text = data.get("text", "")
    if not text:
         raise HTTPException(status_code=400, detail="Texto não informado.")
         
    translated = translate_text(text)
    return {"translated": translated}

@app.post("/api/save_tex")
async def save_tex(data: dict):
    # Espera JSON com {"project": "nome_do_doc", "page": 1, "text": "Texto traduzido", "images": []}
    project = data.get("project")
    page = data.get("page")
    text = data.get("text", "")
    images = data.get("images", [])
    
    if not project or not page:
         raise HTTPException(status_code=400, detail="Dados incompletos.")
         
    safe_name = "".join(c for c in project if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
    tex_dir = os.path.join(DOCUMENTS_DIR, safe_name, "modulo_tex")
    
    if not os.path.exists(tex_dir):
         raise HTTPException(status_code=404, detail="Projeto não encontrado.")
         
    latex_content = format_latex(text, images, section_title=f"Módulo - Página {page}")
    file_path = os.path.join(tex_dir, f"modulo_pag_{page}.tex")
    
    try:
        with open(file_path, "w", encoding="utf-8") as f:
             f.write(latex_content)
        return {"status": "success", "file": f"modulo_pag_{page}.tex"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar arquivo tex: {str(e)}")

@app.get("/api/download_project/{project}")
async def download_project(project: str):
    import zipfile
    from fastapi.responses import FileResponse
    
    safe_name = "".join(c for c in project if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
    project_dir = os.path.join(DOCUMENTS_DIR, safe_name)
    
    if not os.path.exists(project_dir):
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
        
    zip_path = os.path.join(DOCUMENTS_DIR, f"{safe_name}.zip")
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(project_dir):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, project_dir)
                zipf.write(file_path, arcname)
                
    return FileResponse(zip_path, media_type='application/zip', filename=f"{safe_name}.zip")

# Se quiser rodar com python main.py
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
