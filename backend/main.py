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
    # Espera JSON com {"text": "Texto original", "provider": "gemini" ou "openai"}
    text = data.get("text", "")
    provider = data.get("provider", "gemini")
    
    if not text:
         raise HTTPException(status_code=400, detail="Texto não informado.")
         
    translated = translate_text(text, provider=provider)
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

@app.post("/api/translate_image")
async def translate_image(data: dict):
    # Espera {"img_path": "imagens/image_p1_1.png", "provider": "gemini"}
    img_path = data.get("img_path", "")
    provider = data.get("provider", "gemini")
    
    if not img_path:
        raise HTTPException(status_code=400, detail="Caminho da imagem não informado.")
        
    full_path = os.path.join(DOCUMENTS_DIR, img_path)
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Imagem não encontrada no servidor.")
        
    import os
    from google import genai
    from PIL import Image
    
    # Prompt de Visão
    prompt = """Você é um tradutor acadêmico. Leia o texto contido nesta imagem, gráfico ou figura.
    Traduza todo o texto visível para o Português do Brasil com rigor acadêmico.
    Se for um gráfico, descreva os eixos e as principais informações traduzidas.
    Apresente a tradução de forma estruturada."""
    
    # 1. Usando Gemini (Suporte nativo a multimodal)
    if provider == "gemini":
         api_key = os.environ.get("GEMINI_API_KEY")
         if not api_key:
              return {"translated": "Chave Gemini não encontrada no servidor."}
         try:
              client = genai.Client(api_key=api_key)
              img = Image.open(full_path)
              response = client.models.generate_content(
                  model='gemini-2.5-pro',
                  contents=[img, prompt]
              )
              return {"translated": response.text}
         except Exception as e:
              return {"translated": f"[Erro no Gemini Visão: {str(e)}]"}
              
    # 2. Usando OpenAI (GPT-4o)
    elif provider == "openai":
         import openai
         import base64
         api_key = os.environ.get("GPT_API_KEY")
         if not api_key:
              return {"translated": "Chave GPT não encontrada no servidor."}
         try:
              def encode_image(path):
                  with open(path, "rb") as image_file:
                      return base64.b64encode(image_file.read()).decode('utf-8')
              
              base64_image = encode_image(full_path)
              client = openai.OpenAI(api_key=api_key)
              response = client.chat.completions.create(
                  model="gpt-4o",
                  messages=[{
                      "role": "user",
                      "content": [
                          {"type": "text", "text": prompt},
                          {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                      ]
                  }]
              )
              return {"translated": response.choices[0].message.content}
         except Exception as e:
              return {"translated": f"[Erro no ChatGPT Visão: {str(e)}]"}
              
    return {"translated": "Funcionalidade de visão não suportada para este provedor."}

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
