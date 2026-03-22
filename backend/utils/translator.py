import re

# Glossário de Termos de Administração que não devem ser traduzidos, mas explicados
GLOSSARY = {
    "supply chain": "Cadeia de Suprimentos",
    "marketing": "Estratégia de Mercado / Mercadologia",
    "core competence": "Competência Essencial",
    "framework": "Estrutura Conceitual / Matriz",
    "background": "Contextualização / Histórico",
    "pipeline": "Fluxo de Trabalho",
    "know-how": "Conhecimento Prático / Expertise",
    "benchmark": "Padrão de Referência",
    "brainstorming": "Tempestade de Ideias",
    "feedback": "Retorno / Avaliação",
    "bottom line": "Resultado Final / Lucro Líquido",
    "stakeholder": "Parte Interessada",
    "shareholder": "Acionista",
    "outsourcing": "Terceirização",
    "joint venture": "Empreendimento Conjunto",
    "lean": "Enxuto"
}

def translate_text(text: str, model_api=None) -> str:
    import os
    from google import genai
    from google.genai import types
    
    # Se houver chave Gemini no .env, usa o modelo para tradução real
    api_key = os.environ.get("GEMINI_API_KEY")
    translated_text = text
    
    if api_key:
         try:
              client = genai.Client(api_key=api_key)
              prompt = f"""Você é um tradutor acadêmico especialista em Administração. 
              Traduza o seguinte texto do MESTRADO para o Português do Brasil de forma RIGOROSA.
              
              REGRA CRÍTICA: Termos globais consagrados na Administração (ex: supply chain, marketing, framework, background, pipeline, benchmarking, lean, stakeholders) 
              NÃO devem ser traduzidos diretamente, mas sim mantidos em inglês e explicados brevemente em português entre parênteses.
              NUNCA deixe partes sem tradução.
              
              Texto para traduzir:
              {text}"""
              
              response = client.models.generate_content(
                   model='gemini-2.5-flash',
                   contents=prompt
              )
              translated_text = response.text
              return translated_text
         except Exception as e:
              # Fallback em caso de erro de API
              translated_text = text + f"\n\n[Erro na API do Gemini: {str(e)}]"
              return translated_text

    # Se não houver chave, usa o glossário como fallback (simulação atual)
    sorted_terms = sorted(GLOSSARY.keys(), key=len, reverse=True)
    for term in sorted_terms:
        # Match case insensitive
        pattern = re.compile(rf'\b{term}\b', re.IGNORECASE)
        explanation = GLOSSARY[term]
        # Adiciona a explicação em parênteses
        translated_text = pattern.sub(lambda m: f"{m.group(0)} ({explanation})", translated_text)
        
    return translated_text

def format_latex(translated_text: str, images_list=None, section_title="Módulo Traduzido") -> str:
    # 2. Formatação LaTeX com suporte a imagens
    latex = r"\section{" + section_title + r"}" + "\n\n"
    
    if images_list:
        for img_path in images_list:
            clean_path = img_path.replace("\\", "/")
            latex += r"\begin{figure}[H]" + "\n"
            latex += r"  \centering" + "\n"
            latex += r"  \includegraphics[width=0.8\textwidth]{" + clean_path + "}\n"
            latex += r"  \caption{Figura extraída}" + "\n"
            latex += r"\end{figure}" + "\n\n"
            
    # Formatar o texto traduzido
    clean_text = translated_text.replace("\n", " \n\n")
    latex += clean_text + "\n\n"
    
    return latex
