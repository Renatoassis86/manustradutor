import fitz  # PyMuPDF
import os
import json

def create_project_folders(base_path, doc_name):
    # Sanitize name
    safe_name = "".join(c for c in doc_name if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
    project_dir = os.path.join(base_path, safe_name)
    tex_dir = os.path.join(project_dir, "modulo_tex")
    img_dir = os.path.join(project_dir, "imagens")
    
    os.makedirs(tex_dir, exist_ok=True)
    os.makedirs(img_dir, exist_ok=True)
    
    return project_dir, tex_dir, img_dir

def extract_content(pdf_path: str, output_base_dir: str, doc_name: str):
    project_dir, tex_dir, img_dir = create_project_folders(output_base_dir, doc_name)
    
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        return {"error": f"Erro ao abrir o PDF: {str(e)}"}
        
    sections = []
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        
        # 1. Extract Images
        images_list = page.get_images(full=True)
        img_map = {}
        for img_idx, img in enumerate(images_list):
            xref = img[0]
            base_image = doc.extract_image(xref)
            img_bytes = base_image["image"]
            ext = base_image["ext"]
            
            img_filename = f"image_p{page_num+1}_{img_idx+1}.{ext}"
            img_path = os.path.join(img_dir, img_filename)
            
            with open(img_path, "wb") as f:
                f.write(img_bytes)
                
            img_map[img_idx] = os.path.join("imagens", img_filename)

        # 2. Extract Text with Font Structure
        try:
            dict_data = page.get_text("dict")
        except:
            dict_data = {}
            
        blocks = dict_data.get("blocks", [])
        page_text = []
        
        for b in blocks:
            if b.get("type") == 0:  # text block
                block_text = []
                for line in b.get("lines", []):
                    for span in line.get("spans", []):
                        text = span.get("text", "").strip()
                        size = span.get("size", 10)
                        font = span.get("font", "")
                        flags = span.get("flags", 0)
                        
                        if text:
                            block_text.append({
                                "text": text,
                                "size": size,
                                "font": font,
                                "bold": bool(flags & 16), # Bit 4
                                "italic": bool(flags & 2)  # Bit 1
                            })
                if block_text:
                    page_text.append(block_text)
            
        sections.append({
            "page": page_num + 1,
            "text_blocks": page_text,
            "images": list(img_map.values())
        })
        
    return {
        "project_dir": project_dir,
        "sections": sections
    }
